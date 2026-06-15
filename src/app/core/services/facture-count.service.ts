import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FactureService } from './facture.service';

/** Nombre de factures par statut (clé = StatutFacture). */
export type StatutCounts = Record<string, number>;

/**
 * Compteurs de factures par statut, partagés entre les onglets (espace) et la
 * navigation basse.
 *
 * Modèle « notifications » : le compteur émis ne représente PAS le total, mais le
 * nombre de factures NON encore vues dans chaque statut. Ouvrir l'onglet d'un statut
 * (markSeen) remet son badge à zéro. L'état « vu » est persisté (localStorage) pour
 * survivre aux rechargements et n'est purgé que des factures ayant disparu.
 */
@Injectable({ providedIn: 'root' })
export class FactureCountService {
  private readonly STORAGE_KEY = 'csu_seen_factures';
  private readonly countsSubject = new BehaviorSubject<StatutCounts>({});
  /** Émet le nombre de factures NON vues par statut ; mis à jour par refresh()/markSeen(). */
  readonly counts$ = this.countsSubject.asObservable();
  private loading = false;

  /** IDs des factures déjà vues, par statut (persistées). */
  private seenIds: Record<string, Set<string>> = this.loadSeen();
  /** IDs des factures présentes au dernier refresh, par statut. */
  private currentIds: Record<string, string[]> = {};

  constructor(private factureService: FactureService) {}

  /** Dernière valeur connue des compteurs (synchrone). */
  get snapshot(): StatutCounts {
    return this.countsSubject.value;
  }

  /** Recharge les factures, purge les IDs disparus et recalcule les non-vues. */
  refresh(): void {
    if (this.loading) return;
    this.loading = true;
    this.factureService.getAll().subscribe({
      next: (factures) => {
        const current: Record<string, string[]> = {};
        for (const f of factures) {
          const s = String(f.statut);
          (current[s] = current[s] || []).push(String(f.id));
        }
        this.currentIds = current;
        this.pruneSeen(current);
        this.emitUnseen();
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /**
   * Marque comme vues toutes les factures actuellement dans ces statuts : leur badge
   * tombe à zéro. Appelé quand l'utilisateur ouvre l'onglet correspondant.
   */
  markSeen(statuses: string[]): void {
    let changed = false;
    for (const s of statuses) {
      const ids = this.currentIds[s] || [];
      const seen = this.seenIds[s] = this.seenIds[s] || new Set<string>();
      for (const id of ids) {
        if (!seen.has(id)) { seen.add(id); changed = true; }
      }
    }
    if (changed) {
      this.persistSeen();
      this.emitUnseen();
    }
  }

  /** Recalcule et émet le nombre de factures NON vues par statut. */
  private emitUnseen(): void {
    const counts: StatutCounts = {};
    for (const s of Object.keys(this.currentIds)) {
      const seen = this.seenIds[s];
      const unseen = this.currentIds[s].filter(id => !seen || !seen.has(id)).length;
      if (unseen > 0) counts[s] = unseen;
    }
    this.countsSubject.next(counts);
  }

  /** Ne conserve que les IDs vus encore présents (borne la taille du stockage). */
  private pruneSeen(current: Record<string, string[]>): void {
    let changed = false;
    for (const s of Object.keys(this.seenIds)) {
      const present = new Set(current[s] || []);
      const seen = this.seenIds[s];
      for (const id of [...seen]) {
        if (!present.has(id)) { seen.delete(id); changed = true; }
      }
      if (seen.size === 0) { delete this.seenIds[s]; changed = true; }
    }
    if (changed) this.persistSeen();
  }

  private loadSeen(): Record<string, Set<string>> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw) as Record<string, string[]>;
      const result: Record<string, Set<string>> = {};
      for (const k of Object.keys(obj)) result[k] = new Set(obj[k]);
      return result;
    } catch {
      return {};
    }
  }

  private persistSeen(): void {
    try {
      const obj: Record<string, string[]> = {};
      for (const k of Object.keys(this.seenIds)) obj[k] = [...this.seenIds[k]];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(obj));
    } catch { /* quota dépassé / mode privé : on ignore */ }
  }
}
