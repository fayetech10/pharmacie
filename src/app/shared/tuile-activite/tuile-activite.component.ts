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
            class="group w-full h-full flex flex-col items-center text-center gap-3 p-7 rounded-2xl border border-border bg-white shadow-sm
                   hover:shadow-md hover:-translate-y-1 active:translate-y-0 active:scale-[0.99] transition duration-200 cursor-pointer"
            [ngClass]="teintes.survol">
      <span class="relative w-16 h-16 rounded-2xl flex items-center justify-center group-hover:scale-110 group-hover:-rotate-3
                   transition duration-300" [ngClass]="teintes.pastille">
        <mat-icon class="!w-9 !h-9 !text-[36px]">{{ icone }}</mat-icon>
        <span *ngIf="pastille" class="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-warn text-white
                                      text-[11.5px] font-bold flex items-center justify-center">{{ pastille }}</span>
      </span>
      <span class="text-[17px] font-bold text-text-primary">{{ titre }}</span>
      <span class="text-[13px] text-text-secondary">{{ description }}</span>
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
