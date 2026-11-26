import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface FactureEnvoyeeEvent {
  id: string;
  type: 'STRUCTURE' | 'PHARMACIE';
}

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

  private readonly factureEnvoyeeSubject = new Subject<FactureEnvoyeeEvent>();
  /** Émis après envoi au Service Régional ; l'affectation automatique est réalisée côté serveur. */
  readonly factureEnvoyee$: Observable<FactureEnvoyeeEvent> = this.factureEnvoyeeSubject.asObservable();

  /** À appeler après une opération qui modifie les factures. */
  notifyChanged(): void {
    this.changedSubject.next();
  }

  /** Notifie l'envoi / la transmission d'une facture au SR puis rafraîchit les vues abonnées. */
  notifyFactureEnvoyee(id: string, type: 'STRUCTURE' | 'PHARMACIE' = 'STRUCTURE'): void {
    this.factureEnvoyeeSubject.next({ id, type });
    this.notifyChanged();
  }
}
