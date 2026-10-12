import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { last } from 'rxjs/operators';
import { DocumentComplementaire, DossierPatient, FactureStructure } from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { libelleRegimePoste } from '../poste-facturation';
import { DossierPatientContenuComponent } from './dossier-patient-contenu.component';

export interface DossierPatientDialogData {
  facture: FactureStructure;
  dossier: DossierPatient;
  /** Pièces déjà rattachées au patient par l'écran appelant (lettre de garantie, ticket…). */
  documents?: DocumentComplementaire[];
  /** Feuille de soins du patient (circuit BCSU), imprimable depuis le dossier. */
  feuilleSoins?: { id: string; numero: string };
}

/**
 * « Dossier patient » en modale : la photo du porteur (carte CSU) à côté de son nom, puis
 * les pièces et documents du dossier ({@link DossierPatientContenuComponent}).
 */
@Component({
  selector: 'app-dossier-patient-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, DossierPatientContenuComponent],
  template: `
    <div class="flex items-start justify-between gap-3 px-5 pt-5">
      <div class="flex items-start gap-3 min-w-0">
        <!-- Photo du porteur, reprise de la carte CSU au contrôle d'éligibilité -->
        <ng-container *ngIf="aPhoto">
          <button type="button" *ngIf="photoAssure" (click)="apercu = photoAssure"
                  class="shrink-0 w-14 h-[68px] p-0 rounded-lg overflow-hidden border border-border bg-field cursor-zoom-in"
                  aria-label="Agrandir la photo de l'assuré">
            <img [src]="photoAssure" alt="Photo de l'assuré" class="w-full h-full object-cover">
          </button>
          <span *ngIf="!photoAssure" class="shrink-0 w-14 h-[68px] rounded-lg border border-border bg-field
                                            inline-flex items-center justify-center">
            <mat-spinner *ngIf="!photoIllisible" diameter="18"></mat-spinner>
            <mat-icon *ngIf="photoIllisible" class="text-text-muted">person</mat-icon>
          </span>
        </ng-container>
        <div class="min-w-0">
          <h2 class="m-0 text-[17px] font-bold text-text-primary truncate">Dossier patient</h2>
          <p class="m-0 mt-0.5 text-[13px] text-text-secondary truncate">
            {{ data.dossier.prenom }} {{ data.dossier.nom }} · {{ libelleRegime(data.facture.regime) }}
            <ng-container *ngIf="data.dossier.lettreGarantieNumero"> · lettre {{ data.dossier.lettreGarantieNumero }}</ng-container>
          </p>
          <p *ngIf="data.dossier.matricule" class="m-0 mt-0.5 text-[12.5px] text-text-muted font-mono truncate">
            {{ data.dossier.matricule }}
          </p>
        </div>
      </div>
      <button type="button" mat-dialog-close aria-label="Fermer"
              class="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-lg text-text-secondary hover:bg-field">
        <mat-icon>close</mat-icon>
      </button>
    </div>

    <mat-dialog-content class="!px-5 !pb-5">
      <!-- Photo du porteur en grand -->
      <div *ngIf="apercu">
        <button type="button" class="btn btn-ghost btn-sm mt-2 mb-2" (click)="apercu = null">
          <mat-icon>arrow_back</mat-icon> Retour au dossier
        </button>
        <img [src]="apercu" alt="Photo de l'assuré" class="block w-full rounded-lg border border-border bg-white">
      </div>
      <!-- Masqué plutôt que retiré : les pièces déjà lues ne sont pas rechargées au retour -->
      <div class="mt-3" [class.hidden]="!!apercu">
        <app-dossier-patient-contenu [facture]="data.facture" [dossier]="data.dossier"
                                     [documents]="data.documents" [feuilleSoins]="data.feuilleSoins"></app-dossier-patient-contenu>
      </div>
    </mat-dialog-content>
  `
})
export class DossierPatientDialogComponent implements OnInit {
  readonly libelleRegime = libelleRegimePoste;
  /** Le dossier a une photo du porteur (carte CSU), affichée à part, à côté du nom. */
  aPhoto = false;
  photoAssure: string | null = null;
  photoIllisible = false;
  /** Photo du porteur affichée en grand. */
  apercu: string | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DossierPatientDialogData,
    public dialogRef: MatDialogRef<DossierPatientDialogComponent>,
    private structureService: StructureService
  ) {}

  ngOnInit() {
    const { facture, dossier } = this.data;
    this.aPhoto = (dossier.pieces || []).includes('PHOTO_ASSURE');
    if (this.aPhoto) {
      this.structureService.getPiece(facture.id, dossier.id, 'PHOTO_ASSURE').pipe(last()).subscribe({
        next: lue => this.photoAssure = lue.image,
        error: () => this.photoIllisible = true
      });
    }
  }
}
