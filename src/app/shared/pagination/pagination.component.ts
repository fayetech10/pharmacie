import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { pageEffective } from './paginer.pipe';

/**
 * Pagination commune à tous les tableaux du projet.
 *
 * <p>Le composant porte l'état (page, taille) ; la liste se découpe avec le pipe
 * {@code paginer}, via une référence de gabarit — aucun code à ajouter dans l'écran :</p>
 * <pre>
 *   &lt;tr *ngFor="let x of liste | paginer: pg.page : pg.taille"&gt;…
 *   &lt;app-pagination #pg [total]="liste.length"&gt;&lt;/app-pagination&gt;
 * </pre>
 * <p>Masqué tant que la liste tient dans la plus petite page proposée. Pagination côté
 * serveur : {@code [total]} = nombre total, {@code [page]} = page chargée,
 * {@code (pageChange)} = recharger.</p>
 */
@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  host: { class: 'block' },
  template: `
    <nav *ngIf="visible" aria-label="Pagination"
         class="flex flex-wrap items-center justify-between gap-3 px-1 pt-3 pb-1 text-[13px] text-text-secondary">
      <span class="tabular-nums">
        <strong class="text-text-primary font-semibold">{{ debut }}–{{ fin }}</strong> sur {{ total }}
      </span>

      <div class="flex items-center gap-3">
        <label *ngIf="options.length > 1" class="hidden sm:flex items-center gap-2">
          <span>Lignes</span>
          <select class="h-8 pl-2 pr-6 rounded-lg text-[13px]" [value]="taille"
                  (change)="changerTaille(+$any($event.target).value)" aria-label="Lignes par page">
            <option *ngFor="let t of options" [value]="t">{{ t }}</option>
          </select>
        </label>

        <div class="flex items-center gap-1">
          <button type="button" class="w-8 h-8 inline-flex items-center justify-center rounded-lg border-0 bg-transparent cursor-pointer text-text-secondary hover:bg-border-light disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
                  [disabled]="pageCourante === 0" (click)="aller(pageCourante - 1)" aria-label="Page précédente">
            <mat-icon class="!text-[20px] !w-5 !h-5">chevron_left</mat-icon>
          </button>
          <ng-container *ngFor="let p of pagesAffichees">
            <span *ngIf="p === null" class="w-6 text-center text-text-muted select-none">…</span>
            <button *ngIf="p !== null" type="button"
                    class="min-w-[2rem] h-8 px-2 inline-flex items-center justify-center rounded-lg border-0 cursor-pointer tabular-nums text-[13px] font-semibold"
                    [ngClass]="p === pageCourante ? 'bg-primary text-white' : 'bg-transparent text-text-secondary hover:bg-border-light'"
                    [attr.aria-current]="p === pageCourante ? 'page' : null"
                    (click)="aller(p)">{{ p + 1 }}</button>
          </ng-container>
          <button type="button" class="w-8 h-8 inline-flex items-center justify-center rounded-lg border-0 bg-transparent cursor-pointer text-text-secondary hover:bg-border-light disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
                  [disabled]="pageCourante >= nombrePages - 1" (click)="aller(pageCourante + 1)" aria-label="Page suivante">
            <mat-icon class="!text-[20px] !w-5 !h-5">chevron_right</mat-icon>
          </button>
        </div>
      </div>
    </nav>
  `
})
export class PaginationComponent {
  /** Nombre total d'éléments de la liste paginée. */
  @Input() total = 0;
  /** Lignes par page (modifiable par l'utilisateur). */
  @Input() taille = 10;
  /** Tailles proposées. */
  @Input() tailles: number[] = [10, 25, 50];
  /**
   * Page demandée (0 = première). La page affichée est {@link pageCourante}, bornée.
   * Entrée seulement pour une pagination serveur : l'écran fournit la page chargée et
   * recharge sur {@link pageChange}. Sinon, l'état reste interne.
   */
  @Input() page = 0;

  @Output() pageChange = new EventEmitter<number>();

  get options(): number[] {
    return [...new Set([...this.tailles, this.taille])].sort((a, b) => a - b);
  }

  get visible(): boolean {
    return this.total > Math.min(...this.options);
  }

  get pageCourante(): number {
    return pageEffective(this.page, this.taille, this.total);
  }

  get nombrePages(): number {
    return Math.max(1, Math.ceil(this.total / this.taille));
  }

  get debut(): number {
    return this.total === 0 ? 0 : this.pageCourante * this.taille + 1;
  }

  get fin(): number {
    return Math.min(this.total, (this.pageCourante + 1) * this.taille);
  }

  /** Numéros de pages affichés : la première, la dernière et les voisines ; null = « … ». */
  get pagesAffichees(): (number | null)[] {
    const n = this.nombrePages;
    const c = this.pageCourante;
    if (n <= 7) return Array.from({ length: n }, (_, i) => i);
    const pages = new Set([0, n - 1, c - 1, c, c + 1].filter(p => p >= 0 && p < n));
    const triees = [...pages].sort((a, b) => a - b);
    const resultat: (number | null)[] = [];
    triees.forEach((p, i) => {
      if (i > 0 && p - triees[i - 1] > 1) resultat.push(null);
      resultat.push(p);
    });
    return resultat;
  }

  aller(page: number): void {
    this.page = pageEffective(page, this.taille, this.total);
    this.pageChange.emit(this.page);
  }

  /** Nouvelle taille : on reste sur la page qui contient la première ligne affichée. */
  changerTaille(taille: number): void {
    const premiere = this.pageCourante * this.taille;
    this.taille = taille;
    this.aller(Math.floor(premiere / taille));
  }
}
