/**
 * Conversions entre la `Date` manipulée par `mat-datepicker` et la chaîne `yyyy-MM-dd`
 * attendue par l'API (les DTO côté serveur sont des `LocalDate`).
 *
 * <p>Les deux fonctions sont volontairement <b>tolérantes</b> : elles acceptent aussi bien
 * une `Date` qu'une chaîne. Un formulaire est alimenté depuis plusieurs sources — API,
 * OCR d'une pièce d'identité, préremplissage depuis une feuille de soins — et il suffit
 * qu'une seule de ces sources laisse passer une chaîne pour qu'une conversion stricte
 * casse l'enregistrement. Convertir « ce qui arrive » plutôt que « ce qui devrait
 * arriver » rend la chaîne robuste sans imposer de discipline à chaque appelant.</p>
 */

/** Chaîne `yyyy-MM-dd` (ou `Date`) → `Date`, pour alimenter un `[matDatepicker]`. */
export function versDate(valeur: string | Date | null | undefined): Date | null {
  if (!valeur) return null;
  if (valeur instanceof Date) return isNaN(valeur.getTime()) ? null : valeur;

  const texte = String(valeur).trim();
  if (!texte) return null;

  // `new Date('2026-08-14')` est interprété en UTC par la spec : dans un fuseau négatif,
  // la date affichée reculerait d'un jour. On construit donc la date en heure LOCALE.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texte);
  if (iso) {
    const d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  const repli = new Date(texte);
  return isNaN(repli.getTime()) ? null : repli;
}

/**
 * `Date` (ou chaîne) → `yyyy-MM-dd`, pour l'API. Renvoie `undefined` si rien à envoyer,
 * ce qui laisse le champ absent du corps JSON plutôt que d'y mettre une chaîne vide.
 */
export function versIsoDate(valeur: Date | string | null | undefined): string | undefined {
  if (!valeur) return undefined;

  if (typeof valeur === 'string') {
    const texte = valeur.trim();
    if (!texte) return undefined;
    // Déjà au bon format : on ne retouche pas.
    if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) return texte;
    const converti = versDate(texte);
    return converti ? versIsoDate(converti) : undefined;
  }

  if (isNaN(valeur.getTime())) return undefined;

  // Parties LOCALES et non `toISOString()` : ce dernier bascule en UTC et décale la
  // journée pour tout utilisateur à l'ouest de Greenwich (une saisie du 14 devient le 13).
  const annee = valeur.getFullYear();
  const mois = String(valeur.getMonth() + 1).padStart(2, '0');
  const jour = String(valeur.getDate()).padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
}
