import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { FactureService } from '../../core/services/facture.service';
import { FactureCountService, StatutCounts, statutsStructure } from '../../core/services/facture-count.service';

/** Ce que le service régional doit voir : factures reçues + décisions du niveau central. */
const NOTIFIABLES_REGION = ['ENVOYEE', 'VALIDEE_NC', 'REJETEE_NC'];
/** Ce que le niveau central doit voir : factures validées et transmises par les régions. */
const NOTIFIABLES_CENTRAL = ['VALIDEE_SR'];
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
import { BandeauHorsLigneComponent } from '../../shared/bandeau-hors-ligne/bandeau-hors-ligne.component';
import { AttentePageComponent } from '../../shared/attente-page/attente-page.component';
import { InstallationService } from '../../core/hors-ligne/installation.service';

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

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatSnackBarModule,
    BandeauHorsLigneComponent,
    AttentePageComponent
  ],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  currentUser: LoginResponse | null = null;
  retards: Facture[] = [];
  currentUrl = '';
  /** Nombre de factures par statut, pour les badges de la navigation. */
  counts: StatutCounts = {};
  regionName: string | null = null;

  // Modales de pointage (BCSU)
  showArriveeModal = false;
  showDepartModal = false;

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
      // Reçues (ENVOYEE) + décisions du central (VALIDEE_NC / REJETEE_NC), pharmacies ET structures.
      return [...NOTIFIABLES_REGION, ...statutsStructure(NOTIFIABLES_REGION)];
    }
    if (this.authService.isServiceCentral()) {
      // Transmises par les SR (VALIDEE_SR). Ses propres validations/paiements/rejets n'alertent pas.
      return [...NOTIFIABLES_CENTRAL, ...statutsStructure(NOTIFIABLES_CENTRAL)];
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
      // « Tableau de bord » retiré : il pointait vers /dashboard/espace-pharmacie, exactement
      // comme « Facturation » (l'espace pharmacie n'a qu'une vue, le formulaire de facturation).
      return [
        { label: 'Facturation', icon: 'post_add', link: '/dashboard/espace-pharmacie', group: 'Facturation' },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-pharmacie/factures', statuts: this.notifiableStatuts, group: 'Facturation' }
      ];
    }
    if (this.authService.isServiceRegional()) {
      return [
        { label: 'Tableau de bord', icon: 'space_dashboard', link: '/dashboard/espace-region', tab: 0, group: 'Général' },
        // Un badge par famille : une facture de structure ne s'affiche plus chez les pharmacies.
        { label: 'Factures pharmacies', icon: 'receipt_long', link: '/dashboard/espace-region', tab: 1, statuts: NOTIFIABLES_REGION, group: 'Facturation' },
        { label: 'Factures structures sanitaires', icon: 'request_quote', link: '/dashboard/espace-region', tab: 2, statuts: statutsStructure(NOTIFIABLES_REGION), group: 'Facturation' },
        // Reprise des factures de l'ancienne application (09/10/2026).
        { label: 'Import des factures', icon: 'upload_file', link: '/dashboard/espace-region', tab: 3, group: 'Facturation' },
        { label: 'Paramétrage pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies', group: 'Réseau de santé' },
        { label: 'Paramétrage structures sanitaires', icon: 'local_hospital', link: '/dashboard/structures-sanitaires', group: 'Réseau de santé' },
        { label: 'Districts sanitaires', icon: 'account_tree', link: '/dashboard/districts', group: 'Réseau de santé' },
        { label: 'Patients', icon: 'group', link: '/dashboard/patients', group: 'Dossiers patients' },
        { label: 'Agents BCSU', icon: 'manage_accounts', link: '/dashboard/utilisateurs', group: 'Gestion agents' },
        { label: 'Pointages', icon: 'fingerprint', link: '/dashboard/pointages', group: 'Gestion agents' },
        { label: 'Statistiques', icon: 'bar_chart', link: '/dashboard/statistiques-agents', group: 'Gestion agents' }
      ];
    }
    if (this.authService.isServiceCentral()) {
      return [
        { label: 'Tableau de bord', icon: 'space_dashboard', link: '/dashboard/espace-central', tab: 0, group: 'Général' },
        { label: 'Facture Structure sanitaire', icon: 'request_quote', link: '/dashboard/espace-central', tab: 1, statuts: statutsStructure(NOTIFIABLES_CENTRAL), group: 'Facturation' },
        { label: 'Facture Pharmacie', icon: 'receipt_long', link: '/dashboard/espace-central', tab: 2, statuts: NOTIFIABLES_CENTRAL, group: 'Facturation' },
        { label: 'Paramétrage pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies', group: 'Réseau de santé' },
        { label: 'Paramétrage structures sanitaires', icon: 'local_hospital', link: '/dashboard/structures-sanitaires', group: 'Réseau de santé' },
        { label: 'Pointages', icon: 'fingerprint', link: '/dashboard/pointages', group: 'Gestion agents' }
      ];
    }
    if (this.authService.isBcsu()) {
      // Organisé comme le poste de santé : un accueil à tuiles, puis une entrée par activité.
      return [
        { label: 'Accueil', icon: 'space_dashboard', link: '/dashboard/espace-bcsu', tab: 0, group: 'Général' },
        { label: 'Nouvelle lettre de garantie', icon: 'note_add', link: '/dashboard/espace-bcsu', tab: 1, group: 'Guichet' },
        { label: 'Patients enregistrés', icon: 'group', link: '/dashboard/espace-bcsu', tab: 2, group: 'Guichet' },
        { label: 'Constats', icon: 'fact_check', link: '/dashboard/espace-bcsu', tab: 3, group: 'Suivi' },
        { label: 'Paramétrage', icon: 'tune', link: '/dashboard/espace-bcsu', tab: 4, group: 'Configuration' }
      ];
    }
    if (this.authService.isPosteDeSante()) {
      return [
        { label: 'Accueil du poste', icon: 'space_dashboard', link: '/dashboard/espace-poste', tab: 0, group: 'Général' },
        { label: 'Facturation CSU', icon: 'note_add', link: '/dashboard/espace-poste', tab: 1, group: 'Facturation CSU' },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-poste', tab: 2, group: 'Facturation CSU' },
        { label: 'Facturation Hors CSU', icon: 'point_of_sale', link: '/dashboard/espace-poste', tab: 3, group: 'Hors CSU' },
        { label: 'Paramétrage', icon: 'tune', link: '/dashboard/espace-poste', tab: 4, group: 'Configuration' }
      ];
    }
    if (this.authService.isCentreDeSante()) {
      // Centre siège du district : double casquette — il gagne les écrans du district.
      const siege = this.authService.aCapaciteDistrict()
        ? [
            { label: 'Consolidation district', icon: 'stacked_bar_chart', link: '/dashboard/espace-district', tab: 0, group: 'District' },
            { label: 'Factures des postes de santé', icon: 'medical_services', link: '/dashboard/espace-district', tab: 2, group: 'District' }
          ]
        : [];
      return [
        { label: 'Tableau de bord Centre', icon: 'space_dashboard', link: '/dashboard/espace-centre', tab: 0, group: 'Général' },
        { label: 'Facturation CSU', icon: 'note_add', link: '/dashboard/espace-centre', tab: 2, group: 'Facturation' },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-centre', tab: 3, group: 'Facturation' },
        { label: 'Hors CSU (patients payants)', icon: 'point_of_sale', link: '/dashboard/espace-centre', tab: 4, group: 'Caisse' },
        { label: 'Paramètres', icon: 'settings', link: '/dashboard/espace-centre', tab: 5, group: 'Configuration' },
        // Écrans du district : seulement si ce centre est le siège de son district.
        ...siege
      ];
    }
    if (this.authService.isStructureSanitaire()) {
      return [
        { label: 'Nouvelle facturation', icon: 'note_add', link: '/dashboard/espace-structure', tab: 0, group: 'Facturation' },
        { label: 'Mes factures', icon: 'receipt_long', link: '/dashboard/espace-structure', tab: 1, group: 'Facturation' },
        { label: 'Hors CSU (patients payants)', icon: 'point_of_sale', link: '/dashboard/espace-structure', tab: 3, group: 'Caisse' },
        { label: 'Paramètres', icon: 'settings', link: '/dashboard/espace-structure', tab: 4, group: 'Configuration' }
      ];
    }
    if (this.authService.isDistrict()) {
      return [
        { label: 'Tableau de bord District', icon: 'space_dashboard', link: '/dashboard/espace-district', tab: 0, group: 'Général' },
        { label: 'Consolidation district', icon: 'stacked_bar_chart', link: '/dashboard/espace-district', tab: 0, group: 'Pilotage' },
        { label: 'Structures sanitaires', icon: 'local_hospital', link: '/dashboard/espace-district', tab: 1, group: 'Réseau de santé' },
        // Contrôle des factures des postes de santé : réservé au district (08/10/2026).
        { label: 'Factures des postes de santé', icon: 'medical_services', link: '/dashboard/espace-district', tab: 2, group: 'Contrôle' }
      ];
    }
    // ADMIN : toutes les destinations avec tableau de bord en tête
    return [
      { label: 'Tableau de bord Admin', icon: 'space_dashboard', link: '/dashboard/espace-admin', group: 'Général' },
      { label: 'Régions', icon: 'map', link: '/dashboard/regions', group: 'Administration' },
      { label: 'Districts sanitaires', icon: 'account_tree', link: '/dashboard/districts', group: 'Administration' },
      { label: 'Utilisateurs', icon: 'manage_accounts', link: '/dashboard/utilisateurs', group: 'Administration' },
      { label: 'Médicaments', icon: 'medication', link: '/dashboard/medicaments', group: 'Administration' },
      { label: 'Référentiel des prestations', icon: 'price_change', link: '/dashboard/referentiel', group: 'Administration' },
      { label: 'Paramétrage pharmacie', icon: 'local_pharmacy', link: '/dashboard/pharmacies', group: 'Réseau de santé' },
      { label: 'Paramétrage structures sanitaires', icon: 'local_hospital', link: '/dashboard/structures-sanitaires', group: 'Réseau de santé' },
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

  constructor(
    public authService: AuthService,
    public installation: InstallationService,
    private factureService: FactureService,
    private factureCount: FactureCountService,
    private factureEvents: FactureEventsService,
    private router: Router,
    private api: ApiService,
    private snackBar: MatSnackBar,
    private pointageUi: PointageUiService,
    private regionService: RegionService
  ) {}

  /** Postes et centres de santé : facturation possible hors ligne (enfants 0-5 ans, Plan Sésame). */
  horsLigneActif = false;

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    this.horsLigneActif = this.authService.isPosteDeSante() || this.authService.isCentreDeSante();
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

  voirRetards() {
    // L'onglet « Mes factures » de l'espace pharmacie
    this.router.navigate(['/dashboard/espace-pharmacie/factures']);
  }

  ngOnDestroy() {}

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
          this.authService.majUtilisateurCourant(this.currentUser);
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
          this.authService.majUtilisateurCourant(this.currentUser);
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
