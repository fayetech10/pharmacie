import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Regime } from '../../core/models/bcsu.model';
import { CATEGORIES_BCSU, CATEGORIES_POSTE, libelleRegimePoste } from '../../features/espace-poste/poste-facturation';

/** Couleur par famille de régimes : la même dans toutes les listes. */
const COULEURS: Record<string, string> = {
  CONTRIBUTIF: 'bg-blue-50 text-blue-700',
  BSF_CEC: 'bg-orange-50 text-orange-700',
  ZERO_CINQ_ANS: 'bg-emerald-50 text-emerald-700',
  SESAME: 'bg-amber-50 text-amber-800',
  CESARIENNE: 'bg-pink-50 text-pink-700',
  DIALYSE: 'bg-violet-50 text-violet-700'
};

/**
 * Puce de régime : icône et libellé court des tuiles du poste de santé, couleur de sa
 * famille (contributifs, BSF / CEC, 0-5 ans…). Remplace les styles propres à chaque liste.
 */
@Component({
  selector: 'app-regime-badge',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span *ngIf="regime" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
          [ngClass]="couleur">
      <mat-icon class="!text-sm !w-3.5 !h-3.5">{{ icone }}</mat-icon>{{ libelle }}
    </span>
    <span *ngIf="!regime" class="text-text-muted">—</span>
  `
})
export class RegimeBadgeComponent {
  @Input() regime: Regime | string | null | undefined;

  private get categorie() {
    const r = this.regime as Regime;
    return CATEGORIES_BCSU.find(c => c.regimes.includes(r)) || CATEGORIES_POSTE.find(c => c.regimes.includes(r));
  }

  get libelle(): string {
    return libelleRegimePoste(this.regime);
  }

  get icone(): string {
    return this.categorie?.icone || 'category';
  }

  get couleur(): string {
    return COULEURS[this.categorie?.cle || ''] || 'bg-slate-100 text-slate-700';
  }
}
