import { Injectable } from '@angular/core';

/** Où en était l'utilisateur dans une liste : page, recherche, filtre, défilement. */
export interface EtatListe {
  page: number;
  taille: number;
  recherche: string;
  filtre?: string;
  defilement: number;
}

/**
 * Mémoire des listes le temps de la session de l'onglet : en revenant du détail d'un patient
 * vers la facture, on retrouve la page, la recherche et la position de défilement quittées
 * (une facture de centre compte des centaines de patients). Rien n'est écrit dans le navigateur.
 */
@Injectable({ providedIn: 'root' })
export class EtatListeService {
  private readonly etats = new Map<string, EtatListe>();

  memoriser(cle: string, etat: EtatListe): void {
    this.etats.set(cle, etat);
  }

  /** L'état mémorisé pour cette liste, consommé : il ne sert qu'au retour qui suit. */
  reprendre(cle: string): EtatListe | undefined {
    const etat = this.etats.get(cle);
    this.etats.delete(cle);
    return etat;
  }

  /** Après l'affichage de la liste, remet la page à la position quittée. */
  static defiler(etat: EtatListe | undefined): void {
    if (etat?.defilement) setTimeout(() => window.scrollTo({ top: etat.defilement }));
  }
}
