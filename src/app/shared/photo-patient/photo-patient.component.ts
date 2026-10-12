import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { last } from 'rxjs/operators';
import { StructureService } from '../../core/services/structure.service';

/** Photos déjà lues, par dossier : revenir sur une page de la liste ne relance pas de requête. */
const PHOTOS_LUES = new Map<string, string | null>();

/**
 * Avatar d'un patient : sa photo (reprise de la carte CSU au contrôle d'éligibilité) quand
 * il en a une, ses initiales sinon.
 *
 * <p>La photo est soit fournie ({@code [photo]}), soit lue à la demande comme pièce
 * {@code PHOTO_ASSURE} de son dossier ({@code [factureId]} + {@code [dossierId]}, seulement
 * si {@code [aPhoto]}) — la facture ne transporte pas les images.</p>
 */
@Component({
  selector: 'app-photo-patient',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="shrink-0 inline-flex items-center justify-center overflow-hidden rounded-xl select-none
                 font-extrabold tracking-tight"
          [ngClass]="image ? 'bg-field border border-border' : 'bg-primary-light text-primary'"
          [style.width.px]="taille" [style.height.px]="taille" [style.font-size.px]="taille * 0.36"
          [attr.title]="image ? 'Photo de la carte CSU' : null">
      <img *ngIf="image" [src]="image" [alt]="'Photo de ' + nomComplet" class="w-full h-full object-cover"
           (error)="image = null">
      <ng-container *ngIf="!image">{{ initiales }}</ng-container>
    </span>
  `
})
export class PhotoPatientComponent implements OnChanges {
  @Input() prenom?: string | null;
  @Input() nom?: string | null;
  /** Côté du carré, en pixels. */
  @Input() taille = 40;
  /** Photo déjà connue (data URL ou URL). */
  @Input() photo?: string | null;
  /** Sinon : pièce du dossier, lue à la demande. */
  @Input() factureId?: string | null;
  @Input() dossierId?: string | null;
  @Input() aPhoto = false;

  image: string | null = null;

  constructor(private structureService: StructureService) {}

  get nomComplet(): string {
    return `${this.prenom || ''} ${this.nom || ''}`.trim();
  }

  get initiales(): string {
    const p = (this.prenom || '').trim().charAt(0);
    const n = (this.nom || '').trim().charAt(0);
    return (p + n).toUpperCase() || '?';
  }

  ngOnChanges(): void {
    if (this.photo) {
      this.image = this.photo;
      return;
    }
    this.image = null;
    const dossierId = this.dossierId;
    if (!this.aPhoto || !this.factureId || !dossierId) {
      return;
    }
    if (PHOTOS_LUES.has(dossierId)) {
      this.image = PHOTOS_LUES.get(dossierId) || null;
      return;
    }
    this.structureService.getPiece(this.factureId, dossierId, 'PHOTO_ASSURE').pipe(last()).subscribe({
      next: piece => {
        PHOTOS_LUES.set(dossierId, piece.image || null);
        if (this.dossierId === dossierId) this.image = piece.image || null;
      },
      // Photo illisible : les initiales restent, sans bruit.
      error: () => PHOTOS_LUES.set(dossierId, null)
    });
  }
}
