import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  currentUser: LoginResponse | null = null;
  retards: Facture[] = [];
  currentUrl = '';
  /** Nombre de factures par statut, pour les badges de la navigation basse. */
  counts: StatutCounts = {};
  private destroyRef = inject(DestroyRef);

  /** Le rôle courant affiche-t-il des badges de comptage ? */
  private get countsEnabled(): boolean {
    return this.authService.isServiceRegional()
      || this.authService.isServiceCentral()
      || this.authService.isPharmacien();
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
        { label: 'Factures', icon: 'receipt_long', link: '/dashboard/espace-pharmacie', tab: 1, statuts: ['BROUILLON', 'ENVOYEE', 'VALIDEE_SR', 'REJETEE_SR', 'VALIDEE_NC', 'REJETEE_NC', 'PAYEE'] },
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
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
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
    this.factureCount.counts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => this.counts = c);
    if (this.countsEnabled) this.factureCount.refresh();
    // Recalcule les badges après toute modification de facture (sans recharger la page).
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
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
