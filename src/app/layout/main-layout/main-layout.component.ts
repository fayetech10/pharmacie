import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FactureService } from '../../core/services/facture.service';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';
import { LoginResponse } from '../../core/models/user.model';
import { Facture } from '../../core/models/facture.model';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  tab?: number;
  /** Statuts dont la somme alimente le badge de notification. */
  statuts?: string[];
}

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
          <span class="brand-logo"><img [src]="brandLogo" alt="Logo" /></span>
          <span class="brand-name">CSU <strong>Sénégal</strong></span>
        </a>

        <nav class="nav-links">
          <a routerLink="/dashboard/espace-pharmacie" routerLinkActive="active" class="nav-link" *ngIf="authService.isPharmacien()">
            <mat-icon>dashboard</mat-icon>
            <span>Mon Espace</span>
          </a>
          <a routerLink="/dashboard/espace-region" routerLinkActive="active" class="nav-link" *ngIf="authService.isServiceRegional()">
            <mat-icon>dashboard</mat-icon>
            <span>Espace Régional</span>
          </a>
          <a routerLink="/dashboard/espace-central" routerLinkActive="active" class="nav-link" *ngIf="authService.isServiceCentral()">
            <mat-icon>dashboard</mat-icon>
            <span>Espace Central</span>
          </a>
          <a routerLink="/dashboard/regions" routerLinkActive="active" class="nav-link" *ngIf="authService.isAdmin()">
            <mat-icon>map</mat-icon>
            <span>Régions</span>
          </a>
          <a routerLink="/dashboard/medicaments" routerLinkActive="active" class="nav-link" *ngIf="authService.isAdmin()">
            <mat-icon>medication</mat-icon>
            <span>Médicaments</span>
          </a>
          <a routerLink="/dashboard/pharmacies" routerLinkActive="active" class="nav-link" *ngIf="authService.isAdmin() || authService.isServiceRegional()">
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
            <div class="user-details">
              <span class="user-name">{{ currentUser?.prenom }} {{ currentUser?.nom }}</span>
              <span class="user-role">{{ getRoleLabel(currentUser?.role || '') }}</span>
            </div>
            <div class="user-avatar">
              {{ initials }}
            </div>
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

    <!-- Navigation basse (mobile) -->
    <nav class="bottom-nav">
      <a class="bn-item" *ngFor="let item of bottomNav"
         [class.active]="isBottomActive(item)"
         [routerLink]="item.link"
         [queryParams]="item.tab !== undefined ? { tab: item.tab } : null"
         (click)="accountOpen = false">
        <span class="bn-badge" *ngIf="navBadge(item) > 0">{{ navBadge(item) }}</span>
        <mat-icon>{{ item.icon }}</mat-icon>
        <span>{{ item.label }}</span>
      </a>
      <button class="bn-item" type="button" *ngIf="!authService.isServiceRegional()" [class.active]="accountOpen" (click)="accountOpen = !accountOpen">
        <mat-icon>person_outline</mat-icon>
        <span>Compte</span>
      </button>
    </nav>

    <!-- Fiche compte (mobile) -->
    <div class="account-overlay" *ngIf="accountOpen" (click)="accountOpen = false">
      <div class="account-sheet" (click)="$event.stopPropagation()">
        <div class="sheet-handle"></div>
        <div class="sheet-user">
          <div class="sheet-avatar">{{ initials }}</div>
          <div>
            <div class="sheet-name">{{ currentUser?.prenom }} {{ currentUser?.nom }}</div>
            <div class="sheet-role">{{ getRoleLabel(currentUser?.role || '') }}</div>
            <div class="sheet-mail">{{ currentUser?.email }}</div>
          </div>
        </div>
        <button class="btn btn-danger btn-block" (click)="logout()">
          <mat-icon>logout</mat-icon> Se déconnecter
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* ===== Topbar navy (style photo) ===== */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--ink);
      box-shadow: 0 2px 10px rgba(13, 30, 48, 0.25);
    }
    .topbar-inner {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 24px;
      height: var(--topbar-h);
      display: flex;
      align-items: center;
      gap: 28px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      flex-shrink: 0;
    }
    .brand-logo {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;
    }
    .brand-logo img { width: 32px; height: 32px; object-fit: contain; display: block; }
    .brand-name {
      font-size: 17px;
      font-weight: 400;
      letter-spacing: -0.01em;
      color: #fff;
      white-space: nowrap;
    }
    .brand-name strong { font-weight: 800; }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .nav-links::-webkit-scrollbar { display: none; }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 9px 14px;
      border-radius: 10px;
      text-decoration: none;
      color: var(--ink-text);
      font-size: 13.5px;
      font-weight: 500;
      white-space: nowrap;
      transition: all 0.2s ease;
    }
    .nav-link mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .nav-link:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
    .nav-link.active {
      background: var(--ink-soft);
      color: #fff;
      font-weight: 600;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
    }

    .topbar-right { flex-shrink: 0; margin-left: auto; }
    .user-pill {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 5px 5px 5px 14px;
      border-radius: 40px;
      cursor: pointer;
      transition: background 0.2s ease;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
    }
    .user-pill:hover { background: rgba(255, 255, 255, 0.12); }
    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #fff;
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
    .user-details { display: flex; flex-direction: column; align-items: flex-end; }
    .user-name { font-size: 13px; font-weight: 600; line-height: 1.2; color: #fff; }
    .user-role { font-size: 11px; color: var(--ink-text); }

    .main-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 28px 24px 40px;
    }

    /* ===== Bandeau d'alerte retards ===== */
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
      flex-wrap: wrap;
    }
    .alert-inner mat-icon { color: #EF4444; font-size: 22px; }
    .alert-btn {
      margin-left: auto;
      padding: 6px 16px;
      border-radius: 8px;
      border: 1px solid #EF4444;
      background: white;
      color: #EF4444;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .alert-btn:hover { background: #EF4444; color: white; }

    /* ===== Bottom nav (mobile, style photo) ===== */
    .bottom-nav {
      display: none;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 200;
      background: var(--ink);
      box-shadow: 0 -4px 16px rgba(13, 30, 48, 0.28);
      padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
      gap: 4px;
    }
    .bn-item {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 7px 4px;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: var(--ink-text);
      font-family: inherit;
      font-size: 11px;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .bn-item mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .bn-item span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Badge de notification (compteur par catégorie) */
    .bn-item .bn-badge {
      position: absolute;
      top: 2px;
      left: calc(50% + 5px);
      box-sizing: border-box;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 999px;
      background: #EF4444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      box-shadow: 0 0 0 2px var(--ink);
    }
    .bn-item.active {
      background: var(--ink-soft);
      color: #fff;
      font-weight: 600;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14);
    }

    /* ===== Fiche compte (mobile) ===== */
    .account-overlay {
      position: fixed;
      inset: 0;
      z-index: 300;
      background: rgba(15, 23, 42, 0.5);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: flex-end;
      animation: fadeIn 0.2s ease;
    }
    .account-sheet {
      width: 100%;
      background: #fff;
      border-radius: 20px 20px 0 0;
      padding: 10px 20px calc(20px + var(--bottomnav-h) + env(safe-area-inset-bottom));
      box-shadow: var(--shadow-lg);
      animation: slideUp 0.25s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(40px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .sheet-handle {
      width: 44px;
      height: 4px;
      border-radius: 4px;
      background: var(--border);
      margin: 0 auto 16px;
    }
    .sheet-user {
      display: flex;
      align-items: center;
      gap: 14px;
      padding-bottom: 18px;
      margin-bottom: 18px;
      border-bottom: 1px solid var(--border-light);
    }
    .sheet-avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--ink);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      font-weight: 800;
      flex-shrink: 0;
    }
    .sheet-name { font-size: 17px; font-weight: 700; }
    .sheet-role { font-size: 13px; color: var(--primary); font-weight: 600; }
    .sheet-mail { font-size: 12.5px; color: var(--text-muted); }

    /* ===== Responsive ===== */
    @media (max-width: 768px) {
      .topbar-inner { padding: 0 16px; gap: 12px; }
      .nav-links { display: none; }
      .user-details { display: none; }
      .user-pill { padding: 0; background: transparent; border: none; }
      .main-content {
        padding: 18px 16px calc(var(--bottomnav-h) + 28px + env(safe-area-inset-bottom));
      }
      .bottom-nav { display: flex; }
      .alert-btn { margin-left: 0; width: 100%; }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  currentUser: LoginResponse | null = null;
  retards: Facture[] = [];
  accountOpen = false;
  currentUrl = '';
  /** Nombre de factures par statut, pour les badges de la navigation basse. */
  counts: StatutCounts = {};

  /** Le rôle courant affiche-t-il des badges de comptage ? */
  private get countsEnabled(): boolean {
    return this.authService.isServiceRegional() || this.authService.isServiceCentral();
  }

  /** Somme des compteurs des statuts associés à un item de navigation. */
  navBadge(item: NavItem): number {
    if (!item.statuts) return 0;
    return item.statuts.reduce((sum, s) => sum + (this.counts[s] || 0), 0);
  }

  /** Logo affiché dans la topbar : pharmacie pour le Pharmacien, CSU pour Régional/Central/Admin. */
  get brandLogo(): string {
    return this.authService.isPharmacien()
      ? 'assets/logo-pharmacie.png'
      : 'assets/logo-csu.png';
  }

  get initials(): string {
    const p = this.currentUser?.prenom?.charAt(0) || '';
    const n = this.currentUser?.nom?.charAt(0) || '';
    return (p + n).toUpperCase();
  }

  /** Éléments de la navigation basse selon le rôle (le bouton Compte est ajouté à part). */
  get bottomNav(): NavItem[] {
    if (this.authService.isPharmacien()) {
      return [
        { label: 'Facturation', icon: 'post_add', link: '/dashboard/espace-pharmacie', tab: 0 },
        { label: 'Factures', icon: 'receipt_long', link: '/dashboard/espace-pharmacie', tab: 1 },
        { label: 'Tableau', icon: 'insights', link: '/dashboard/espace-pharmacie', tab: 2 }
      ];
    }
    if (this.authService.isServiceRegional()) {
      return [
        { label: 'Tableau', icon: 'space_dashboard', link: '/dashboard/espace-region', tab: 0 },
        { label: 'Reçues', icon: 'move_to_inbox', link: '/dashboard/espace-region', tab: 1, statuts: ['ENVOYEE'] },
        { label: 'Validées', icon: 'task_alt', link: '/dashboard/espace-region', tab: 2, statuts: ['VALIDEE_SR', 'VALIDEE_NC'] },
        { label: 'Rejetées', icon: 'cancel', link: '/dashboard/espace-region', tab: 3, statuts: ['REJETEE_SR', 'REJETEE_NC'] },
        { label: 'Pharmacies', icon: 'local_pharmacy', link: '/dashboard/pharmacies' }
      ];
    }
    if (this.authService.isServiceCentral()) {
      return [
        { label: 'Tableau', icon: 'space_dashboard', link: '/dashboard/espace-central', tab: 0 },
        { label: 'Reçues', icon: 'move_to_inbox', link: '/dashboard/espace-central', tab: 1, statuts: ['VALIDEE_SR'] },
        { label: 'Validées', icon: 'task_alt', link: '/dashboard/espace-central', tab: 2, statuts: ['VALIDEE_NC'] },
        { label: 'Payées', icon: 'paid', link: '/dashboard/espace-central', tab: 3, statuts: ['PAYEE'] }
      ];
    }
    return [
      { label: 'Régions', icon: 'map', link: '/dashboard/regions' },
      { label: 'Médicaments', icon: 'medication', link: '/dashboard/medicaments' },
      { label: 'Pharmacies', icon: 'local_pharmacy', link: '/dashboard/pharmacies' },
      { label: 'Utilisateurs', icon: 'manage_accounts', link: '/dashboard/utilisateurs' }
    ];
  }

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private factureCount: FactureCountService,
    private router: Router
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    this.currentUrl = this.router.url;
    let lastPath = this.currentUrl.split('?')[0];
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.currentUrl = e.urlAfterRedirects;
        this.accountOpen = false;
        // Rafraîchit les compteurs au changement de page (pas sur un simple changement d'onglet).
        const path = this.currentUrl.split('?')[0];
        if (path !== lastPath) {
          lastPath = path;
          if (this.countsEnabled) this.factureCount.refresh();
        }
      });

    // Badges de notification (Service Régional / Central)
    this.factureCount.counts$.subscribe(c => this.counts = c);
    if (this.countsEnabled) this.factureCount.refresh();

    // Redirect logic for Espace components
    if (this.router.url === '/dashboard' || this.router.url === '/dashboard/espace') {
      if (this.authService.isPharmacien()) {
        this.router.navigate(['/dashboard/espace-pharmacie']);
      } else if (this.authService.isServiceRegional()) {
        this.router.navigate(['/dashboard/espace-region']);
      } else if (this.authService.isServiceCentral()) {
        this.router.navigate(['/dashboard/espace-central']);
      }
    }

    if (this.authService.isPharmacien()) {
      this.factureService.getRetards().subscribe(res => {
        this.retards = res || [];
      });
    }
  }

  /** Actif si l'URL correspond au lien et, le cas échéant, à l'onglet demandé. */
  isBottomActive(item: NavItem): boolean {
    const [path, query] = this.currentUrl.split('?');
    if (path !== item.link) return false;
    if (item.tab === undefined) return true;
    const tabMatch = /(?:^|&)tab=(\d+)/.exec(query || '');
    const currentTab = tabMatch ? +tabMatch[1] : 0;
    return currentTab === item.tab;
  }

  voirRetards() {
    // L'onglet « Mes factures » de l'espace pharmacie
    this.router.navigate(['/dashboard/espace-pharmacie'], { queryParams: { tab: 1 } });
  }

  logout() {
    this.accountOpen = false;
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
