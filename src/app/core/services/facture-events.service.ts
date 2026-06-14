import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Bus d'événements « factures modifiées ».
 *
 * Émet à chaque création / mise à jour / suppression / changement de statut d'une
 * facture (déclenché par le FactureService). Les vues à longue durée de vie qui ne
 * se reconstruisent pas (onglets d'un espace : liste, stats, tableau de bord, badges
 * de la navigation) s'y abonnent pour se rafraîchir sans recharger la page.
 */
@Injectable({ providedIn: 'root' })
export class FactureEventsService {
  private readonly changedSubject = new Subject<void>();
  /** Émis après toute modification de facture. */
  readonly changed$ = this.changedSubject.asObservable();

  /** À appeler après une opération qui modifie les factures. */
  notifyChanged(): void {
    this.changedSubject.next();
  }
}
