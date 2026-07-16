import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Pont UI pour le pointage BCSU : les écrans (ex. bannière de l'espace BCSU)
 * demandent l'ouverture de la modale de départ, affichée par le MainLayout.
 */
@Injectable({ providedIn: 'root' })
export class PointageUiService {
  private readonly departSubject = new Subject<void>();
  /** Émis quand un écran demande la modale de pointage de départ. */
  readonly departRequested$ = this.departSubject.asObservable();

  requestDepart(): void {
    this.departSubject.next();
  }
}
