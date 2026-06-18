import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FactureService } from './facture.service';
import { AuthService } from './auth.service';

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
 *
 * IMPORTANT : l'état « vu » est ISOLÉ PAR UTILISATEUR (clé suffixée par l'userId).
 * Sinon, sur un même navigateur, une facture marquée vue par un compte (ex. la
 * pharmacie qui consulte « Mes factures ») masquerait à tort le badge d'un autre
 * compte (ex. le Service Régional qui doit voir la facture renvoyée dans « Reçues »).
 */
@Injectable({ providedIn: 'root' })
export class FactureCountService {
  /** Préfixe de la clé localStorage ; la clé réelle est suffixée par l'userId. */
  private readonly STORAGE_PREFIX = 'csu_seen_factures';
  /** Ancienne clé globale (non scellée par utilisateur) : purgée au démarrage. */
  private readonly LEGACY_STORAGE_KEY = 'csu_seen_factures';
  private readonly countsSubject = new BehaviorSubject<StatutCounts>({});
  /** Émet le nombre de factures NON vues par statut ; mis à jour par refresh()/markSeen(). */
  readonly counts$ = this.countsSubject.asObservable();
  private loading = false;

  /** IDs des factures déjà vues, par statut (persistées), pour l'utilisateur chargé. */
  private seenIds: Record<string, Set<string>> = {};
  /** userId dont seenIds est actuellement chargé (pour détecter un changement de compte). */
  private seenUserId: string | null = null;
  /** IDs des factures présentes au dernier refresh, par statut. */
  private currentIds: Record<string, string[]> = {};

  constructor(private factureService: FactureService, private auth: AuthService) {
    // Purge l'ancien état « vu » global (partagé entre comptes) au profit des clés par utilisateur.
    try { localStorage.removeItem(this.LEGACY_STORAGE_KEY); } catch { /* mode privé : on ignore */ }
    this.loadSeenForCurrentUser();
  }

  /** Dernière valeur connue des compteurs (synchrone). */
  get snapshot(): StatutCounts {
    return this.countsSubject.value;
  }

  /** Recharge les factures, purge les IDs disparus et recalcule les non-vues. */
  refresh(): void {
    this.syncUserScope();
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
    this.syncUserScope();
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

  /** Clé localStorage propre à un utilisateur (les états « vu » ne fuient pas d'un compte à l'autre). */
  private storageKey(userId: string | null): string {
    return `${this.STORAGE_PREFIX}_${userId ?? 'anon'}`;
  }

  /** (Re)charge l'état « vu » de l'utilisateur connecté et mémorise son userId. */
  private loadSeenForCurrentUser(): void {
    const uid = this.auth.getCurrentUser()?.userId ?? null;
    this.seenUserId = uid;
    this.seenIds = this.loadSeen(this.storageKey(uid));
  }

  /**
   * Si le compte connecté a changé depuis le dernier accès, recharge l'état « vu »
   * correspondant et oublie le dernier instantané de factures (qui appartenait à
   * l'ancien compte). Appelé avant chaque refresh()/markSeen().
   */
  private syncUserScope(): void {
    const uid = this.auth.getCurrentUser()?.userId ?? null;
    if (uid !== this.seenUserId) {
      this.loadSeenForCurrentUser();
      this.currentIds = {};
    }
  }

  private loadSeen(key: string): Record<string, Set<string>> {
    try {
      const raw = localStorage.getItem(key);
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
      localStorage.setItem(this.storageKey(this.seenUserId), JSON.stringify(obj));
    } catch { /* quota dépassé / mode privé : on ignore */ }
  }
}
