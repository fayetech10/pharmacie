import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FactureService } from '../../core/services/facture.service';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';
import { FactureEventsService } from '../../core/services/facture-events.service';
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

    <!-- Bouton de déconnexion flottant (mobile uniquement, pour tests) -->
    <button type="button" class="mobile-logout" (click)="logout()" aria-label="Se déconnecter">
      <mat-icon>logout</mat-icon>
    </button>

    <!-- Navigation basse (mobile) — le header est masqué sur mobile.
         La session expire automatiquement après 1 jour (redirection vers la connexion). -->
    <nav class="bottom-nav">
      <a class="bn-item" *ngFor="let item of bottomNav"
         [class.active]="isBottomActive(item)"
         [routerLink]="item.link"
         [queryParams]="item.tab !== undefined ? { tab: item.tab } : null">
        <span class="bn-badge" *ngIf="navBadge(item) > 0">{{ navBadge(item) }}</span>
        <mat-icon>{{ item.icon }}</mat-icon>
        <span>{{ item.label }}</span>
      </a>
    </nav>
  `,
  styles: [`
    /* ===== Topbar navy (style photo) ===== */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--ink-gradient);
      box-shadow: 0 2px 12px rgba(6, 78, 59, 0.22);
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

    /* ===== Bottom nav (mobile, pilule flottante — style photo) ===== */
    .bottom-nav {
      display: none;
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      z-index: 200;
      background: var(--ink-gradient);
      border-radius: 22px;
      box-shadow: 0 10px 28px -6px rgba(6, 78, 59, 0.45),
                  0 2px 8px rgba(6, 78, 59, 0.25);
      padding: 6px 6px;
      gap: 2px;
    }
    .bn-item {
      position: relative;
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 6px 2px;
      border: none;
      border-radius: 15px;
      background: transparent;
      color: var(--ink-text);
      font-family: inherit;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: -0.01em;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .bn-item mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .bn-item span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Badge de notification (compteur par catégorie) */
    .bn-item .bn-badge {
      position: absolute;
      top: 1px;
      left: calc(50% + 4px);
      box-sizing: border-box;
      min-width: 15px;
      height: 15px;
      padding: 0 4px;
      border-radius: 999px;
      background: #EF4444;
      color: #fff;
      font-size: 9.5px;
      font-weight: 700;
      line-height: 15px;
      text-align: center;
      box-shadow: 0 0 0 2px #066F52;
    }
    .bn-item.active {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
      font-weight: 600;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
    }
    .bn-item:active { transform: scale(0.94); }

    /* Bouton de déconnexion flottant (caché en desktop) */
    .mobile-logout { display: none; }

    /* ===== Responsive ===== */
    @media (max-width: 768px) {
      /* Header masqué sur mobile — navigation via la pilule flottante. */
      .topbar { display: none; }
      /* Bouton de déconnexion flottant en haut à droite (pour tests) */
      .mobile-logout {
        display: flex;
        position: fixed;
        top: calc(10px + env(safe-area-inset-top));
        right: 12px;
        z-index: 250;
        width: 40px;
        height: 40px;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        background: var(--ink-gradient);
        color: #fff;
        box-shadow: 0 6px 16px -4px rgba(6, 78, 59, 0.45);
        cursor: pointer;
      }
      .mobile-logout mat-icon { font-size: 20px; width: 20px; height: 20px; }
      .mobile-logout:active { transform: scale(0.92); }
      .main-content {
        padding: calc(16px + env(safe-area-inset-top)) 16px
                 calc(76px + env(safe-area-inset-bottom));
      }
      .alert-inner { padding-top: calc(12px + env(safe-area-inset-top)); }
      .bottom-nav { display: flex; }
      .alert-btn { margin-left: 0; width: 100%; }
    }
  `]
})
export class MainLayoutComponent implements OnInit {
  currentUser: LoginResponse | null = null;
  retards: Facture[] = [];
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
    private factureEvents: FactureEventsService,
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
    // Recalcule les badges après toute modification de facture (sans recharger la page).
    this.factureEvents.changed$.subscribe(() => {
      if (this.countsEnabled) this.factureCount.refresh();
    });

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
