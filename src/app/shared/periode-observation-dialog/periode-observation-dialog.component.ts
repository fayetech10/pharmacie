import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface PeriodeObservationData {
  /** Nom complet du bénéficiaire, s'il est connu. */
  nomComplet?: string;
  /** Date d'ouverture des droits, déjà formatée « JJ/MM/AAAA ». */
  dateDebutDroits?: string;
}

/**
 * Avertissement plein écran : le bénéficiaire est encore dans sa période d'observation,
 * la prise en charge n'est pas ouverte. Bloquant et impossible à manquer — à la différence
 * du bandeau en ligne précédent.
 *
 * Ouvrir avec une config plein écran et la classe de panneau `dialog-periode-observation` :
 * `{ width: '100vw', height: '100vh', maxWidth: '100vw', panelClass: 'dialog-periode-observation' }`.
 */
@Component({
  selector: 'app-periode-observation-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDialogModule],
  templateUrl: './periode-observation-dialog.component.html'
})
export class PeriodeObservationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<PeriodeObservationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PeriodeObservationData
  ) {}
}
