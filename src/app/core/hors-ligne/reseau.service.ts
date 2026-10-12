import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged } from 'rxjs';

/**
 * État de la connexion au serveur.
 *
 * `navigator.onLine` seul ne suffit pas : un téléphone accroché à un Wi-Fi sans Internet se
 * dit « en ligne ». L'intercepteur HTTP corrige donc l'état au fil des requêtes : une requête
 * partie sans réponse (statut 0) passe hors ligne, toute réponse du serveur repasse en ligne.
 */
@Injectable({ providedIn: 'root' })
export class ReseauService {
  private readonly etat = new BehaviorSubject<boolean>(typeof navigator === 'undefined' || navigator.onLine);
  readonly enLigne$ = this.etat.pipe(distinctUntilChanged());

  constructor(zone: NgZone) {
    window.addEventListener('online', () => zone.run(() => this.etat.next(true)));
    window.addEventListener('offline', () => zone.run(() => this.etat.next(false)));
  }

  get enLigne(): boolean {
    return this.etat.value;
  }

  /** Une requête est restée sans réponse : le serveur est injoignable. */
  signalerEchec() {
    if (this.etat.value) this.etat.next(false);
  }

  /** Le serveur a répondu (même par une erreur) : il est joignable. */
  signalerReponse() {
    if (!this.etat.value) this.etat.next(true);
  }
}

/** Statuts qui signifient « serveur injoignable » : la saisie peut partir en file d'attente. */
export function estErreurReseau(statut: number | undefined): boolean {
  return statut === 0 || statut === 502 || statut === 504;
}
