import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FamilleStatut, apparenceStatut } from '../../core/models/statuts';

/**
 * Puce de statut, identique sur tous les écrans : celle du poste de santé (fond doux,
 * icône, libellé de la nomenclature). Libellés et couleurs viennent de core/models/statuts.
 */
@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span class="inline-flex items-center gap-1 rounded-full font-bold whitespace-nowrap"
          [ngClass]="[apparence.classe, grand ? 'px-2.5 py-1 text-[12px]' : 'px-2 py-0.5 text-[11.5px]']">
      <mat-icon *ngIf="!sansIcone" class="!text-sm !w-3.5 !h-3.5">{{ apparence.icone }}</mat-icon>{{ libelle || apparence.libelle }}
    </span>
  `
})
export class StatusBadgeComponent {
  @Input() statut!: string | null | undefined;
  /** Famille du statut : facture (défaut), lettre, bon, feuille, ligne, dossier. */
  @Input() famille: FamilleStatut = 'facture';
  /** Libellé imposé (quand le contexte en demande un plus précis). */
  @Input() libelle?: string;
  @Input() grand = false;
  @Input() sansIcone = false;

  get apparence() {
    return apparenceStatut(this.statut, this.famille);
  }
}
