import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FactureService } from './facture.service';

/** Nombre de factures par statut (clé = StatutFacture). */
export type StatutCounts = Record<string, number>;

/**
 * Compteurs de factures par statut, partagés entre les onglets (espace) et la
 * navigation basse. Alimentés via getAll() (déjà filtré par région côté backend).
 */
@Injectable({ providedIn: 'root' })
export class FactureCountService {
  private readonly countsSubject = new BehaviorSubject<StatutCounts>({});
  /** Émet le nombre de factures par statut ; mis à jour par refresh(). */
  readonly counts$ = this.countsSubject.asObservable();
  private loading = false;

  constructor(private factureService: FactureService) {}

  /** Dernière valeur connue des compteurs (synchrone). */
  get snapshot(): StatutCounts {
    return this.countsSubject.value;
  }

  /** Recharge les factures et recalcule les compteurs par statut. */
  refresh(): void {
    if (this.loading) return;
    this.loading = true;
    this.factureService.getAll().subscribe({
      next: (factures) => {
        const counts: StatutCounts = {};
        for (const f of factures) {
          const s = String(f.statut);
          counts[s] = (counts[s] || 0) + 1;
        }
        this.countsSubject.next(counts);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }
}
