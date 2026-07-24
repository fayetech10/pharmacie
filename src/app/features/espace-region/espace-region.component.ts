import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { RegionalDashboardComponent } from './regional-dashboard/regional-dashboard.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { RegionalStructuresFacturesComponent } from '../regional-factures/regional-structures-factures.component';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';
import { AuthService } from '../../core/services/auth.service';
import { RegionService } from '../../core/services/region.service';

type StatutGroupKey = 'TOUTES' | 'RECUES' | 'VALIDEES' | 'REJETEES' | 'PAYEES';

interface StatutGroup {
  key: StatutGroupKey;
  label: string;
  icon: string;
  statuts: string[];
  /** Statuts qui déclenchent un badge de notification (décisions reçues). */
  badgeStatuts?: string[];
  danger?: boolean;
}

@Component({
  selector: 'app-espace-region',
  standalone: true,
  imports: [CommonModule, MatTabsModule, MatIconModule, RegionalDashboardComponent, FacturesListComponent, RegionalStructuresFacturesComponent],
  templateUrl: './espace-region.component.html'
})
export class EspaceRegionComponent implements OnInit {
  /** 0 = Tableau de bord · 1 = Factures Pharmacies · 2 = Factures Structures. */
  selectedTab = 0;

  /** Sous-filtre de statut, indépendant par type de prestataire. */
  pharmaStatut: StatutGroupKey = 'RECUES';
  structStatut: StatutGroupKey = 'RECUES';

  /** Groupes de statuts présentés en filtre segmenté dans chaque onglet factures. */
  readonly statusGroups: StatutGroup[] = [
    // Liste de statuts vide = aucun filtre : les deux vues affichent alors tout.
    { key: 'TOUTES',   label: 'Toutes',   icon: 'list_alt',      statuts: [] },
    { key: 'RECUES',   label: 'Reçues',   icon: 'move_to_inbox', statuts: ['ENVOYEE'],                 badgeStatuts: ['ENVOYEE'] },
    { key: 'VALIDEES', label: 'Validées', icon: 'task_alt',      statuts: ['VALIDEE_SR', 'VALIDEE_NC'], badgeStatuts: ['VALIDEE_NC'] },
    { key: 'REJETEES', label: 'Rejetées', icon: 'cancel',        statuts: ['REJETEE_SR', 'REJETEE_NC'], badgeStatuts: ['REJETEE_NC'], danger: true },
    { key: 'PAYEES',   label: 'Payées',   icon: 'paid',          statuts: ['PAYEE'] }
  ];

  /** Nombre de factures par statut, pour les badges de notification. */
  counts: StatutCounts = {};
  regionName: string | null = null;

  /**
   * Prestataire ciblé depuis le tableau de bord (clic sur le classement) : restreint
   * l'onglet « Factures pharmacies » à ce seul prestataire jusqu'à ce qu'on l'efface.
   */
  pharmaProviderId: string | null = null;
  pharmaProviderNom: string | null = null;
  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private factureCount: FactureCountService,
    private authService: AuthService,
    private regionService: RegionService
  ) {}

  ngOnInit() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab >= 0 && tab <= 2 ? tab : 0;

        // Statut transmis par le tableau de bord (clic sur un item du parcours) :
        // pré-positionne le filtre segmenté de l'onglet ouvert, pour arriver
        // directement sur les factures concernées.
        const statut = params.get('statut');
        if (statut && this.statusGroups.some(g => g.key === statut)) {
          if (this.selectedTab === 2) this.structStatut = statut as StatutGroupKey;
          else this.pharmaStatut = statut as StatutGroupKey;
        }

        // Prestataire ciblé (clic sur le classement du tableau de bord).
        this.pharmaProviderId = params.get('provider');
        this.pharmaProviderNom = params.get('providerNom');

        setTimeout(() => this.markActiveTabSeen(), 0);
      });
    this.factureCount.counts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        this.counts = c;
        setTimeout(() => this.markActiveTabSeen(), 0);
      });
    this.factureCount.refresh();

    const user = this.authService.getCurrentUser();
    if (user?.regionId) {
      this.regionService.getAll().subscribe(regions => {
        const region = regions.find(r => r.id === user.regionId);
        if (region) {
          this.regionName = region.nom;
        }
      });
    }
  }

  onTabChange(index: number) {
    const currentTab = +(this.route.snapshot.queryParamMap.get('tab') ?? 0);
    if (index === currentTab) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }

  /** Statuts (array stable) autorisés pour le filtre courant d'un type. */
  groupStatuts(key: StatutGroupKey): string[] {
    return (this.statusGroups.find(g => g.key === key) ?? this.statusGroups[0]).statuts;
  }

  get pharmaAllowed(): string[] { return this.groupStatuts(this.pharmaStatut); }
  get structAllowed(): string[] { return this.groupStatuts(this.structStatut); }

  selectPharmaStatut(key: StatutGroupKey) {
    this.pharmaStatut = key;
    this.markSeenFor(key);
  }

  selectStructStatut(key: StatutGroupKey) {
    this.structStatut = key;
    this.markSeenFor(key);
  }

  /** Retire le filtre prestataire, en conservant l'onglet et le filtre de statut. */
  effacerPrestataire() {
    this.pharmaProviderId = null;
    this.pharmaProviderNom = null;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.selectedTab, statut: this.pharmaStatut },
      replaceUrl: true
    });
  }

  /** Total du badge de notification d'un groupe de statuts. */
  badgeCount(group: StatutGroup): number {
    if (!group.badgeStatuts) return 0;
    return group.badgeStatuts.reduce((sum, s) => sum + (this.counts[s] || 0), 0);
  }

  private markSeenFor(key: StatutGroupKey) {
    const group = this.statusGroups.find(g => g.key === key);
    if (group?.statuts.length) this.factureCount.markSeen(group.statuts);
  }

  /** Marque les factures de l'onglet/statut actif comme vues → badge effacé. */
  private markActiveTabSeen(): void {
    if (this.selectedTab === 1) this.markSeenFor(this.pharmaStatut);
    else if (this.selectedTab === 2) this.markSeenFor(this.structStatut);
  }
}
