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

  constructor(private api: ApiService, private router: Router) {}

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/auth/login', request).pipe(
      tap(res => {
        localStorage.setItem(this.USER_KEY, JSON.stringify(res));
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.USER_KEY);
    this.router.navigate(['/auth/login']);
  }

  getCurrentUser(): LoginResponse | null {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (userStr) {
      return JSON.parse(userStr);
    }
    return null;
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
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
}
