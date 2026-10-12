import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Regime, REGIME_LABELS, exigeCarteCsu } from '../../core/models/bcsu.model';

const ICONES: Partial<Record<Regime, string>> = {
  [Regime.CONTRIBUTIF]: 'badge',
  [Regime.BSF]: 'family_restroom',
  [Regime.CEC]: 'accessible',
  [Regime.BSF_CEC]: 'family_restroom',
  [Regime.SESAME]: 'elderly',
  [Regime.CESARIENNE]: 'pregnant_woman',
  [Regime.ZERO_CINQ_ANS]: 'child_care',
  [Regime.DIALYSE_PERITONEALE]: 'water_drop',
  [Regime.HEMODIALYSE]: 'bloodtype',
  [Regime.NDONGO_DARA]: 'menu_book',
  [Regime.ELEVES]: 'school'
};

/** Libellés courts des tuiles : la description dit déjà le reste. */
const LIBELLES_COURTS: Partial<Record<Regime, string>> = {
  [Regime.CONTRIBUTIF]: 'Classique',
  [Regime.BSF]: 'BSF',
  [Regime.CEC]: 'CEC',
  [Regime.BSF_CEC]: 'BSF / CEC',
  [Regime.ZERO_CINQ_ANS]: '0-5 ans',
  [Regime.NDONGO_DARA]: 'Ndongo Daara',
  [Regime.ELEVES]: 'Élèves'
};

const DESCRIPTIONS: Partial<Record<Regime, string>> = {
  [Regime.CONTRIBUTIF]: 'Adhérent de mutuelle',
  [Regime.BSF]: 'Bourse de sécurité familiale',
  [Regime.CEC]: 'Carte d\'égalité des chances',
  [Regime.BSF_CEC]: 'Bourse familiale ou égalité des chances',
  [Regime.SESAME]: '60 ans et plus',
  [Regime.CESARIENNE]: 'Gratuité de la césarienne',
  [Regime.ZERO_CINQ_ANS]: 'Gratuité des moins de 6 ans',
  [Regime.DIALYSE_PERITONEALE]: 'Gratuité de la dialyse',
  [Regime.HEMODIALYSE]: 'Gratuité de la dialyse',
  [Regime.NDONGO_DARA]: 'Talibés des daaras',
  [Regime.ELEVES]: 'Élèves'
};

/**
 * Choix du régime en tuiles, première étape des formulaires du poste et du BCSU.
 * Les régimes sont groupés selon qu'ils exigent une carte CSU (vérifiée en ligne)
 * ou une simple pièce d'identité : c'est ce choix qui décide de la suite du parcours.
 */
@Component({
  selector: 'app-regime-tuiles',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col gap-4">
      <div *ngFor="let groupe of groupes">
        <div class="flex items-center gap-1.5 mb-2 text-[12px] font-bold uppercase tracking-wide text-text-secondary">
          <mat-icon class="!text-base !w-4 !h-4">{{ groupe.icone }}</mat-icon>
          {{ groupe.titre }}
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2" role="radiogroup" [attr.aria-label]="groupe.titre">
          <button type="button" *ngFor="let r of groupe.regimes" role="radio"
                  [attr.aria-checked]="r === selection" [disabled]="desactive"
                  (click)="choisi.emit(r)"
                  class="flex items-start gap-2.5 p-3 rounded-lg border text-left transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
                  [ngClass]="r === selection
                    ? 'border-primary bg-primary-light ring-2 ring-primary-200'
                    : 'border-border bg-white hover:border-primary-200 hover:bg-primary-light/40 cursor-pointer'">
            <span class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  [ngClass]="r === selection ? 'bg-primary text-white' : 'bg-field text-text-secondary'">
              <mat-icon class="!text-xl !w-5 !h-5">{{ icone(r) }}</mat-icon>
            </span>
            <span class="min-w-0">
              <span class="block text-[13.5px] font-bold text-text-primary leading-tight">{{ libelle(r) }}</span>
              <span class="block text-[11.5px] text-text-secondary mt-0.5 leading-snug">{{ description(r) }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  `
})
export class RegimeTuilesComponent {
  @Input() options: Regime[] = [];
  @Input() selection: Regime | null = null;
  @Input() desactive = false;
  /** Libellé affiché (le poste a ses propres intitulés : « Classique », « BSF / CEC »). */
  @Input() libelle: (r: Regime) => string = r => LIBELLES_COURTS[r] || REGIME_LABELS[r];
  @Output() choisi = new EventEmitter<Regime>();

  get groupes(): { titre: string; icone: string; regimes: Regime[] }[] {
    const avecCarte = this.options.filter(r => exigeCarteCsu(r));
    const sansCarte = this.options.filter(r => !exigeCarteCsu(r));
    return [
      { titre: 'Avec carte CSU — vérifiée en ligne', icone: 'verified_user', regimes: avecCarte },
      { titre: 'Sans carte — pièce d\'identité', icone: 'contact_page', regimes: sansCarte }
    ].filter(g => g.regimes.length > 0);
  }

  icone(r: Regime): string {
    return ICONES[r] || 'category';
  }

  description(r: Regime): string {
    return DESCRIPTIONS[r] || '';
  }
}
