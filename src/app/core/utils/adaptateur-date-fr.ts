import { Injectable } from '@angular/core';
import { NativeDateAdapter, MatDateFormats } from '@angular/material/core';

/**
 * Adaptateur de date français pour `mat-datepicker`.
 *
 * <p>Le {@link NativeDateAdapter} de Material s'appuie sur `Date.parse`, qui lit une date
 * saisie à la main <b>à l'américaine</b> : « 03/04/2026 » devient le 4 mars et non le
 * 3 avril. La date reste valide, le formulaire l'accepte, et personne ne voit passer
 * l'erreur — c'est exactement le genre de faute silencieuse qu'on ne veut pas sur une
 * date de prise en charge ou une date de naissance.</p>
 *
 * <p>On surcharge donc la lecture pour imposer l'ordre jour/mois/année, et l'affichage
 * pour rendre `jj/mm/aaaa`. L'ISO `yyyy-MM-dd` reste accepté en entrée : c'est la forme
 * que renvoie l'API, et un formulaire préchargé ne doit pas dépendre de la casse du
 * séparateur.</p>
 */
@Injectable()
export class AdaptateurDateFr extends NativeDateAdapter {

  /** `jj/mm/aaaa`, `jj-mm-aaaa` ou ISO `aaaa-mm-jj`. Toute autre forme est rejetée. */
  override parse(valeur: any): Date | null {
    if (valeur == null || valeur === '') return null;
    if (valeur instanceof Date) return this.clampValide(valeur);

    const texte = String(valeur).trim();

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texte);
    if (iso) return this.construire(+iso[1], +iso[2], +iso[3]);

    const fr = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(texte);
    if (fr) return this.construire(+fr[3], +fr[2], +fr[1]);

    // Volontairement null plutôt qu'un repli sur Date.parse : un repli ramènerait
    // l'interprétation américaine que cet adaptateur existe précisément pour écarter.
    // Le contrôle passe alors en erreur `matDatepickerParse`, visible à l'écran.
    return null;
  }

  override format(date: Date, format: any): string {
    if (!this.isValid(date)) return '';
    const jour = String(date.getDate()).padStart(2, '0');
    const mois = String(date.getMonth() + 1).padStart(2, '0');
    const annee = date.getFullYear();
    return format === 'saisie' || format == null ? `${jour}/${mois}/${annee}`
      : super.format(date, format);
  }

  /** Premier jour de la semaine en France : lundi (le natif renvoie dimanche). */
  override getFirstDayOfWeek(): number {
    return 1;
  }

  /**
   * Rejette les dates « qui débordent » : le 31/02 deviendrait le 2 ou 3 mars par report
   * silencieux du constructeur Date. Une saisie impossible doit se voir.
   */
  private construire(annee: number, mois: number, jour: number): Date | null {
    if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
    const date = new Date(annee, mois - 1, jour);
    if (date.getFullYear() !== annee || date.getMonth() !== mois - 1 || date.getDate() !== jour) {
      return null;
    }
    return date;
  }

  private clampValide(date: Date): Date | null {
    return isNaN(date.getTime()) ? null : date;
  }
}

/** Formats associés : saisie et affichage en `jj/mm/aaaa`. */
export const FORMATS_DATE_FR: MatDateFormats = {
  parse: {
    dateInput: 'saisie'
  },
  display: {
    dateInput: 'saisie',
    monthYearLabel: { year: 'numeric', month: 'short' },
    dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
    monthYearA11yLabel: { year: 'numeric', month: 'long' }
  }
};
