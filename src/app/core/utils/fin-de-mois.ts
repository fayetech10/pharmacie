const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

/** Dernier jour du mois facturé (mois de 1 à 12). */
function dernierJour(mois: number, annee: number): Date {
  return new Date(annee, mois, 0);
}

/**
 * Une facture mensuelle ne s'envoie qu'à la fin de son mois : le bouton « Envoyer » n'apparaît
 * qu'à partir du dernier jour du mois facturé (donc toujours pour un mois écoulé — renvoi
 * d'une facture rejetée compris). Période inconnue : rien n'est bloqué.
 */
export function finDuMoisAtteinte(mois?: number | null, annee?: number | null, aujourdHui = new Date()): boolean {
  if (!mois || !annee) return true;
  const jour = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), aujourdHui.getDate());
  return jour >= dernierJour(mois, annee);
}

/** « Envoi possible à partir du 31 octobre » — à la place du bouton tant que le mois court. */
export function libelleEnvoiPossible(mois?: number | null, annee?: number | null): string {
  if (!mois || !annee) return '';
  const fin = dernierJour(mois, annee);
  return `Envoi possible à partir du ${fin.getDate()} ${MOIS[fin.getMonth()]}`;
}
