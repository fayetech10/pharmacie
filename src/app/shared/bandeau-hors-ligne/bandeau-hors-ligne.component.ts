import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { combineLatest, map } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { HorsLigneService } from '../../core/hors-ligne/hors-ligne.service';
import { InstallationService } from '../../core/hors-ligne/installation.service';
import { ReseauService, estErreurReseau } from '../../core/hors-ligne/reseau.service';

/**
 * Bandeau du mode hors ligne (postes et centres de santé), sous la barre du haut :
 * proposition d'installer l'application, état du réseau, saisies en attente d'envoi,
 * reconnexion quand la session ouverte hors ligne a expiré.
 *
 * <p>Il démarre aussi la synchronisation automatique et prépare l'appareil (catalogue des
 * prestations, lecture des CNI) tant que le réseau est là.</p>
 */
@Component({
  selector: 'app-bandeau-hors-ligne',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <!-- Installation (première connexion sur l'appareil) : toujours une explication, jamais le silence -->
    <ng-container [ngSwitch]="installation.situation">
      <div *ngSwitchCase="'http'"
           class="flex flex-wrap items-center gap-3 px-3 md:px-6 py-3 bg-amber-50 border-b border-amber-200 text-[13px] text-amber-900">
        <mat-icon class="shrink-0">no_encryption</mat-icon>
        <div class="flex-1 min-w-[220px]">
          <strong class="block text-[13.5px]">Installation et mode hors ligne indisponibles à cette adresse</strong>
          L'application est ouverte en <span class="font-mono">{{ installation.adresse }}</span>. Les navigateurs n'autorisent
          l'installation et le travail sans connexion que sur une adresse sécurisée (<strong>https://</strong>).
          Demandez à l'administrateur l'adresse en https:// de l'application.
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="plusTard()">Compris</button>
      </div>

      <div *ngSwitchCase="'developpement'"
           class="flex flex-wrap items-center gap-3 px-3 md:px-6 py-3 bg-field border-b border-border text-[13px] text-text-secondary">
        <mat-icon class="shrink-0">code</mat-icon>
        <div class="flex-1 min-w-[220px]">
          <strong class="block text-[13.5px] text-text-primary">Version de développement : pas de mode hors ligne</strong>
          L'installation et le travail sans connexion n'existent que dans la version déployée (build de production),
          ouverte en https:// ou sur http://localhost.
        </div>
        <button type="button" class="btn btn-ghost btn-sm" (click)="plusTard()">Compris</button>
      </div>

      <div *ngIf="['bouton', 'ios', 'manuel'].includes(installation.situation)"
           class="flex flex-wrap items-center gap-3 px-3 md:px-6 py-3 bg-primary-light border-b border-primary-200 text-[13px] text-text-primary">
        <span class="w-9 h-9 shrink-0 rounded-lg bg-primary text-white flex items-center justify-center">
          <mat-icon class="!text-xl !w-5 !h-5">install_mobile</mat-icon>
        </span>
        <div class="flex-1 min-w-[220px]">
          <strong class="block text-[13.5px]">Installez l'application sur cet appareil</strong>
          <span *ngIf="installation.situation === 'bouton'">Elle fonctionnera aussi sans connexion pour les enfants de
            moins de 5 ans et le Plan Sésame ; les saisies partiront d'elles-mêmes au retour du réseau.</span>
          <span *ngIf="installation.situation === 'ios'">Sur iPhone : touchez
            <mat-icon class="!text-base !w-4 !h-4 align-text-bottom">ios_share</mat-icon> <strong>Partager</strong>, puis
            <strong>« Sur l'écran d'accueil »</strong>. L'application fonctionnera aussi sans connexion.</span>
          <span *ngIf="installation.situation === 'manuel'">Ouvrez le menu du navigateur
            (<mat-icon class="!text-base !w-4 !h-4 align-text-bottom">more_vert</mat-icon>) puis
            <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.
            Elle fonctionnera aussi sans connexion. Déjà installée ? Ouvrez-la depuis son icône.</span>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost btn-sm" (click)="plusTard()">Plus tard</button>
          <button *ngIf="installation.situation === 'bouton'" type="button" class="btn btn-primary btn-sm" (click)="installer()">
            <mat-icon>download</mat-icon> Installer
          </button>
        </div>
      </div>
    </ng-container>

    <!-- État hors ligne / envoi des saisies -->
    <ng-container *ngIf="etat$ | async as e">
      <div *ngIf="e.message" role="status" aria-live="polite"
           class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 md:px-6 py-2.5 border-b text-[13px]"
           [ngClass]="e.ton === 'hors-ligne' ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : e.ton === 'erreur' ? 'bg-warn-light border-red-200 text-red-800'
                    : 'bg-primary-light border-primary-200 text-primary-dark'">
        <mat-spinner *ngIf="e.ton === 'envoi'" diameter="16" class="!m-0"></mat-spinner>
        <mat-icon *ngIf="e.ton !== 'envoi'" class="shrink-0 !text-lg !w-[18px] !h-[18px]">{{ e.icone }}</mat-icon>
        <span class="flex-1 min-w-[200px]">{{ e.message }}</span>
        <button *ngIf="e.action === 'reconnecter'" type="button" class="btn btn-primary btn-sm" (click)="reconnecter()">
          <mat-icon>login</mat-icon> Se reconnecter
        </button>
        <button *ngIf="e.action === 'envoyer'" type="button" class="btn btn-outline btn-sm" (click)="envoyer()">
          <mat-icon>sync</mat-icon> Envoyer maintenant
        </button>
        <button *ngIf="e.action === 'voir'" type="button" class="btn btn-outline btn-sm" (click)="voirMesFactures()">
          Voir
        </button>
      </div>
    </ng-container>
  `
})
export class BandeauHorsLigneComponent implements OnInit, OnDestroy {

  readonly etat$ = combineLatest([
    this.reseau.enLigne$, this.horsLigne.saisies$, this.horsLigne.synchronisation$, this.auth.reconnexionRequise$
  ]).pipe(map(([enLigne, saisies, envoi, reconnexion]) => {
    const attente = saisies.filter(s => s.etat === 'EN_ATTENTE').length;
    const erreurs = saisies.filter(s => s.etat === 'ERREUR').length;
    const patients = (n: number) => `${n} patient${n > 1 ? 's' : ''}`;
    if (!enLigne) {
      return {
        ton: 'hors-ligne', icone: 'cloud_off', action: null,
        message: 'Hors ligne — vous pouvez facturer les enfants de moins de 5 ans et le Plan Sésame.'
          + (attente ? ` ${patients(attente)} en attente d'envoi.` : '')
      };
    }
    if (reconnexion && attente) {
      return {
        ton: 'erreur', icone: 'lock_clock', action: 'reconnecter',
        message: `Connexion rétablie. Reconnectez-vous pour envoyer ${patients(attente)} enregistré${attente > 1 ? 's' : ''} hors ligne.`
      };
    }
    if (envoi) {
      return { ton: 'envoi', icone: 'sync', action: null, message: `Envoi des patients enregistrés hors ligne…` };
    }
    if (attente) {
      return { ton: 'info', icone: 'schedule_send', action: 'envoyer', message: `${patients(attente)} en attente d'envoi.` };
    }
    if (erreurs) {
      return {
        ton: 'erreur', icone: 'error_outline', action: 'voir',
        message: `${patients(erreurs)} enregistré${erreurs > 1 ? 's' : ''} hors ligne n'${erreurs > 1 ? 'ont' : 'a'} pas pu être envoyé${erreurs > 1 ? 's' : ''}.`
      };
    }
    return { ton: 'info', icone: '', action: null, message: '' };
  }));

  constructor(
    public installation: InstallationService,
    private horsLigne: HorsLigneService,
    private reseau: ReseauService,
    private auth: AuthService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit() {
    this.horsLigne.demarrer();
    this.horsLigne.preparer();
  }

  ngOnDestroy() {
    this.horsLigne.arreter();
  }

  async installer() {
    const acceptee = await this.installation.installer();
    if (acceptee) {
      this.snackBar.open('Application installée : retrouvez « CSU Sénégal » sur l\'écran d\'accueil.', 'Fermer', { duration: 6000 });
    }
  }

  plusTard() {
    this.installation.plusTard();
  }

  envoyer() {
    void this.horsLigne.synchroniser();
  }

  voirMesFactures() {
    if (this.auth.isPosteDeSante()) {
      this.router.navigate(['/dashboard/espace-poste'], { queryParams: { tab: 2 } });
    } else {
      this.router.navigate(['/dashboard/espace-centre'], { queryParams: { tab: 3 } });
    }
  }

  /** Session hors ligne expirée : on se reconnecte sur place, sans perdre l'écran en cours. */
  reconnecter() {
    this.confirm.prompt({
      title: 'Se reconnecter',
      message: 'Votre session ouverte hors ligne a expiré. Entrez votre mot de passe pour envoyer les patients '
        + 'enregistrés sur cet appareil.',
      label: 'Mot de passe',
      motDePasse: true,
      required: true,
      confirmText: 'Se reconnecter'
    }).subscribe(motDePasse => {
      if (!motDePasse) return;
      this.auth.reconnecter(motDePasse).subscribe({
        next: () => this.snackBar.open('Reconnecté : envoi des saisies en cours.', 'Fermer', { duration: 4000 }),
        error: err => this.snackBar.open(estErreurReseau(err?.status)
          ? 'Le serveur ne répond pas : réessayez dans un instant.'
          : 'Mot de passe incorrect.', 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
      });
    });
  }
}
