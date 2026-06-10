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
        <img src="assets/logo-csu.png" alt="SEN-CSU" class="brand-csu-logo">
        <img src="assets/logo-pharmacie.png" alt="Logo Pharmacie" class="brand-logo-img">
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

    /* ---- Panneau marque : logo uniquement ---- */
    .brand-panel {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 48px;
      background: var(--primary-light);
      overflow: hidden;
    }
    .brand-csu-logo {
      position: absolute;
      top: 32px;
      left: 32px;
      width: 80px;
      height: auto;
      z-index: 1;
    }
    .brand-logo-img {
      width: 340px;
      max-width: 75%;
      height: auto;
      object-fit: contain;
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
