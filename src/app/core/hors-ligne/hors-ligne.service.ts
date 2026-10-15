import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { BehaviorSubject, Subject, Subscription, filter, firstValueFrom } from 'rxjs';

import { Regime } from '../models/bcsu.model';
import { FactureStructure, FactureStructureRequest } from '../models/structure.model';
import { TarifHorsCsu } from '../models/referentiel.model';
import { AuthService } from '../services/auth.service';
import { StructureService } from '../services/structure.service';
import { HorsCsuService } from '../services/hors-csu.service';
import { prechargerOcr } from '../utils/document-ocr';
import { ReseauService, estErreurReseau } from './reseau.service';
import { MAGASIN_SAISIES, enregistrer, lire, listerTout, memoriser, relire, supprimer } from './stockage-hors-ligne';

/** Régimes facturables sans réseau : aucune carte à vérifier en ligne. */
export const REGIMES_HORS_LIGNE: Regime[] = [Regime.ZERO_CINQ_ANS, Regime.SESAME];

const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Nouvelle tentative d'envoi tant qu'il reste des saisies et que l'application est ouverte. */
const INTERVALLE_SYNCHRO_MS = 60_000;
/** Verrou de l'appareil (Web Locks) : une seule synchronisation à la fois, tous onglets confondus. */
const VERROU_SYNCHRO = 'csu-synchro-hors-ligne';
/** Préchargement du moteur de lecture des CNI : refait au plus une fois par mois. */
const CLE_OCR_PRET = 'csu_ocr_hors_ligne';
const VALIDITE_OCR_MS = 30 * 24 * 60 * 60 * 1000;

/** Patient enregistré sur l'appareil, en attente d'envoi au serveur. */
export interface SaisieEnAttente {
  /** Aussi la clé de synchronisation envoyée au serveur (anti-doublon). */
  id: string;
  utilisateurId: string;
  creeLe: string;
  requete: FactureStructureRequest;
  resume: { patient: string; regime: Regime; montant: number; dateSoins: string; partiel: boolean };
  etat: 'EN_ATTENTE' | 'ERREUR';
  erreur?: string;
  /** Mois d'origine, quand la saisie a dû être reportée (mois déjà clôturé à l'envoi). */
  reporteDepuis?: string;
}

/** PLUS_TARD : rien n'a été écrit (facture modifiée au même instant), la saisie reste en file. */
type IssueEnvoi = 'ENVOYE' | 'ERREUR' | 'PLUS_TARD' | 'ARRET';

/**
 * Mode hors ligne des postes et centres de santé.
 *
 * <p>Sans réseau, un patient « enfant de moins de 5 ans » ou « Plan Sésame » est enregistré
 * sur l'appareil (IndexedDB, photos comprises). Dès que le serveur répond de nouveau, les
 * saisies partent d'elles-mêmes, une à une, dans l'ordre : au retour du réseau, à l'ouverture
 * de l'application, au réveil du téléphone, puis toutes les minutes tant qu'il en reste.</p>
 *
 * <p>Une saisie n'est envoyée qu'avec la session de l'agent qui l'a faite. Sa clé unique
 * empêche le serveur de la compter deux fois si une réponse s'est perdue. Si le mois des
 * soins a été clôturé entre-temps, la saisie est reportée sur la facture du mois en cours.</p>
 *
 * <p>Les envois ne se chevauchent jamais : ces déclencheurs arrivent souvent ensemble (trois
 * d'un coup au démarrage), et chacun envoyait alors les mêmes saisies — le même patient
 * enregistré trois fois au retour du réseau (14/10/2026).</p>
 */
@Injectable({ providedIn: 'root' })
export class HorsLigneService implements OnDestroy {
  /** Saisies en attente de l'agent connecté. */
  readonly saisies$ = new BehaviorSubject<SaisieEnAttente[]>([]);
  readonly synchronisation$ = new BehaviorSubject<boolean>(false);
  /** Des saisies viennent de rejoindre leur facture : les listes de factures se rafraîchissent. */
  readonly saisiesEnvoyees$ = new Subject<number>();

  private actif = false;
  /** Envoi en cours dans cet onglet, et appel reçu pendant qu'il tournait. */
  private envoiEnCours = false;
  private relancer = false;
  private abonnements = new Subscription();
  private minuterie?: ReturnType<typeof setInterval>;
  private readonly surRetourPremierPlan = () => {
    if (document.visibilityState === 'visible') void this.synchroniser();
  };

  constructor(
    private reseau: ReseauService,
    private auth: AuthService,
    private structureService: StructureService,
    private horsCsu: HorsCsuService,
    private snackBar: MatSnackBar,
    private zone: NgZone
  ) {}

  get enLigne(): boolean {
    return this.reseau.enLigne;
  }

  /** Démarre la surveillance (agent d'un poste ou d'un centre connecté). */
  demarrer() {
    if (this.actif) return;
    this.actif = true;
    void this.rafraichir().then(() => this.synchroniser());
    this.abonnements.add(this.reseau.enLigne$.pipe(filter(enLigne => enLigne))
      .subscribe(() => void this.synchroniser()));
    // Reconnexion faite (session hors ligne expirée) : les saisies peuvent partir.
    this.abonnements.add(this.auth.reconnexionRequise$.pipe(filter(requise => !requise))
      .subscribe(() => void this.synchroniser()));
    document.addEventListener('visibilitychange', this.surRetourPremierPlan);
    this.zone.runOutsideAngular(() => {
      this.minuterie = setInterval(() => {
        if (this.saisies$.value.some(s => s.etat === 'EN_ATTENTE')) this.zone.run(() => void this.synchroniser());
      }, INTERVALLE_SYNCHRO_MS);
    });
  }

  arreter() {
    this.actif = false;
    this.abonnements.unsubscribe();
    this.abonnements = new Subscription();
    document.removeEventListener('visibilitychange', this.surRetourPremierPlan);
    clearInterval(this.minuterie);
    this.saisies$.next([]);
  }

  ngOnDestroy() {
    this.arreter();
  }

  /** Nouvelle clé de saisie (anti-doublon côté serveur). */
  nouvelleCle(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'hl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  /** Enregistre le patient sur l'appareil ; il partira au retour du réseau. */
  async mettreEnFile(requete: FactureStructureRequest, resume: SaisieEnAttente['resume']): Promise<SaisieEnAttente> {
    const utilisateur = this.auth.getCurrentUser();
    if (!utilisateur) throw new Error('Session fermée');
    const cle = requete.cleSynchronisation || this.nouvelleCle();
    const saisie: SaisieEnAttente = {
      id: cle,
      utilisateurId: utilisateur.userId,
      creeLe: new Date().toISOString(),
      requete: { ...requete, cleSynchronisation: cle },
      resume,
      etat: 'EN_ATTENTE'
    };
    await enregistrer(MAGASIN_SAISIES, saisie);
    await this.rafraichir();
    return saisie;
  }

  async supprimerSaisie(id: string) {
    await supprimer(MAGASIN_SAISIES, id);
    await this.rafraichir();
  }

  /** Remet en file une saisie refusée (après correction côté serveur, ou nouvel essai). */
  async reessayer(saisie: SaisieEnAttente) {
    await enregistrer(MAGASIN_SAISIES, { ...saisie, etat: 'EN_ATTENTE', erreur: undefined });
    await this.rafraichir();
    await this.synchroniser();
  }

  /**
   * Envoie les saisies en attente de l'agent connecté, si le serveur est joignable.
   *
   * <p>Un seul envoi à la fois. Le drapeau est posé avant toute attente : posé après la
   * lecture de la file (asynchrone), il laissait passer les appels simultanés, qui
   * envoyaient chacun les mêmes saisies. Un appel reçu pendant l'envoi en relance un autre
   * derrière lui (une saisie a pu revenir en file entre-temps) au lieu de doubler celui-ci.</p>
   */
  async synchroniser(): Promise<void> {
    if (!this.actif) return;
    if (this.envoiEnCours) {
      this.relancer = true;
      return;
    }
    this.envoiEnCours = true;
    try {
      do {
        this.relancer = false;
        await this.envoyerSurLAppareil();
      } while (this.relancer && this.actif);
    } finally {
      this.envoiEnCours = false;
    }
  }

  // ─────────────── données relues hors ligne ───────────────

  /** Catalogue des prestations du poste, mémorisé à chaque lecture en ligne. */
  memoriserCatalogue(tarifs: TarifHorsCsu[]) {
    const cle = this.cleStructure('catalogue');
    if (cle) memoriser(cle, tarifs).catch(() => { /* cache facultatif */ });
  }

  catalogueMemorise(): Promise<TarifHorsCsu[] | null> {
    const cle = this.cleStructure('catalogue');
    return cle ? relire<TarifHorsCsu[]>(cle).catch(() => null) : Promise.resolve(null);
  }

  /** Factures de l'année (« Mes factures »), mémorisées pour être consultées hors ligne. */
  memoriserFactures(annee: number, factures: FactureStructure[]) {
    const cle = this.cleStructure(`factures:${annee}`);
    if (cle) memoriser(cle, factures).catch(() => { /* cache facultatif */ });
  }

  facturesMemorisees(annee: number): Promise<FactureStructure[] | null> {
    const cle = this.cleStructure(`factures:${annee}`);
    return cle ? relire<FactureStructure[]>(cle).catch(() => null) : Promise.resolve(null);
  }

  /**
   * Prépare l'appareil pour le hors ligne, en ligne et en arrière-plan : catalogue des
   * prestations, et moteur de lecture des CNI (mis en cache par l'application installée).
   */
  preparer() {
    if (!this.reseau.enLigne) return;
    this.horsCsu.getTarifsApplicables().subscribe({
      next: tarifs => this.memoriserCatalogue((tarifs || []).filter(t => t.actif)),
      error: () => { /* nouvel essai à la prochaine ouverture */ }
    });
    const controle = typeof navigator !== 'undefined' && navigator.serviceWorker?.controller;
    let dernier = 0;
    try { dernier = Number(localStorage.getItem(CLE_OCR_PRET)) || 0; } catch { /* stockage indisponible */ }
    if (controle && Date.now() - dernier > VALIDITE_OCR_MS) {
      // Après le démarrage de l'écran, pour ne pas lui disputer le réseau.
      setTimeout(() => prechargerOcr()
        .then(() => { try { localStorage.setItem(CLE_OCR_PRET, String(Date.now())); } catch { /* idem */ } })
        .catch(() => { /* nouvel essai plus tard */ }), 15_000);
    }
  }

  // ─────────────── interne ───────────────

  /**
   * Un envoi pour tout l'appareil : deux onglets ouverts (ou l'application installée et le
   * navigateur) partagent la même file, et enverraient sinon chacun les mêmes saisies. Celui
   * qui trouve le verrou pris laisse faire l'autre ; ce qui resterait partira au passage
   * suivant. Sans Web Locks (Safari < 15.4, page en http), seul le drapeau de l'onglet joue.
   */
  private async envoyerSurLAppareil(): Promise<void> {
    const verrous = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!verrous) {
      await this.envoyerFile();
      return;
    }
    await verrous.request(VERROU_SYNCHRO, { ifAvailable: true }, async verrou => {
      if (verrou) await this.envoyerFile();
    });
  }

  private async envoyerFile(): Promise<void> {
    if (!this.actif || !this.auth.getCurrentUser()) return;
    const aEnvoyer = (await this.lister()).filter(s => s.etat === 'EN_ATTENTE');
    if (!aEnvoyer.length) return;
    if (this.auth.isSessionExpired()) {
      // Session ouverte hors ligne, jeton périmé : rien ne part sans reconnexion.
      if (this.reseau.enLigne) this.auth.signalerReconnexionRequise();
      return;
    }

    this.synchronisation$.next(true);
    let envoyes = 0;
    let erreurs = 0;
    const reports = new Set<string>();
    try {
      for (const { id } of aEnvoyer.sort((a, b) => a.creeLe.localeCompare(b.creeLe))) {
        // Relue juste avant l'envoi : supprimée, refusée ou déjà partie entre-temps, elle ne
        // repart pas.
        const saisie = await lire<SaisieEnAttente>(MAGASIN_SAISIES, id).catch(() => undefined);
        if (saisie?.etat !== 'EN_ATTENTE') continue;
        const issue = await this.envoyer(saisie);
        if (issue === 'ARRET') break;
        if (issue === 'PLUS_TARD') continue;
        if (issue === 'ERREUR') {
          erreurs++;
          continue;
        }
        envoyes++;
        if (saisie.reporteDepuis) reports.add(saisie.reporteDepuis);
      }
    } finally {
      this.synchronisation$.next(false);
      await this.rafraichir();
    }
    if (envoyes) this.saisiesEnvoyees$.next(envoyes);
    this.annoncer(envoyes, erreurs, reports);
  }

  /** Envoie une saisie, toujours avec sa clé d'origine (le serveur reconnaît un renvoi). */
  private async envoyer(saisie: SaisieEnAttente): Promise<IssueEnvoi> {
    try {
      await firstValueFrom(this.structureService.createFacture(saisie.requete, { silencieux: true }));
      await supprimer(MAGASIN_SAISIES, saisie.id);
      return 'ENVOYE';
    } catch (err) {
      const statut = (err as HttpErrorResponse)?.status;
      if (estErreurReseau(statut) || statut === 401 || (statut === 403 && this.auth.isSessionExpired())) {
        return 'ARRET'; // réseau retombé, ou reconnexion à faire : on reprendra plus tard
      }
      if (statut === 409 && (err as HttpErrorResponse)?.error?.code === 'CONFLIT_VERSION') {
        // Facture modifiée au même instant par un autre (le BCSU d'un centre) : rien n'a été
        // écrit. Ce n'est ni un refus ni un mois clôturé — nouvel essai au prochain passage.
        return 'PLUS_TARD';
      }
      const maintenant = new Date();
      const mois = maintenant.getMonth() + 1;
      const annee = maintenant.getFullYear();
      const autreMois = saisie.requete.mois !== mois || saisie.requete.annee !== annee;
      if (statut === 409 && autreMois && !saisie.reporteDepuis) {
        // La facture du mois des soins est déjà partie (clôture automatique) : la saisie est
        // reportée sur la facture du mois en cours, et l'agent en est averti.
        saisie.reporteDepuis = `${MOIS[saisie.requete.mois || 0] || ''} ${saisie.requete.annee || ''}`.trim();
        saisie.requete = { ...saisie.requete, mois, annee };
        await enregistrer(MAGASIN_SAISIES, saisie);
        return this.envoyer(saisie);
      }
      const message = (err as HttpErrorResponse)?.error?.message;
      await enregistrer(MAGASIN_SAISIES, {
        ...saisie, etat: 'ERREUR', erreur: typeof message === 'string' && message ? message : 'Envoi refusé par le serveur.'
      } as SaisieEnAttente);
      return 'ERREUR';
    }
  }

  private annoncer(envoyes: number, erreurs: number, reports: Set<string>) {
    if (!envoyes && !erreurs) return;
    const parties: string[] = [];
    if (envoyes) {
      parties.push(`${envoyes} patient${envoyes > 1 ? 's' : ''} enregistré${envoyes > 1 ? 's' : ''} hors ligne `
        + `${envoyes > 1 ? 'ont' : 'a'} été envoyé${envoyes > 1 ? 's' : ''}`);
    }
    if (reports.size) {
      parties.push(`reporté(s) sur le mois en cours (${[...reports].join(', ')} déjà clôturé)`);
    }
    if (erreurs) {
      parties.push(`${erreurs} refusé${erreurs > 1 ? 's' : ''} : voir « Mes factures »`);
    }
    this.snackBar.open(parties.join(' — ') + '.', 'Fermer',
      { duration: erreurs || reports.size ? 10_000 : 5000, panelClass: erreurs ? 'error-snackbar' : undefined });
  }

  /** Saisies de l'agent connecté (celles d'un autre agent n'attendent que sa propre session). */
  private async lister(): Promise<SaisieEnAttente[]> {
    const utilisateur = this.auth.getCurrentUser();
    if (!utilisateur) return [];
    try {
      const toutes = await listerTout<SaisieEnAttente>(MAGASIN_SAISIES);
      return toutes.filter(s => s.utilisateurId === utilisateur.userId);
    } catch {
      return [];
    }
  }

  private async rafraichir() {
    const saisies = await this.lister();
    this.zone.run(() => this.saisies$.next(saisies.sort((a, b) => a.creeLe.localeCompare(b.creeLe))));
  }

  private cleStructure(objet: string): string | null {
    const structure = this.auth.getCurrentUser()?.structureSanitaireId;
    return structure ? `${objet}:${structure}` : null;
  }
}
