import { Injectable, NgZone } from '@angular/core';
import { ApiService } from './api.service';
import { LoginRequest, LoginResponse, Role } from '../models/user.model';
import { BehaviorSubject, Observable, switchMap, tap } from 'rxjs';
import { Router } from '@angular/router';
import { memoriserCompte, ouvrirCompte } from '../hors-ligne/comptes-hors-ligne';

/** Rôles qui travaillent hors ligne : postes et centres de santé (facturation CSU de l'Espace PS). */
function travailleHorsLigne(session: LoginResponse): boolean {
  const role = session.roleEffectif
    ?? (session.role === Role.STRUCTURE_SANITAIRE
      ? (session.structureType === 'PS' ? Role.POSTE_SANTE : Role.CENTRE_SANTE)
      : session.role);
  return role === Role.POSTE_SANTE || role === Role.CENTRE_SANTE;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly USER_KEY = 'csu_user';
  /** Ancienne clé d'horodatage (sessions historiques) : purgée au nettoyage. */
  private readonly LEGACY_EXPIRY_KEY = 'csu_session_expiry';
  /** Délai maximal d'un setTimeout (entier 32 bits signé, ~24,8 jours). */
  private readonly MAX_TIMEOUT_MS = 2_147_483_647;
  /** Minuteur de déconnexion automatique à l'expiration du token. */
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Stockage de la session : `localStorage`, pour qu'elle SURVIVE à la fermeture de l'onglet,
   * au rechargement et surtout au redémarrage de l'appareil (PWA mobile : téléphone éteint puis
   * rallumé). La durée de vie reste bornée par deux garde-fous : l'expiration réelle du jeton JWT
   * (24 h côté serveur → auto-logout programmé + purge au démarrage) et la déconnexion après
   * 30 min d'inactivité tant que l'application tourne. Un jeton expiré est purgé au démarrage, donc
   * la persistance n'ouvre jamais une session au-delà de la validité du jeton.
   */
  private readonly store: Storage = localStorage;

  // ----- Session hors ligne -----
  /**
   * Session ouverte sans réseau (mot de passe reconnu par l'appareil). Son jeton a pu expirer :
   * elle reste ouverte tant qu'on travaille hors ligne, mais rien n'est envoyé au serveur avec
   * un jeton périmé — l'agent se reconnecte d'abord (cf. reconnexionRequise$).
   */
  private readonly HORS_LIGNE_KEY = 'csu_session_hors_ligne';
  /** Identifiant tapé à la connexion : sert à la reconnexion sans quitter l'écran. */
  private readonly IDENTIFIANT_KEY = 'csu_identifiant';
  /** Le serveur est joignable mais la session hors ligne a expiré : il faut se reconnecter. */
  readonly reconnexionRequise$ = new BehaviorSubject<boolean>(false);

  // ----- Déconnexion automatique après inactivité -----
  /** Durée d'inactivité (souris/clavier) au-delà de laquelle on déconnecte. */
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  /** Événements considérés comme une activité de l'utilisateur. */
  private readonly ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  /** Minuteur d'inactivité. */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Horodatage de la dernière réinitialisation (anti-rafale sur mousemove). */
  private lastIdleResetAt = 0;
  /** Référence stable du gestionnaire (nécessaire pour add/removeEventListener). */
  private readonly activityHandler = () => this.onUserActivity();

  constructor(private api: ApiService, private router: Router, private zone: NgZone) {
    // Purge d'un éventuel horodatage d'expiration historique (plus utilisé : l'expiration
    // est désormais déduite du jeton). La session (USER_KEY) est volontairement conservée.
    this.store.removeItem(this.LEGACY_EXPIRY_KEY);

    // Au démarrage de l'application, on vérifie l'état de la session existante
    // à partir de l'expiration réelle du token JWT.
    if (this.getRawToken()) {
      if (this.estSessionHorsLigne()) {
        // Session hors ligne (rechargement de la page) : elle survit à l'expiration du jeton.
        this.startIdleTracking();
      } else if (this.isSessionExpired()) {
        // Déjà expirée : on purge. Le guard redirigera vers la connexion.
        this.clearSession();
      } else {
        this.scheduleAutoLogout();
        this.startIdleTracking();
      }
    }
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', request).pipe(
      tap(res => {
        this.store.setItem(this.USER_KEY, JSON.stringify(res));
        this.store.removeItem(this.HORS_LIGNE_KEY);
        this.store.setItem(this.IDENTIFIANT_KEY, request.email || '');
        this.reconnexionRequise$.next(false);
        // L'expiration est désormais déduite du token : aucun horodatage séparé à poser.
        this.scheduleAutoLogout();
        this.startIdleTracking();
      })
    );
  }

  /**
   * Mémorise, chiffrée par le mot de passe, la session d'un poste ou d'un centre de santé :
   * l'agent pourra entrer sur cet appareil sans réseau. Sans effet pour les autres rôles.
   */
  memoriserPourHorsLigne(identifiant: string, motDePasse: string, session: LoginResponse): void {
    if (!travailleHorsLigne(session) || session.mustChangePassword) return;
    memoriserCompte(identifiant, motDePasse, session).catch(() => { /* mode hors ligne simplement indisponible */ });
  }

  /**
   * Connexion sans réseau : le mot de passe ouvre la session mémorisée lors de la dernière
   * connexion en ligne. Lève ErreurConnexionHorsLigne (inconnu, expiré, mot de passe…).
   */
  async connexionHorsLigne(identifiant: string, motDePasse: string): Promise<LoginResponse> {
    const session = await ouvrirCompte(identifiant, motDePasse);
    this.zone.run(() => {
      this.store.setItem(this.USER_KEY, JSON.stringify(session));
      this.store.setItem(this.HORS_LIGNE_KEY, '1');
      this.store.setItem(this.IDENTIFIANT_KEY, identifiant);
      this.reconnexionRequise$.next(false);
      this.startIdleTracking();
    });
    return session;
  }

  /** Reconnexion en ligne sans quitter l'écran (session hors ligne expirée, réseau revenu). */
  reconnecter(motDePasse: string): Observable<LoginResponse> {
    const identifiant = this.store.getItem(this.IDENTIFIANT_KEY) || this.getCurrentUser()?.username
      || this.getCurrentUser()?.email || '';
    return this.login({ email: identifiant, password: motDePasse } as LoginRequest).pipe(
      tap(res => this.memoriserPourHorsLigne(identifiant, motDePasse, res))
    );
  }

  /** Session ouverte hors ligne (jeton peut-être expiré). */
  estSessionHorsLigne(): boolean {
    return this.store.getItem(this.HORS_LIGNE_KEY) === '1';
  }

  /** Le serveur a refusé le jeton d'une session hors ligne : on garde la session, on demande la reconnexion. */
  signalerReconnexionRequise(): void {
    if (!this.reconnexionRequise$.value) this.zone.run(() => this.reconnexionRequise$.next(true));
  }

  /**
   * Change le mot de passe de l'utilisateur connecté et lève le drapeau
   * « mot de passe à changer » posé lors d'une création en masse.
   *
   * Le changement ne renvoie pas de jeton : l'ancien porte encore le claim « mot de passe
   * provisoire » (mcp), que le backend refuse en 403 partout SAUF sur /auth/moi. Sans
   * rafraîchissement, l'espace ouvert juste après récoltait ce 403 et retombait sur le
   * login. On enchaîne donc un /auth/moi, qui émet un jeton NEUF (mcp levé) et le contexte
   * à jour, puis on le stocke — la redirection dispose alors d'une session pleinement valide.
   */
  changePassword(ancienMotDePasse: string, nouveauMotDePasse: string): Observable<LoginResponse> {
    return this.api.post<void>('/auth/change-password', { ancienMotDePasse, nouveauMotDePasse }).pipe(
      switchMap(() => this.api.get<LoginResponse>('/auth/moi')),
      tap(res => {
        this.store.setItem(this.USER_KEY, JSON.stringify(res));
        this.scheduleAutoLogout();
      })
    );
  }

  logout(): void {
    this.clearSession();
    // Sécurité : on purge le cache des données pour ne pas exposer celles de la session précédente.
    this.api.invalidateCache();
    this.router.navigate(['/auth/login']);
  }

  /**
   * Met à jour l'utilisateur mémorisé dans le MÊME stockage que la session (ex. après un
   * pointage d'arrivée/départ). Évite d'écrire en dur dans un stockage différent de `store`.
   */
  majUtilisateurCourant(user: LoginResponse): void {
    this.store.setItem(this.USER_KEY, JSON.stringify(user));
  }

  getCurrentUser(): LoginResponse | null {
    const userStr = this.store.getItem(this.USER_KEY);
    if (!userStr) {
      return null;
    }
    if (this.isSessionExpired() && !this.estSessionHorsLigne()) {
      // Token expiré : on nettoie pour que isLoggedIn() (et donc les guards) renvoient false.
      this.clearSession();
      return null;
    }
    return JSON.parse(userStr);
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }

  /** Vrai si le token est absent/illisible ou si son expiration est dépassée. */
  isSessionExpired(): boolean {
    const expiry = this.getExpiry();
    // Token présent mais expiration illisible → considéré expiré (token corrompu).
    if (expiry <= 0) return true;
    return Date.now() >= expiry;
  }

  getToken(): string | null {
    const user = this.getCurrentUser();
    // Session hors ligne au jeton périmé : on n'envoie pas un jeton que le serveur refusera.
    return user && !this.isSessionExpired() ? user.token : null;
  }

  hasRole(role: Role): boolean {
    const user = this.getCurrentUser();
    return user ? user.role === role : false;
  }

  isPharmacien(): boolean { return this.hasRole(Role.PHARMACIEN); }
  isServiceRegional(): boolean { return this.hasRole(Role.SERVICE_REGIONAL); }
  isServiceCentral(): boolean { return this.hasRole(Role.SERVICE_CENTRAL); }
  isAdmin(): boolean { return this.hasRole(Role.ADMIN); }
  isBcsu(): boolean { return this.hasRole(Role.BCSU); }
  isDistrict(): boolean { return this.hasRole(Role.DISTRICT); }

  /**
   * Rôle réellement appliqué. Les comptes portant le rôle générique historique
   * `STRUCTURE_SANITAIRE` sont résolus en `POSTE_SANTE` / `CENTRE_SANTE` selon le type
   * de leur structure — c'est ce que fait déjà le serveur, on le reproduit ici pour que
   * les guards et la navigation raisonnent sur la même valeur.
   */
  getRoleEffectif(): Role | undefined {
    const user = this.getCurrentUser();
    if (!user) return undefined;
    if (user.roleEffectif) return user.roleEffectif;
    if (user.role !== Role.STRUCTURE_SANITAIRE) return user.role;
    return user.structureType === 'PS' ? Role.POSTE_SANTE : Role.CENTRE_SANTE;
  }

  /** Tout point de soins : poste, centre, EPS — quel que soit le rôle porté par le compte. */
  isStructureSanitaire(): boolean {
    const role = this.getRoleEffectif();
    return role === Role.POSTE_SANTE || role === Role.CENTRE_SANTE
      || role === Role.STRUCTURE_SANITAIRE;
  }

  isPosteDeSante(): boolean { return this.getRoleEffectif() === Role.POSTE_SANTE; }
  isCentreDeSante(): boolean { return this.getRoleEffectif() === Role.CENTRE_SANTE; }

  /**
   * Capacité district : compte District, ou centre de santé désigné « siège du district »
   * (double casquette — il garde son espace centre et gagne les écrans du district).
   */
  aCapaciteDistrict(): boolean {
    if (this.isDistrict()) return true;
    const user = this.getCurrentUser();
    return !!user?.siegeDistrict && !!user.districtId && this.isCentreDeSante();
  }

  /** Consolidation district (§9) : réservée au district (compte District ou centre siège). */
  canConsolider(): boolean {
    return this.aCapaciteDistrict();
  }

  getStructureNom(): string | undefined {
    return this.getCurrentUser()?.structureNom;
  }

  getDistrictId(): string | undefined {
    return this.getCurrentUser()?.districtId;
  }

  /** Gestion des pharmacies : Service Régional uniquement (Central et Admin exclus). */
  canManagePharmacies(): boolean {
    return this.isServiceRegional();
  }

  // ----- Gestion de l'expiration (basée sur le token JWT) -----

  /** Lit le token brut depuis le stockage, sans contrôle d'expiration (évite la récursion). */
  private getRawToken(): string | null {
    const userStr = this.store.getItem(this.USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr).token ?? null;
    } catch {
      return null;
    }
  }

  /** Instant d'expiration (ms epoch) de la session, déduit du claim `exp` du token. */
  private getExpiry(): number {
    const token = this.getRawToken();
    return token ? this.decodeTokenExpiry(token) : 0;
  }

  /**
   * Décode le claim `exp` (en secondes) du JWT et le convertit en ms epoch.
   * Renvoie 0 si le token est malformé ou dépourvu d'expiration.
   */
  private decodeTokenExpiry(token: string): number {
    try {
      const payload = token.split('.')[1];
      if (!payload) return 0;
      // base64url -> base64, avec ajout du padding nécessaire pour atob()
      let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4;
      if (pad === 2) {
        base64 += '==';
      } else if (pad === 3) {
        base64 += '=';
      }
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const claims = JSON.parse(json);
      return typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Programme la redirection automatique vers la page de connexion
   * à l'instant exact de l'expiration du token (même si l'utilisateur reste inactif).
   */
  private scheduleAutoLogout(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    // Hors ligne, l'expiration du jeton ne ferme pas la session (seule l'inactivité la ferme).
    if (this.estSessionHorsLigne()) return;
    const remaining = this.getExpiry() - Date.now();
    if (remaining <= 0) {
      this.logout();
      return;
    }
    // setTimeout est borné à ~24,8 jours : au-delà, on reprogramme par paliers.
    const delay = Math.min(remaining, this.MAX_TIMEOUT_MS);
    this.expiryTimer = setTimeout(
      () => (delay < remaining ? this.scheduleAutoLogout() : this.logout()),
      delay
    );
  }

  // ----- Inactivité -----

  /**
   * Démarre le suivi d'inactivité : écoute l'activité de l'utilisateur et arme
   * le minuteur de déconnexion. Les écouteurs sont posés hors zone Angular pour
   * ne pas déclencher de détection de changement à chaque mouvement de souris.
   */
  private startIdleTracking(): void {
    this.zone.runOutsideAngular(() => {
      this.ACTIVITY_EVENTS.forEach(evt =>
        document.addEventListener(evt, this.activityHandler, { passive: true })
      );
    });
    this.armIdleTimer();
  }

  /** Arrête le suivi d'inactivité et annule le minuteur. */
  private stopIdleTracking(): void {
    this.ACTIVITY_EVENTS.forEach(evt =>
      document.removeEventListener(evt, this.activityHandler)
    );
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** (Ré)arme le minuteur d'inactivité pour IDLE_TIMEOUT_MS à partir de maintenant. */
  private armIdleTimer(): void {
    this.lastIdleResetAt = Date.now();
    if (this.idleTimer) clearTimeout(this.idleTimer);
    // Au bout du délai sans activité : déconnexion (retour dans la zone Angular
    // pour que la navigation/le rendu se mettent à jour).
    this.idleTimer = setTimeout(
      () => this.zone.run(() => this.logout()),
      this.IDLE_TIMEOUT_MS
    );
  }

  /** Activité détectée : réarme le minuteur (au plus une fois par seconde). */
  private onUserActivity(): void {
    const now = Date.now();
    // Les événements « mousemove » sont très fréquents : on limite la cadence.
    if (now - this.lastIdleResetAt < 1000) return;
    this.armIdleTimer();
  }

  /** Vide la session locale, annule les minuteurs et coupe le suivi d'inactivité. */
  private clearSession(): void {
    this.store.removeItem(this.USER_KEY);
    this.store.removeItem(this.LEGACY_EXPIRY_KEY);
    this.store.removeItem(this.HORS_LIGNE_KEY);
    this.store.removeItem(this.IDENTIFIANT_KEY);
    // Dernière page visitée (RestaurationRouteService) : ne pas la rouvrir pour la session suivante.
    this.store.removeItem('csu_derniere_route');
    if (this.reconnexionRequise$.value) this.reconnexionRequise$.next(false);
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.stopIdleTracking();
  }
}
