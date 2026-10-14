import { Component, Input, OnChanges, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { versDate, versIsoDate } from '../../core/utils/date-formulaire';

/** Écran tactile (téléphone, tablette) : le sélecteur natif y est le plus simple (roulettes, calendrier plein écran). */
const TACTILE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

const CHAMP = 'w-full px-3 rounded-lg border border-border bg-field-bg font-normal text-text-primary';

/**
 * Champ de date, valeur au format ISO `aaaa-mm-jj` (comme un `<input type="date">`), à
 * utiliser avec `[(ngModel)]` à la place de ce dernier.
 *
 * <p>Sur ordinateur, le champ natif est pénible — sur Mac surtout (demande du 14/10/2026) :
 * Safari et Chrome le découpent en segments jour/mois/année et leur petit calendrier n'avance
 * que mois par mois. Ici : saisie libre « jj/mm/aaaa » (ou « jjmmaaaa ») et calendrier Material
 * où l'on choisit l'année, puis le mois, puis le jour. Sur écran tactile, le sélecteur natif
 * du téléphone est gardé.</p>
 */
@Component({
  selector: 'app-champ-date',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDatepickerModule, MatIconModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ChampDateComponent), multi: true }],
  template: `
    <input *ngIf="tactile" type="date" [class]="classes" [value]="valeur" (input)="saisieNative($event)"
           (blur)="toucher()" [attr.min]="min || null" [attr.max]="max || null" [disabled]="desactive"
           [attr.aria-label]="libelle || null">

    <div *ngIf="!tactile" class="relative">
      <input type="text" inputmode="numeric" autocomplete="off" placeholder="jj/mm/aaaa" maxlength="10"
             [class]="classes + ' pr-11'" [matDatepicker]="calendrier" [ngModel]="date"
             (ngModelChange)="choisir($event)" (blur)="toucher()" [min]="minDate" [max]="maxDate"
             [disabled]="desactive" [attr.aria-label]="libelle || null">
      <button type="button" (click)="calendrier.open()" [disabled]="desactive"
              aria-label="Choisir dans le calendrier" title="Choisir dans le calendrier"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md
                     border-0 bg-transparent text-text-secondary cursor-pointer hover:text-primary
                     disabled:opacity-40 disabled:cursor-default">
        <mat-icon class="!text-[20px] !w-5 !h-5">calendar_month</mat-icon>
      </button>
      <mat-datepicker #calendrier [startView]="vue" (closed)="toucher()"></mat-datepicker>
    </div>
  `
})
export class ChampDateComponent implements ControlValueAccessor, OnChanges {
  /** Bornes ISO `aaaa-mm-jj` (ex. pas de date dans le futur : `[max]="aujourdhui"`). */
  @Input() min?: string | null;
  @Input() max?: string | null;
  /** Vue d'ouverture du calendrier : `multi-year` pour une date de naissance (l'année d'abord). */
  @Input() vue: 'month' | 'year' | 'multi-year' = 'month';
  /** Champ plus haut et plus gros (saisie principale d'une étape). */
  @Input() grand = false;
  /** Nom accessible, quand le champ n'est pas dans un `<label>`. */
  @Input() libelle?: string;

  readonly tactile = TACTILE;
  /** Valeur ISO (champ natif). */
  valeur = '';
  /** Valeur Date (calendrier Material). */
  date: Date | null = null;
  desactive = false;

  private changement: (valeur: string) => void = () => {};
  private touche: () => void = () => {};

  get classes(): string {
    return `${CHAMP} ${this.grand ? 'h-12 text-[16px]' : 'h-11 text-[14px]'}`;
  }

  /** Bornes converties pour le calendrier, recalculées seulement quand elles changent. */
  minDate: Date | null = null;
  maxDate: Date | null = null;

  ngOnChanges(): void {
    this.minDate = versDate(this.min);
    this.maxDate = versDate(this.max);
  }

  writeValue(valeur: string | Date | null): void {
    this.date = versDate(valeur);
    this.valeur = versIsoDate(this.date) ?? '';
  }

  registerOnChange(fn: (valeur: string) => void): void {
    this.changement = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touche = fn;
  }

  setDisabledState(desactive: boolean): void {
    this.desactive = desactive;
  }

  /** Calendrier ou saisie au clavier : null tant que la saisie n'est pas une date complète. */
  choisir(date: Date | null): void {
    this.date = date;
    this.valeur = versIsoDate(date) ?? '';
    this.changement(this.valeur);
  }

  saisieNative(evenement: Event): void {
    this.valeur = (evenement.target as HTMLInputElement).value || '';
    this.date = versDate(this.valeur);
    this.changement(this.valeur);
  }

  toucher(): void {
    this.touche();
  }
}
