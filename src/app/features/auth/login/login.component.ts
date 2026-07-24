import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../core/services/confirm.service';
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
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  loginForm: FormGroup;
  hidePassword = true;
  isLoading = false;
  errorMessage = '';
  year = new Date().getFullYear();
  emailFocused = false;
  passwordFocused = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private confirm: ConfirmService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      // L'identifiant accepte l'email OU le username attribué à l'import (pharmacies,
      // structures) : pas de Validators.email, qui rejetterait les usernames.
      email: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: (res) => {
        // Compte créé en masse avec le mot de passe générique : changement imposé
        // avant d'entrer dans l'application.
        if (res.mustChangePassword) {
          this.isLoading = false;
          this.imposerChangementMotDePasse();
          return;
        }
        this.redirigerSelonRole();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Identifiant ou mot de passe incorrect';
        console.error(err);
      }
    });
  }

  /** Demande un nouveau mot de passe puis, une fois changé, entre dans l'application. */
  private imposerChangementMotDePasse() {
    const ancien = this.loginForm.value.password;
    this.confirm.prompt({
      title: 'Choisissez votre mot de passe',
      message: 'Votre compte utilise encore le mot de passe générique. '
        + 'Pour votre sécurité, définissez un nouveau mot de passe (8 caractères minimum).',
      label: 'Nouveau mot de passe',
      required: true,
      confirmText: 'Enregistrer',
      cancelText: 'Se déconnecter'
    }).subscribe(nouveau => {
      if (!nouveau) {
        this.authService.logout();
        return;
      }
      if (nouveau.length < 8) {
        this.errorMessage = 'Le nouveau mot de passe doit contenir au moins 8 caractères.';
        this.imposerChangementMotDePasse();
        return;
      }
      this.isLoading = true;
      this.authService.changePassword(ancien, nouveau).subscribe({
        next: () => this.redirigerSelonRole(),
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err?.error?.message || 'Impossible de changer le mot de passe.';
          this.imposerChangementMotDePasse();
        }
      });
    });
  }

  private redirigerSelonRole() {
    if (this.authService.isPharmacien()) {
      this.router.navigate(['/dashboard/espace-pharmacie']);
    } else if (this.authService.isServiceCentral()) {
      this.router.navigate(['/dashboard/espace-central']);
    } else if (this.authService.isServiceRegional()) {
      this.router.navigate(['/dashboard/espace-region']);
    } else if (this.authService.isAdmin()) {
      this.router.navigate(['/dashboard/regions']);
    } else if (this.authService.isBcsu()) {
      this.router.navigate(['/dashboard/espace-bcsu']);
    } else if (this.authService.isStructureSanitaire()) {
      this.router.navigate(['/dashboard/espace-structure']);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
