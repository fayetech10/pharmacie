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
  private readonly EXPIRY_KEY = 'csu_session_expiry';
  /** Durée de validité d'une session : 1 jour. */
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
  /** Minuteur de déconnexion automatique à l'expiration du token. */
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private api: ApiService, private router: Router) {
    // Au démarrage de l'application, on vérifie l'état de la session existante.
    if (localStorage.getItem(this.USER_KEY)) {
      if (!localStorage.getItem(this.EXPIRY_KEY)) {
        // Session héritée (sans horodatage) : on lui accorde une fenêtre d'1 jour.
        this.setExpiry();
      }
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
        this.setExpiry();
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

  /** Vrai si la session possède un horodatage d'expiration dépassé. */
  isSessionExpired(): boolean {
    const expiry = this.getExpiry();
    return expiry > 0 && Date.now() >= expiry;
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

  // ----- Gestion de l'expiration -----

  /** Enregistre l'instant d'expiration : maintenant + 1 jour. */
  private setExpiry(): void {
    localStorage.setItem(this.EXPIRY_KEY, String(Date.now() + this.SESSION_DURATION_MS));
  }

  private getExpiry(): number {
    const v = localStorage.getItem(this.EXPIRY_KEY);
    return v ? +v : 0;
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
    this.expiryTimer = setTimeout(() => this.logout(), remaining);
  }

  /** Vide la session locale et annule le minuteur (sans redirection). */
  private clearSession(): void {
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.EXPIRY_KEY);
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }
}
