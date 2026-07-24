import { Component, OnInit, DestroyRef, inject, NgZone } from '@angular/core';
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { PointageUiService } from '../../core/services/pointage-ui.service';
import { RegionService } from '../../core/services/region.service';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  tab?: number;
  /** Statuts dont la somme alimente le badge de notification. */
  statuts?: string[];
  /** Groupe logique pour l'affichage avec titre dans la barre latérale. */
  group?: string;
}

/** Nombre maximal d'items dans la barre basse mobile (item « Plus » inclus). */
const BOTTOM_NAV_LIMIT = 5;

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSnackBarModule
  ],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  currentUser: LoginResponse | null = null;
  retards: Facture[] = [];
  currentUrl = '';
  isSidebarCollapsed = false;
  /** Nombre de factures par statut, pour les badges de la navigation. */
  counts: StatutCounts = {};
  regionName: string | null = null;

  /** Masque la navigation mobile quand l'utilisateur défile vers le bas. */
  navHidden = false;
  /** Panneau « Plus » (destinations secondaires) de la barre basse mobile. */
  isMoreOpen = false;
  private lastScrollY = 0;
  private readonly scrollThreshold = 10;

  // Modales de pointage (BCSU)
  showArriveeModal = false;
  showDepartModal = false;

  bottomNav: NavItem[] = [];
  moreNav: NavItem[] = [];
  topNav: NavItem[] = [];
  topNavGroups: { name: string; items: NavItem[] }[] = [];

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

  /**
   * Statuts « notifiables » du rôle courant : uniquement les changements d'état
   * provoqués par d'AUTRES rôles, jamais ses propres actions — un rôle ne doit pas
   * se notifier lui-même (ex. une pharmacie qui envoie ne doit pas voir de badge,
   * c'est le Service Régional qui le voit dans « Reçues »).
   */
  private get notifiableStatuts(): string[] {
    if (this.authService.isPharmacien()) {
      // Décisions du SR / du central sur ses factures (pas ses brouillons ni ses envois).
      return ['VALIDEE_SR', 'REJETEE_SR', 'VALIDEE_NC', 'REJETEE_NC', 'PAYEE'];
    }
    if (this.authService.isServiceRegional()) {
      // Reçues des pharmacies (ENVOYEE) + décisions du central (VALIDEE_NC / REJETEE_NC).
      return ['ENVOYEE', 'VALIDEE_NC', 'REJETEE_NC'];
    }
    if (this.authService.isServiceCentral()) {
      // Transmises par les SR (VALIDEE_SR). Ses propres validations/paiements/rejets n'alertent pas.
      return ['VALIDEE_SR'];
    }
    return [];
  }

  /** Badge agrégé affiché sur le lien « espace » du rôle. */
  get espaceBadge(): number {
    return this.notifiableStatuts.reduce((sum, s) => sum + (this.counts[s] || 0), 0);
  }

  /** Logo affiché dans la topbar : pharmacie pour le Pharmacien, CSU pour les autres. */
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

  /**
   * Construit les groupes de navigation à partir de topNav.
   * Appelé une seule fois dans ngOnInit (pas un getter pour éviter les boucles de change detection).
   */
  private buildTopNavGroups(): { name: string; items: NavItem[] }[] {
    const groups: { name: string; items: NavItem[] }[] = [];
    let currentGroup: { name: string; items: NavItem[] } | null = null;

    for (const item of this.topNav) {
      const groupName = item.group || 'Général';
      if (!currentGroup || currentGroup.name !== groupName) {
        currentGroup = { name: groupName, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    }
    return groups;
  }

  /**
   * Navigation desktop (sidebar) : TOUTES les destinations du rôle, y compris les
   * onglets internes des espaces (`tab` → query param). Plus aucun contenu caché
   * derrière un onglet in-page : la sidebar est la seule source de navigation.
   */
  private buildTopNav(): NavItem[] {
    if (this.authService.isPharmacien()) {
      return [
        { label: 'Facturation', icon: 'post_add', link: '/dashboard/espace-pharmacie', group: 'Facturation' },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-pharmacie/factures', statuts: this.notifiableStatuts, group: 'Facturation' }
      ];
    }
    if (this.authService.isServiceRegional()) {
      return [
        { label: 'Tableau de bord', icon: 'space_dashboard', link: '/dashboard/espace-region', tab: 0, group: 'Général' },
        { label: 'Factures pharmacies', icon: 'receipt_long', link: '/dashboard/espace-region', tab: 1, statuts: ['ENVOYEE', 'VALIDEE_NC', 'REJETEE_NC'], group: 'Facturation' },
        { label: 'Factures structures sanitaires', icon: 'request_quote', link: '/dashboard/espace-region', tab: 2, group: 'Facturation' },
        { label: 'Paramétrage pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies', group: 'Réseau de santé' },
        { label: 'Paramétrage structures sanitaires', icon: 'local_hospital', link: '/dashboard/structures-sanitaires', group: 'Réseau de santé' },
        { label: 'Patients', icon: 'group', link: '/dashboard/patients', group: 'Dossiers patients' },
        { label: 'Agents BCSU', icon: 'manage_accounts', link: '/dashboard/utilisateurs', group: 'Gestion agents' },
        { label: 'Pointages', icon: 'fingerprint', link: '/dashboard/pointages', group: 'Gestion agents' },
        { label: 'Statistiques', icon: 'bar_chart', link: '/dashboard/statistiques-agents', group: 'Gestion agents' }
      ];
    }
    if (this.authService.isServiceCentral()) {
      return [
        { label: 'Tableau de bord', icon: 'space_dashboard', link: '/dashboard/espace-central', tab: 0, group: 'Général' },
        { label: 'Factures reçues', icon: 'move_to_inbox', link: '/dashboard/espace-central', tab: 1, statuts: ['VALIDEE_SR'], group: 'Facturation' },
        { label: 'Factures validées', icon: 'task_alt', link: '/dashboard/espace-central', tab: 2, group: 'Facturation' },
        { label: 'Factures payées', icon: 'paid', link: '/dashboard/espace-central', tab: 3, group: 'Facturation' },
        { label: 'Paramétrage pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies', group: 'Réseau de santé' },
        { label: 'Paramétrage structures sanitaires', icon: 'local_hospital', link: '/dashboard/structures-sanitaires', group: 'Réseau de santé' },
        { label: 'Factures structures sanitaires', icon: 'request_quote', link: '/dashboard/structures-sanitaires', tab: 1, group: 'Réseau de santé' },
        { label: 'Pointages', icon: 'fingerprint', link: '/dashboard/pointages', group: 'Gestion agents' }
      ];
    }
    if (this.authService.isBcsu()) {
      // Les 4 onglets de l'espace BCSU deviennent des entrées de premier niveau.
      return [
        { label: 'Enregistrement', icon: 'note_add', link: '/dashboard/espace-bcsu', tab: 0, group: 'Guichet' },
        { label: 'Patients enregistrés', icon: 'group', link: '/dashboard/espace-bcsu', tab: 1, group: 'Guichet' },
        { label: 'Constats', icon: 'fact_check', link: '/dashboard/espace-bcsu', tab: 2, group: 'Suivi' },
        { label: 'Paramétrage', icon: 'settings', link: '/dashboard/espace-bcsu', tab: 3, group: 'Suivi' }
      ];
    }
    if (this.authService.isStructureSanitaire()) {
      const items: NavItem[] = [
        { label: 'Nouvelle facturation', icon: 'note_add', link: '/dashboard/espace-structure', tab: 0, group: 'Facturation' },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-structure', tab: 1, group: 'Facturation' }
      ];
      // L'onglet « postes de santé » n'existe que pour les CS/EPS de rattachement.
      if (!this.authService.isPosteDeSante()) {
        items.push({ label: 'Factures postes de santé polarisés', icon: 'medical_services', link: '/dashboard/espace-structure', tab: 2, group: 'Facturation' });
      }
      return items;
    }
    // ADMIN : toutes les destinations, sans menu intermédiaire.
    return [
      { label: 'Régions', icon: 'map', link: '/dashboard/regions', group: 'Administration' },
      { label: 'Utilisateurs', icon: 'manage_accounts', link: '/dashboard/utilisateurs', group: 'Administration' },
      { label: 'Médicaments', icon: 'medication', link: '/dashboard/medicaments', group: 'Administration' },
      { label: 'Paramétrage pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies', group: 'Réseau de santé' },
      { label: 'Paramétrage structures sanitaires', icon: 'local_hospital', link: '/dashboard/structures-sanitaires', group: 'Réseau de santé' },
      { label: 'Factures structures sanitaires', icon: 'request_quote', link: '/dashboard/structures-sanitaires', tab: 1, group: 'Réseau de santé' },
      { label: 'Patients', icon: 'group', link: '/dashboard/patients', group: 'Dossiers patients' },
      { label: 'Feuilles de soins', icon: 'description', link: '/dashboard/feuilles-soins', group: 'Dossiers patients' }
    ];
  }

  /**
   * État actif d'une entrée de sidebar.
   * - Entrée à onglet : chemin identique ET onglet courant identique (0 par défaut).
   * - Entrée simple : le chemin courant est le lien ou l'une de ses sous-pages,
   *   sauf si une autre entrée plus spécifique correspond (ex: « Facturation »
   *   /espace-pharmacie ne s'allume pas sur /espace-pharmacie/factures).
   */
  isNavActive(item: NavItem): boolean {
    const [path, query] = this.currentUrl.split('?');
    if (item.tab !== undefined) {
      if (path !== item.link) return false;
      const tabMatch = /(?:^|&)tab=(\d+)/.exec(query || '');
      return (tabMatch ? +tabMatch[1] : 0) === item.tab;
    }
    if (path !== item.link && !path.startsWith(item.link + '/')) return false;
    return !this.topNav.some(other => other !== item && other.tab === undefined
        && other.link.length > item.link.length
        && (path === other.link || path.startsWith(other.link + '/')));
  }

  /**
   * Éléments de navigation mobile, ordonnés « flux de travail d'abord »
   * (les destinations de gestion passent dans le panneau « Plus »).
   */
  private get allBottomNav(): NavItem[] {
    if (this.authService.isPharmacien()) {
      // « Mes factures » est une vraie route (l'espace pharmacie n'a pas d'onglet
      // ?tab : l'ancien lien tab=1 retombait sur la page Facturation).
      return [
        { label: 'Facturation', icon: 'post_add', link: '/dashboard/espace-pharmacie' },
        { label: 'Factures', icon: 'receipt_long', link: '/dashboard/espace-pharmacie/factures', statuts: ['VALIDEE_SR', 'REJETEE_SR', 'VALIDEE_NC', 'REJETEE_NC', 'PAYEE'] }
      ];
    }
    if (this.authService.isServiceRegional()) {
      // Barre du bas alignée sur la sidebar : les onglets facture de l'Espace
      // régional sont des destinations directes (le reste passe dans « Plus »).
      return [
        { label: 'Tableau', icon: 'space_dashboard', link: '/dashboard/espace-region', tab: 0 },
        { label: 'Fact. pharmacies', icon: 'receipt_long', link: '/dashboard/espace-region', tab: 1, statuts: ['ENVOYEE', 'VALIDEE_NC', 'REJETEE_NC'] },
        { label: 'Fact. structures', icon: 'request_quote', link: '/dashboard/espace-region', tab: 2 },
        { label: 'Param. pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies' },
        { label: 'Param. structures', icon: 'local_hospital', link: '/dashboard/structures-sanitaires' },
        { label: 'Patients', icon: 'group', link: '/dashboard/patients' },
        { label: 'Agents BCSU', icon: 'manage_accounts', link: '/dashboard/utilisateurs' },
        { label: 'Pointages', icon: 'fingerprint', link: '/dashboard/pointages' },
        { label: 'Statistiques', icon: 'bar_chart', link: '/dashboard/statistiques-agents' }
      ];
    }
    if (this.authService.isServiceCentral()) {
      return [
        { label: 'Tableau', icon: 'space_dashboard', link: '/dashboard/espace-central', tab: 0 },
        { label: 'Reçues', icon: 'move_to_inbox', link: '/dashboard/espace-central', tab: 1, statuts: ['VALIDEE_SR'] },
        { label: 'Validées', icon: 'task_alt', link: '/dashboard/espace-central', tab: 2 },
        { label: 'Payées', icon: 'paid', link: '/dashboard/espace-central', tab: 3 },
        { label: 'Param. pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies' },
        { label: 'Param. structures', icon: 'local_hospital', link: '/dashboard/structures-sanitaires' }
      ];
    }
    if (this.authService.isBcsu()) {
      return [
        { label: 'Enregistrement', icon: 'note_add', link: '/dashboard/espace-bcsu', tab: 0 },
        { label: 'Patients', icon: 'group', link: '/dashboard/espace-bcsu', tab: 1 },
        { label: 'Constats', icon: 'fact_check', link: '/dashboard/espace-bcsu', tab: 2 },
        { label: 'Paramétrage', icon: 'settings', link: '/dashboard/espace-bcsu', tab: 3 }
      ];
    }
    if (this.authService.isStructureSanitaire()) {
      return [
        { label: 'Facturation', icon: 'note_add', link: '/dashboard/espace-structure', tab: 0 },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-structure', tab: 1 },
        { label: 'Postes de santé', icon: 'medical_services', link: '/dashboard/espace-structure', tab: 2 }
      ];
    }
    return [
      { label: 'Régions', icon: 'map', link: '/dashboard/regions' },
      { label: 'Param. pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies' },
      { label: 'Utilisateurs', icon: 'manage_accounts', link: '/dashboard/utilisateurs' },
      { label: 'Médicaments', icon: 'medication', link: '/dashboard/medicaments' },
      { label: 'Param. structures', icon: 'local_hospital', link: '/dashboard/structures-sanitaires' },
      { label: 'Information', icon: 'group', link: '/dashboard/patients' },
      { label: 'Feuilles de soins', icon: 'description', link: '/dashboard/feuilles-soins' }
    ];
  }

  /** Badge agrégé du bouton « Plus » (notifications des destinations repliées). */
  get moreBadge(): number {
    return this.moreNav.reduce((sum, item) => sum + this.navBadge(item), 0);
  }

  /** Le bouton « Plus » est actif quand la page courante est une destination repliée. */
  get isMoreActive(): boolean {
    const path = this.currentUrl.split('?')[0];
    return this.moreNav.some(item => item.link === path);
  }

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private factureCount: FactureCountService,
    private factureEvents: FactureEventsService,
    private router: Router,
    private zone: NgZone,
    private api: ApiService,
    private snackBar: MatSnackBar,
    private pointageUi: PointageUiService,
    private regionService: RegionService
  ) {}

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser?.regionId) {
      this.regionService.getAll().subscribe(regions => {
        const region = regions.find(r => r.id === this.currentUser?.regionId);
        if (region) {
          this.regionName = region.nom;
        }
      });
    }
    
    this.currentUrl = this.router.url;
    this.topNav = this.buildTopNav();
    this.topNavGroups = this.buildTopNavGroups();

    const all = this.allBottomNav;
    this.bottomNav = all.length <= BOTTOM_NAV_LIMIT ? all : all.slice(0, BOTTOM_NAV_LIMIT - 1);
    this.moreNav = all.length <= BOTTOM_NAV_LIMIT ? [] : all.slice(BOTTOM_NAV_LIMIT - 1);

    this.setupScrollBehavior();

    let lastPath = this.currentUrl.split('?')[0];
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(e => {
        this.currentUrl = e.urlAfterRedirects;
        // Toute navigation referme le panneau « Plus » et réaffiche la barre.
        this.isMoreOpen = false;
        this.navHidden = false;
        this.lastScrollY = 0;
        // Rafraîchit les compteurs au changement de page (pas sur un simple changement d'onglet).
        const path = this.currentUrl.split('?')[0];
        if (path !== lastPath) {
          lastPath = path;
          if (this.countsEnabled) this.factureCount.refresh();
        }
      });

    // Badges de notification (Service Régional / Central / Pharmacien)
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

    if (this.authService.isPharmacien()) {
      this.factureService.getRetards().subscribe(res => {
        this.retards = res || [];
      });
    }

    // Modale d'arrivée automatique pour BCSU (premier accès de la journée).
    if (this.authService.isBcsu() && this.currentUser && !this.currentUser.pointageHeure) {
      this.showArriveeModal = true;
    }

    // La bannière de l'espace BCSU peut demander la modale de départ.
    this.pointageUi.departRequested$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => (this.showDepartModal = true));
  }

  /**
   * Auto-masquage de la navigation mobile au défilement.
   * Un SEUL écouteur (capture, passif) enregistré HORS zone Angular et cadencé
   * par requestAnimationFrame : la détection de changements n'est déclenchée
   * qu'au basculement affiché/masqué, jamais à chaque pixel défilé.
   */
  private setupScrollBehavior(): void {
    let ticking = false;
    const onScroll = (event: Event) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const target = event.target;
        let y: number;
        if (target === document || target === document.documentElement || target === window) {
          y = window.scrollY || document.documentElement.scrollTop || 0;
        } else if (target instanceof HTMLElement) {
          y = target.scrollTop;
        } else {
          return;
        }
        if (Math.abs(y - this.lastScrollY) < this.scrollThreshold) return;
        const hidden = y > this.lastScrollY && y > 60;
        this.lastScrollY = y;
        if (hidden !== this.navHidden) {
          this.zone.run(() => (this.navHidden = hidden));
        }
      });
    };

    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    });
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

  toggleMore(): void {
    this.isMoreOpen = !this.isMoreOpen;
  }

  voirRetards() {
    // L'onglet « Mes factures » de l'espace pharmacie
    this.router.navigate(['/dashboard/espace-pharmacie/factures']);
  }

  ngOnDestroy() {}

  toggleSidebar() {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
  }

  logout() {
    if (this.authService.isBcsu() && this.currentUser && !this.currentUser.pointageDepartHeure) {
      this.showDepartModal = true;
    } else {
      this.authService.logout();
    }
  }

  forceLogout() {
    this.showDepartModal = false;
    this.authService.logout();
  }

  enregistrerArrivee() {
    this.api.post<any>('/pointages/arrivee', {}).subscribe({
      next: (res) => {
        const heure = res.heureArrivee ? new Date(res.heureArrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        if (this.currentUser) {
          this.currentUser.pointageHeure = heure;
          this.currentUser.premierPointage = false;
          sessionStorage.setItem('csu_user', JSON.stringify(this.currentUser));
        }
        this.showArriveeModal = false;
        this.snackBar.open(`Arrivée enregistrée à ${heure}. Bon travail !`, 'Fermer', { duration: 5000 });
      },
      error: (err) => {
        console.error('Erreur lors du pointage d\'arrivée', err);
        this.snackBar.open('Erreur lors de l\'enregistrement de l\'arrivée', 'Fermer', { duration: 4000 });
      }
    });
  }

  enregistrerDepart() {
    this.api.post<any>('/pointages/depart', {}).subscribe({
      next: (res) => {
        const heure = res.heureDepart ? new Date(res.heureDepart).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
        if (this.currentUser) {
          this.currentUser.pointageDepartHeure = heure;
          sessionStorage.setItem('csu_user', JSON.stringify(this.currentUser));
        }
        this.showDepartModal = false;
        this.snackBar.open(`Départ enregistré à ${heure}. Bonne fin de journée !`, 'Fermer', { duration: 6000 });

        // Déconnexion automatique après le pointage de départ.
        this.authService.logout();
      },
      error: (err) => {
        console.error('Erreur lors du pointage de départ', err);
        this.snackBar.open('Erreur lors de l\'enregistrement du départ', 'Fermer', { duration: 4000 });
      }
    });
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'PHARMACIEN': return 'Pharmacien';
      case 'SERVICE_REGIONAL': return this.regionName ? `Service Régional - ${this.regionName}` : 'Service Régional';
      case 'SERVICE_CENTRAL': return 'Service Central';
      case 'ADMIN': return 'Administrateur';
      case 'BCSU': return 'Agent BCSU';
      case 'STRUCTURE_SANITAIRE': return 'Structure Sanitaire';
      default: return role;
    }
  }
}
