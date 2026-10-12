import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PaginationComponent } from '../pagination/pagination.component';
import { PaginerPipe } from '../pagination/paginer.pipe';

/** Pastille à côté du nom d'un patient. */
export interface PastillePatient {
  libelle: string;
  ton: 'ambre' | 'vert' | 'primaire';
  titre?: string;
}

/** Une ligne de la liste : un patient pour une visite (un rendez-vous). */
export interface LignePatientListe {
  /** Identité stable de la ligne (suivi du rendu). */
  cle: string;
  nom: string;
  /** Deuxième colonne : la date de la visite (ou, à défaut, ce qui en tient lieu). */
  date: string;
  matricule?: string;
  /** Écran de détail du patient. */
  lien: any[];
  pastilles: PastillePatient[];
  /** Identité validée par le contrôle d'éligibilité. */
  identiteVerifiee?: boolean;
  /** Ligne teintée : à compléter (ambre) ou pointée « vérifiée » (vert). */
  teinte?: 'ambre' | 'vert';
}

/** Où en était la liste quand un patient a été ouvert (pour y revenir). */
export interface PositionListe {
  page: number;
  taille: number;
}

/**
 * Liste des patients d'une facture, identique partout (poste, centre, service régional,
 * pharmacie) : un tableau sans en-tête, une ligne par visite — nom et prénom, date, matricule.
 * Un clic sur la ligne ouvre l'écran de détail du patient, d'où « Retour » revient ici.
 * Aucune action dans la liste : elles sont sur l'écran du patient. Pas de photo.
 */
@Component({
  selector: 'app-liste-patients-facture',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, PaginationComponent, PaginerPipe],
  template: `
    <div *ngIf="lignes.length === 0" class="py-8 text-center text-text-muted text-[13.5px]">{{ vide }}</div>

    <div *ngIf="lignes.length" class="overflow-x-auto rounded-lg border border-border">
      <table class="w-full text-[13.5px] border-collapse">
        <tbody>
          <tr *ngFor="let l of lignes | paginer: pg.page : pg.taille; trackBy: parCle" (click)="ouvrir(l)"
              class="cursor-pointer border-b border-border-light last:border-b-0 transition-colors hover:bg-field"
              [ngClass]="l.teinte === 'vert' ? 'bg-success-light' : (l.teinte === 'ambre' ? 'bg-amber-50' : 'bg-white')">
            <td class="py-2.5 px-3 align-middle">
              <!-- Lien pour le clavier et l'ouverture dans un nouvel onglet ; la ligne entière ouvre aussi. -->
              <a [routerLink]="l.lien" [queryParams]="queryParams" [state]="etatOuverture" (click)="$event.stopPropagation(); signaler()"
                 class="font-semibold text-text-primary text-[14px] no-underline hover:underline">{{ l.nom }}</a>
              <mat-icon *ngIf="l.identiteVerifiee" class="!text-base !w-4 !h-4 align-middle ml-1 text-success"
                        title="Identité validée par le contrôle d'éligibilité">verified_user</mat-icon>
              <span *ngIf="l.pastilles.length" class="inline-flex flex-wrap items-center gap-1 ml-1 align-middle">
                <span *ngFor="let p of l.pastilles" [attr.title]="p.titre || null"
                      class="px-2 py-0.5 rounded-full text-[11px] font-bold" [ngClass]="classePastille[p.ton]">{{ p.libelle }}</span>
              </span>
              <!-- Sur téléphone, la date et le matricule passent sous le nom -->
              <div class="sm:hidden mt-0.5 text-[12.5px] text-text-secondary">
                {{ l.date }}<span *ngIf="l.matricule"> · <span class="font-mono">{{ l.matricule }}</span></span>
              </div>
            </td>
            <td class="hidden sm:table-cell py-2.5 px-2 align-middle whitespace-nowrap text-text-secondary">{{ l.date }}</td>
            <td class="hidden sm:table-cell py-2.5 pl-2 pr-1 align-middle text-right whitespace-nowrap font-mono text-[13px] text-text-primary">
              {{ l.matricule || '—' }}
            </td>
            <td class="py-2.5 pl-1 pr-3 w-8 align-middle">
              <mat-icon class="!text-xl !w-5 !h-5 text-text-muted">chevron_right</mat-icon>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <app-pagination #pg [total]="lignes.length" [page]="page" [taille]="taille" [tailles]="tailles"></app-pagination>
  `
})
export class ListePatientsFactureComponent {
  @Input() lignes: LignePatientListe[] = [];
  /** Paramètres gardés en ouvrant un patient (mode de la facture…). */
  @Input() queryParams: Params | null = null;
  /**
   * Page et taille de départ (retour depuis un patient). 10 patients par page, la règle du
   * projet (demande du 07/10/2026) : la barre de pagination paraît dès la 11e ligne.
   */
  @Input() page = 0;
  @Input() taille = 10;
  @Input() tailles: number[] = [10, 25, 50];
  @Input() vide = 'Aucun patient sur cette facture.';
  /** Un patient va s'ouvrir : l'écran mémorise sa position pour le retour. */
  @Output() ouverture = new EventEmitter<PositionListe>();

  @ViewChild('pg') pg?: PaginationComponent;

  /** L'écran patient sait qu'on vient de la liste : son « Retour » revient par l'historique. */
  readonly etatOuverture = { depuisFacture: true };

  readonly classePastille: Record<PastillePatient['ton'], string> = {
    ambre: 'bg-amber-100 text-amber-800',
    vert: 'bg-success-light text-success',
    primaire: 'bg-primary-light text-primary'
  };

  constructor(private router: Router) {}

  parCle(_i: number, l: LignePatientListe): string {
    return l.cle;
  }

  /** Recherche ou filtre changé : retour à la première page. */
  premierePage() {
    this.pg?.aller(0);
  }

  signaler() {
    this.ouverture.emit({ page: this.pg?.pageCourante ?? 0, taille: this.pg?.taille ?? this.taille });
  }

  ouvrir(l: LignePatientListe) {
    this.signaler();
    this.router.navigate(l.lien, { queryParams: this.queryParams, state: this.etatOuverture });
  }
}
