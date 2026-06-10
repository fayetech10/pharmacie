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
        <div class="brand-top">
          <div class="brand-logo">
            <mat-icon>local_pharmacy</mat-icon>
          </div>
          <span class="brand-title">CSU Sénégal</span>
        </div>

        <div class="brand-hero">
          <h2>Gestion des factures<br>pharmaceutiques</h2>
          <p>La plateforme de la Couverture Sanitaire Universelle pour saisir, suivre et valider les factures en toute simplicité.</p>

          <ul class="brand-points">
            <li><mat-icon>edit_note</mat-icon> Saisie rapide des prescriptions</li>
            <li><mat-icon>verified</mat-icon> Circuit de validation transparent</li>
            <li><mat-icon>insights</mat-icon> Suivi et statistiques en temps réel</li>
          </ul>
        </div>

        <span class="brand-footer">© {{ year }} Couverture Sanitaire Universelle — Sénégal</span>
      </aside>

      <!-- Panneau formulaire -->
      <section class="form-panel">
        <div class="form-wrap fade-in">
          <div class="form-logo-mobile">
            <div class="brand-logo"><mat-icon>local_pharmacy</mat-icon></div>
            <span>CSU Sénégal</span>
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

          <div class="demo-hint">
            <mat-icon>info_outline</mat-icon>
            <span>Compte démo : <strong>pharmacien&#64;csu.sn</strong> · password123</span>
          </div>
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

    /* ---- Panneau marque ---- */
    .brand-panel {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 48px;
      color: #fff;
      background: linear-gradient(150deg, #1E40AF 0%, #2563EB 45%, #0D9488 100%);
      overflow: hidden;
    }
    .brand-panel::after {
      content: '';
      position: absolute;
      width: 480px;
      height: 480px;
      right: -160px;
      bottom: -160px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.06);
    }
    .brand-top {
      display: flex;
      align-items: center;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    .brand-logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    .brand-logo mat-icon { color: #fff; }
    .brand-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }

    .brand-hero { position: relative; z-index: 1; max-width: 420px; }
    .brand-hero h2 {
      font-size: 34px;
      font-weight: 800;
      line-height: 1.15;
      margin: 0 0 16px;
    }
    .brand-hero p {
      font-size: 16px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.85);
      margin: 0 0 32px;
    }
    .brand-points { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
    .brand-points li { display: flex; align-items: center; gap: 12px; font-size: 15px; font-weight: 500; }
    .brand-points mat-icon {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 5px;
      font-size: 20px;
      width: 30px;
      height: 30px;
    }
    .brand-footer { position: relative; z-index: 1; font-size: 13px; color: rgba(255, 255, 255, 0.7); }

    /* ---- Panneau formulaire ---- */
    .form-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
    }
    .form-wrap { width: 100%; max-width: 380px; }
    .form-logo-mobile { display: none; align-items: center; gap: 12px; margin-bottom: 32px; }
    .form-logo-mobile .brand-logo { background: linear-gradient(135deg, var(--primary), var(--accent)); }
    .form-logo-mobile span { font-size: 19px; font-weight: 700; color: var(--text-primary); }

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

    .demo-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 28px;
      padding: 12px 14px;
      background: var(--primary-light);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 13px;
    }
    .demo-hint mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--primary); }
    .demo-hint strong { color: var(--text-primary); }

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
      email: ['pharmacien@csu.sn', [Validators.required, Validators.email]],
      password: ['password123', Validators.required]
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
          this.router.navigate(['/dashboard/factures']);
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
