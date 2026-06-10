import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { FactureService } from '../../core/services/facture.service';
import { LoginResponse } from '../../core/models/user.model';
import { Facture } from '../../core/models/facture.model';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule
  ],
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/dashboard" class="brand">
          <img class="brand-logo-img" [src]="brandLogo" alt="Logo" />
          <span class="brand-name">CSU Sénégal</span>
        </a>

        <nav class="nav-links">
          <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-link" *ngIf="authService.isPharmacien()">
            <mat-icon>edit_note</mat-icon>
            <span>Saisie</span>
          </a>
          <a routerLink="/dashboard/regions" routerLinkActive="active" class="nav-link" *ngIf="authService.isAdmin() || authService.isServiceCentral()">
            <mat-icon>receipt_long</mat-icon>
            <span>Factures (Par Région)</span>
          </a>
          <a routerLink="/dashboard/factures" routerLinkActive="active" class="nav-link" *ngIf="!authService.isServiceCentral()">
            <mat-icon>receipt_long</mat-icon>
            <span>{{ authService.isPharmacien() ? 'Mes Factures' : 'Factures' }}</span>
          </a>
          <a routerLink="/dashboard/stats" routerLinkActive="active" class="nav-link" *ngIf="authService.isServiceRegional() || authService.isServiceCentral()">
            <mat-icon>bar_chart</mat-icon>
            <span>Statistiques</span>
          </a>
          <a routerLink="/dashboard/medicaments" routerLinkActive="active" class="nav-link" *ngIf="authService.isServiceCentral() || authService.isAdmin()">
            <mat-icon>medication</mat-icon>
            <span>Médicaments</span>
          </a>
          <a routerLink="/dashboard/pharmacies" routerLinkActive="active" class="nav-link" *ngIf="authService.canManagePharmacies()">
            <mat-icon>local_pharmacy</mat-icon>
            <span>Pharmacies</span>
          </a>
          <a routerLink="/dashboard/utilisateurs" routerLinkActive="active" class="nav-link" *ngIf="authService.isAdmin()">
            <mat-icon>manage_accounts</mat-icon>
            <span>Utilisateurs</span>
          </a>
        </nav>

        <div class="topbar-right">
          <div class="user-pill" [matMenuTriggerFor]="userMenu">
            <div class="user-avatar">
              {{ currentUser?.prenom?.charAt(0) }}{{ currentUser?.nom?.charAt(0) }}
            </div>
            <div class="user-details">
              <span class="user-name">{{ currentUser?.prenom }} {{ currentUser?.nom }}</span>
              <span class="user-role">{{ getRoleLabel(currentUser?.role || '') }}</span>
            </div>
            <mat-icon class="dropdown-arrow">expand_more</mat-icon>
          </div>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>Se déconnecter</span>
            </button>
          </mat-menu>
        </div>
      </div>
    </header>

    <div class="alert-banner" *ngIf="retards.length > 0">
      <div class="alert-inner">
        <mat-icon>warning_amber</mat-icon>
        <span>
          Vous avez <strong>{{ retards.length }}</strong> facture(s) en retard à l'état BROUILLON.
          Veuillez les envoyer au service régional.
        </span>
        <button class="alert-btn" (click)="voirRetards()">Voir les retards</button>
      </div>
    </div>

    <main class="main-content">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #FFFFFF;
      border-bottom: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }
    .topbar-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 24px;
      height: 64px;
      display: flex;
      align-items: center;
      gap: 32px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--text-primary);
      flex-shrink: 0;
    }
    .brand-logo-img {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: block;
      flex-shrink: 0;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      overflow-x: auto;
    }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
      white-space: nowrap;
      transition: all 0.2s ease;
    }
    .nav-link mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .nav-link:hover {
      background: var(--border-light);
      color: var(--text-primary);
    }
    .nav-link.active {
      background: var(--primary-light);
      color: var(--primary);
    }

    .topbar-right {
      flex-shrink: 0;
    }
    .user-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 12px 6px 6px;
      border-radius: 40px;
      cursor: pointer;
      transition: background 0.2s ease;
      border: 1px solid var(--border);
    }
    .user-pill:hover {
      background: var(--border-light);
    }
    .user-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563EB, #7C3AED);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .user-details {
      display: flex;
      flex-direction: column;
    }
    .user-name {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.2;
      color: var(--text-primary);
    }
    .user-role {
      font-size: 11px;
      color: var(--text-secondary);
    }
    .dropdown-arrow {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--text-muted);
    }

    .main-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 28px 24px;
    }

    .alert-banner {
      background: linear-gradient(90deg, #FEF2F2, #FFF7ED);
      border-bottom: 1px solid #FECACA;
    }
    .alert-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      font-weight: 500;
      color: #B91C1C;
    }
    .alert-inner mat-icon {
      color: #EF4444;
      font-size: 22px;
    }
    .alert-btn {
      margin-left: auto;
      padding: 6px 16px;
      border-radius: 6px;
      border: 1px solid #EF4444;
      background: white;
      color: #EF4444;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .alert-btn:hover {
      background: #EF4444;
      color: white;
    }

    @media (max-width: 768px) {
      .topbar-inner {
        padding: 0 16px;
        gap: 16px;
      }
      .brand-name {
        display: none;
      }
      .user-details {
        display: none;
      }
      .dropdown-arrow {
        display: none;
      }
      .user-pill {
        padding: 4px;
        border: none;
      }
      .nav-link span {
        display: none;
      }
      .nav-link {
        padding: 8px;
      }
      .main-content {
        padding: 16px;
      }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  currentUser: LoginResponse | null = null;
  retards: Facture[] = [];

  /** Logo affiché dans la topbar : pharmacie pour le Pharmacien, CSU pour Régional/Central/Admin. */
  get brandLogo(): string {
    return this.authService.isPharmacien()
      ? 'assets/logo-pharmacie.png'
      : 'assets/logo-csu.png';
  }

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private router: Router
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    if (this.authService.isPharmacien()) {
      this.factureService.getRetards().subscribe(res => {
        this.retards = res || [];
      });
    }
  }

  voirRetards() {
    this.router.navigate(['/dashboard/factures']);
  }

  logout() {
    this.authService.logout();
  }

  getRoleLabel(role: string): string {
    switch(role) {
      case 'PHARMACIEN': return 'Pharmacien';
      case 'SERVICE_REGIONAL': return 'Service Régional';
      case 'SERVICE_CENTRAL': return 'Service Central';
      case 'ADMIN': return 'Administrateur';
      default: return role;
    }
  }
}
