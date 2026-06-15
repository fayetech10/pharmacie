import { Injectable } from '@angular/core';
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

  constructor(private api: ApiService, private router: Router) {
    // Au démarrage de l'application, on vérifie l'état de la session existante
    // à partir de l'expiration réelle du token JWT.
    if (this.getRawToken()) {
      if (this.isSessionExpired()) {
        // Déjà expirée : on purge. Le guard redirigera vers la connexion.
        this.clearSession();
      } else {
        this.scheduleAutoLogout();
      }
    }
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', request).pipe(
      tap(res => {
        localStorage.setItem(this.USER_KEY, JSON.stringify(res));
        // L'expiration est désormais déduite du token : aucun horodatage séparé à poser.
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

  getCurrentUser(): LoginResponse | null {
    const userStr = localStorage.getItem(this.USER_KEY);
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
    const userStr = localStorage.getItem(this.USER_KEY);
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

  /** Vide la session locale et annule le minuteur (sans redirection). */
  private clearSession(): void {
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.LEGACY_EXPIRY_KEY);
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }
}
