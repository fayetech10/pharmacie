import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export interface Onglet<T = string | number> {
  cle: T;
  libelle: string;
  icone?: string;
}

/**
 * Onglets segmentés (pastille blanche sur fond gris) — ceux de l'espace du poste de santé
 * (« Facturation | Mes factures »), réutilisés partout à la place des onglets Material.
 */
@Component({
  selector: 'app-onglets',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-wrap p-1 rounded-lg bg-field w-fit max-w-full" role="tablist" [attr.aria-label]="libelle">
      <button type="button" *ngFor="let o of onglets" role="tab" [attr.aria-selected]="o.cle === selection" (click)="choisir(o.cle)"
              class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-semibold border-0 cursor-pointer"
              [ngClass]="o.cle === selection ? 'bg-white text-primary shadow-sm' : 'bg-transparent text-text-secondary'">
        <mat-icon *ngIf="o.icone" class="!w-4 !h-4 !text-base">{{ o.icone }}</mat-icon>{{ o.libelle }}
      </button>
    </div>
  `
})
export class OngletsComponent<T = string | number> {
  @Input() onglets: Onglet<T>[] = [];
  @Input() selection!: T;
  @Input() libelle = 'Onglets';
  @Output() selectionChange = new EventEmitter<T>();

  choisir(cle: T) {
    if (cle === this.selection) return;
    this.selection = cle;
    this.selectionChange.emit(cle);
  }
}
