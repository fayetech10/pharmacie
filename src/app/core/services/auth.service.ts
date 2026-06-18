import { Injectable, NgZone } from '@angular/core';
import { ApiService } from './api.service';
import { LoginRequest, LoginResponse, Role } from '../models/user.model';
import { Observable, tap } from 'rxjs';
import { Router } from '@angular/router';

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
   * Stockage de la session : `sessionStorage` (et non `localStorage`) pour que
   * la session soit EFFACÉE à la fermeture de l'onglet / du navigateur.
   * Conséquence : à la réouverture, l'utilisateur retombe sur la page de connexion.
   */
  private readonly store: Storage = sessionStorage;

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
    // Migration / sécurité : on purge toute session persistée par l'ancien
    // comportement (localStorage), qui survivait à la fermeture du navigateur.
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.LEGACY_EXPIRY_KEY);

    // Au démarrage de l'application, on vérifie l'état de la session existante
    // à partir de l'expiration réelle du token JWT.
    if (this.getRawToken()) {
      if (this.isSessionExpired()) {
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
        // L'expiration est désormais déduite du token : aucun horodatage séparé à poser.
        this.scheduleAutoLogout();
        this.startIdleTracking();
      })
    );
  }

  logout(): void {
    this.clearSession();
    // Sécurité : on purge le cache des données pour ne pas exposer celles de la session précédente.
    this.api.invalidateCache();
    this.router.navigate(['/auth/login']);
  }

  getCurrentUser(): LoginResponse | null {
    const userStr = this.store.getItem(this.USER_KEY);
    if (!userStr) {
      return null;
    }
    if (this.isSessionExpired()) {
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
    return user ? user.token : null;
  }

  hasRole(role: Role): boolean {
    const user = this.getCurrentUser();
    return user ? user.role === role : false;
  }

  isPharmacien(): boolean { return this.hasRole(Role.PHARMACIEN); }
  isServiceRegional(): boolean { return this.hasRole(Role.SERVICE_REGIONAL); }
  isServiceCentral(): boolean { return this.hasRole(Role.SERVICE_CENTRAL); }
  isAdmin(): boolean { return this.hasRole(Role.ADMIN); }

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
      // base64url -> base64, puis décodage UTF-8 robuste.
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
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
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    this.stopIdleTracking();
  }
}
