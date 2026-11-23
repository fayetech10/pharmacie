import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TEINTES, Teinte } from '../teintes';

/**
 * Tuile d'une activité sur l'accueil d'un espace — celle du poste de santé (grande
 * pastille d'icône, titre, une phrase). Le parent écoute `(click)` sur la balise.
 */
@Component({
  selector: 'app-tuile-activite',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  host: { class: 'block' },
  template: `
    <button type="button"
            class="group w-full flex items-center gap-3.5 p-4 rounded-xl border border-border bg-white shadow-sm
                   hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition duration-150 cursor-pointer
                   motion-reduce:transform-none motion-reduce:transition-none text-left"
            [ngClass]="teintes.survol">
      <span class="relative flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition duration-150
                     group-hover:scale-105 motion-reduce:transform-none" [ngClass]="teintes.pastille">
        <mat-icon class="!w-6 !h-6 !text-2xl">{{ icone }}</mat-icon>
        <span *ngIf="pastille" class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-warn text-white
                                      text-[10px] font-bold flex items-center justify-center leading-none">{{ pastille }}</span>
      </span>
      <div class="flex-1 min-w-0">
        <span class="block text-[14px] font-semibold text-text-primary truncate">{{ titre }}</span>
        <span *ngIf="description" class="block text-[12px] text-text-secondary mt-0.5 truncate">{{ description }}</span>
      </div>
      <mat-icon class="!w-4 !h-4 !text-base text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors">chevron_right</mat-icon>
    </button>
  `
})
export class TuileActiviteComponent {
  @Input() icone = 'apps';
  @Input() titre = '';
  @Input() description = '';
  @Input() teinte: Teinte = 'primary';
  /** Compteur affiché sur la pastille (ex. factures à traiter) ; masqué à 0. */
  @Input() pastille: number | null = null;

  get teintes() {
    return TEINTES[this.teinte] || TEINTES.primary;
  }
}
