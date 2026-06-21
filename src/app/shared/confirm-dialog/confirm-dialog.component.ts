import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger?: boolean;
  /** Icône Material affichée dans l'en-tête (défaut déduit de `danger`). */
  icon?: string;

  // ----- Mode « prompt » : capture une saisie texte -----
  prompt?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  initialValue?: string;
  maxLength?: number;
}

/**
 * Dialogue partagé de confirmation / saisie.
 * - Mode confirmation (défaut) : ferme avec `true` si confirmé.
 * - Mode `prompt` : affiche un champ texte et ferme avec la valeur saisie (trim).
 * Remplace les `confirm()` / `prompt()` natifs par un composant stylé et accessible.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatDialogModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.css']
})
export class ConfirmDialogComponent {
  value = '';

  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {
    this.value = data.initialValue ?? '';
  }

  /** Le bouton de validation est-il actif ? (motif obligatoire en mode prompt requis). */
  get canConfirm(): boolean {
    if (this.data.prompt && this.data.required) {
      return this.value.trim().length > 0;
    }
    return true;
  }

  confirm(): void {
    if (!this.canConfirm) return;
    this.dialogRef.close(this.data.prompt ? this.value.trim() : true);
  }
}
