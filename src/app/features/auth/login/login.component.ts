import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="login-layout">
      <!-- Panneau marque (masqué sur mobile) -->
      <aside class="brand-panel">
        <span class="brand-csu-chip">
          <img src="assets/logo-csu.png" alt="SEN-CSU">
        </span>
        <div class="brand-center">
          <span class="brand-logo-card">
            <img src="assets/logo-pharmacie.png" alt="Logo Pharmacie">
          </span>
          <h2>Gestion des Factures Pharmaceutiques</h2>
          <p>Couverture Sanitaire Universelle · Sénégal</p>
        </div>
      </aside>

      <!-- Panneau formulaire -->
      <section class="form-panel">
        <div class="form-wrap fade-in">
          <div class="form-logo-mobile">
            <img src="assets/logo-pharmacie.png" alt="Logo Pharmacie" class="logo-img-mobile">
          </div>

          <h1>Connexion</h1>
          <p class="subtitle">Accédez à votre espace de gestion</p>

          <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Adresse e-mail</mat-label>
              <input matInput formControlName="email" type="email" placeholder="vous@csu.sn" autocomplete="email">
              <mat-icon matPrefix>mail_outline</mat-icon>
              <mat-error *ngIf="loginForm.get('email')?.hasError('required')">L'email est requis</mat-error>
              <mat-error *ngIf="loginForm.get('email')?.hasError('email')">Format d'email invalide</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Mot de passe</mat-label>
              <input matInput formControlName="password" [type]="hidePassword ? 'password' : 'text'" autocomplete="current-password">
              <mat-icon matPrefix>lock_outline</mat-icon>
              <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword" type="button" [attr.aria-label]="hidePassword ? 'Afficher le mot de passe' : 'Masquer le mot de passe'">
                <mat-icon>{{hidePassword ? 'visibility_off' : 'visibility'}}</mat-icon>
              </button>
              <mat-error *ngIf="loginForm.get('password')?.hasError('required')">Le mot de passe est requis</mat-error>
            </mat-form-field>

            <div class="error-message" *ngIf="errorMessage">
              <mat-icon>error_outline</mat-icon>
              <span>{{ errorMessage }}</span>
            </div>

            <button class="btn btn-primary btn-block submit-btn" type="submit" [disabled]="loginForm.invalid || isLoading">
              <mat-spinner diameter="20" *ngIf="isLoading"></mat-spinner>
              <span *ngIf="!isLoading">Se connecter</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .login-layout {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      background: var(--bg);
    }

    /* ---- Panneau marque navy ---- */
    .brand-panel {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 48px;
      background: linear-gradient(160deg, var(--ink) 0%, var(--ink-deep) 100%);
      overflow: hidden;
    }
    .brand-panel::before {
      content: '';
      position: absolute;
      width: 560px;
      height: 560px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,255,255,0.07), transparent 65%);
      top: -160px;
      right: -160px;
    }
    .brand-csu-chip {
      position: absolute;
      top: 28px;
      left: 28px;
      width: 72px;
      height: 72px;
      border-radius: 18px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-md);
      z-index: 1;
    }
    .brand-csu-chip img { width: 56px; height: 56px; object-fit: contain; }
    .brand-center { text-align: center; z-index: 1; }
    .brand-logo-card {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 200px;
      height: 200px;
      border-radius: 36px;
      background: #fff;
      box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.35);
      margin-bottom: 28px;
    }
    .brand-logo-card img { width: 150px; height: 150px; object-fit: contain; }
    .brand-center h2 {
      color: #fff;
      font-size: 24px;
      font-weight: 800;
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }
    .brand-center p {
      color: var(--ink-text);
      margin: 0;
      font-size: 15px;
    }

    /* ---- Panneau formulaire ---- */
    .form-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 24px;
    }
    .form-wrap { width: 100%; max-width: 380px; }
    .form-logo-mobile { display: none; align-items: center; justify-content: center; margin-bottom: 24px; }
    .logo-img-mobile { width: 120px; height: auto; object-fit: contain; }

    .form-wrap h1 { font-size: 28px; font-weight: 700; margin: 0 0 6px; color: var(--text-primary); }
    .subtitle { color: var(--text-secondary); margin: 0 0 32px; font-size: 15px; }

    .full-width { width: 100%; }
    .full-width mat-icon[matPrefix] { margin-right: 8px; color: var(--text-muted); }

    .submit-btn { height: 48px; font-size: 15px; margin-top: 8px; }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--warn-light);
      color: #B91C1C;
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      margin-bottom: 16px;
      font-size: 13.5px;
      font-weight: 500;
    }
    .error-message mat-icon { font-size: 18px; width: 18px; height: 18px; }

    @media (max-width: 900px) {
      .login-layout { grid-template-columns: 1fr; }
      .brand-panel { display: none; }
      .form-logo-mobile { display: flex; }
    }
  `]
})
export class LoginComponent {
  loginForm: FormGroup;
  hidePassword = true;
  isLoading = false;
  errorMessage = '';
  year = new Date().getFullYear();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        if (this.authService.isPharmacien()) {
          this.router.navigate(['/dashboard']);
        } else if (this.authService.isServiceCentral() || this.authService.isAdmin()) {
          // Central et Admin voient « Factures (Par Région) » en première vue
          this.router.navigate(['/dashboard/regions']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Email ou mot de passe incorrect';
        console.error(err);
      }
    });
  }
}
