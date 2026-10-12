import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ConfirmService } from '../../core/services/confirm.service';
import { HorsLigneService, SaisieEnAttente } from '../../core/hors-ligne/hors-ligne.service';
import { ReseauService } from '../../core/hors-ligne/reseau.service';
import { libelleRegimePoste } from '../../features/espace-poste/poste-facturation';

/**
 * Patients enregistrés hors ligne qui n'ont pas encore rejoint leur facture : « Mes factures »
 * les montre au-dessus des mois, avec leur état. Ils partent seuls au retour du réseau ; une
 * saisie refusée par le serveur affiche son motif et peut être renvoyée ou supprimée.
 */
@Component({
  selector: 'app-saisies-en-attente',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div *ngIf="(horsLigne.saisies$ | async) as saisies">
      <div *ngIf="saisies.length" class="card">
        <div class="section-header">
          <div class="section-title-group">
            <div class="section-icon"><mat-icon>schedule_send</mat-icon></div>
            <div>
              <h2>Enregistrés hors ligne, en attente d'envoi</h2>
              <p>Ils rejoindront leur facture d'eux-mêmes au retour de la connexion.</p>
            </div>
          </div>
          <span *ngIf="horsLigne.synchronisation$ | async" class="ml-auto inline-flex items-center gap-2 text-[12.5px] text-text-secondary">
            <mat-spinner diameter="16" class="!m-0"></mat-spinner> Envoi…
          </span>
        </div>
        <div class="section-body flex flex-col gap-2">
          <div *ngFor="let s of saisies; trackBy: parId"
               class="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 px-3 rounded-lg border text-[13px]"
               [ngClass]="s.etat === 'ERREUR' ? 'border-red-200 bg-warn-light' : 'border-border bg-white'">
            <mat-icon class="shrink-0 !text-xl !w-5 !h-5"
                      [ngClass]="s.etat === 'ERREUR' ? 'text-warn' : 'text-amber-600'">
              {{ s.etat === 'ERREUR' ? 'error_outline' : 'cloud_upload' }}
            </mat-icon>
            <div class="flex-1 min-w-[200px]">
              <strong class="block text-text-primary">{{ s.resume.patient || 'Patient' }}</strong>
              <span class="text-text-secondary">
                {{ libelleRegime(s.resume.regime) }} · soins du {{ s.resume.dateSoins | date:'dd/MM/yyyy' }}
                <ng-container *ngIf="s.resume.montant"> · {{ s.resume.montant | number:'1.0-0':'fr' }} F</ng-container>
                <ng-container *ngIf="s.resume.partiel"> · à compléter</ng-container>
              </span>
              <span *ngIf="s.reporteDepuis" class="block text-[12px] text-amber-800">
                Reporté sur le mois en cours ({{ s.reporteDepuis }} déjà clôturé).
              </span>
              <span *ngIf="s.etat === 'ERREUR'" class="block mt-0.5 font-semibold text-red-700">Refusé : {{ s.erreur }}</span>
            </div>
            <span *ngIf="s.etat === 'EN_ATTENTE'" class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[11.5px] font-bold">
              En attente du réseau
            </span>
            <div *ngIf="s.etat === 'ERREUR'" class="flex gap-1.5">
              <button type="button" class="btn btn-outline btn-sm" [disabled]="!reseau.enLigne" (click)="reessayer(s)">
                <mat-icon>refresh</mat-icon> Réessayer
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="supprimer(s)" aria-label="Supprimer cette saisie">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class SaisiesEnAttenteComponent {
  readonly libelleRegime = libelleRegimePoste;

  constructor(public horsLigne: HorsLigneService, public reseau: ReseauService, private confirm: ConfirmService) {}

  parId = (_: number, s: SaisieEnAttente) => s.id;

  reessayer(saisie: SaisieEnAttente) {
    void this.horsLigne.reessayer(saisie);
  }

  supprimer(saisie: SaisieEnAttente) {
    this.confirm.ask({
      title: 'Supprimer cette saisie ?',
      message: `${saisie.resume.patient || 'Ce patient'} a été refusé par le serveur et n'a été ajouté à aucune facture. `
        + 'Supprimée, la saisie est définitivement perdue : ressaisissez le patient si nécessaire.',
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (ok) void this.horsLigne.supprimerSaisie(saisie.id);
    });
  }
}
