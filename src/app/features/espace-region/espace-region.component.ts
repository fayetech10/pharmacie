import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { RegionalFacturesComponent } from '../regional-factures/regional-factures.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';

@Component({
  selector: 'app-espace-region',
  standalone: true,
  imports: [CommonModule, MatTabsModule, RegionalFacturesComponent, FacturesListComponent],
  templateUrl: './espace-region.component.html',
  styleUrls: ['./espace-region.component.css']
})
export class EspaceRegionComponent implements OnInit {
  selectedTab = 0;
  valideeView: 'SR' | 'SC' = 'SR';
  rejeteeView: 'SR' | 'SC' = 'SR';
  /** Desktop : onglets « Validées SC » / « Rejetées SC » dédiés. Mobile : bascule SR/SC. */
  isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  /** Nombre de factures par statut, pour les badges de notification. */
  counts: StatutCounts = {};
  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private breakpoints: BreakpointObserver,
    private factureCount: FactureCountService
  ) {}

  ngOnInit() {
    this.breakpoints.observe('(max-width: 768px)')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        this.isMobile = state.matches;
        // En mobile, seuls les onglets 0..4 existent (les onglets « … Centrale »
        // dédiés du desktop sont fusionnés dans les bascules CSUR/Centrale) :
        // on borne l'index courant pour ne pas pointer sur un onglet absent.
        if (this.isMobile && this.selectedTab > 4) {
          this.selectedTab = 4;
        }
      });
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.selectedTab = +(params.get('tab') ?? 0);
        setTimeout(() => this.markActiveTabSeen(), 0);
      });
    this.factureCount.counts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        this.counts = c;
        // Une fois les compteurs chargés, on efface d'emblée le badge de l'onglet ouvert.
        setTimeout(() => this.markActiveTabSeen(), 0);
      });
    this.factureCount.refresh();
  }

  onTabChange(index: number) {
    const currentTab = +(this.route.snapshot.queryParamMap.get('tab') ?? 0);
    if (index === currentTab) {
      return; // Évite les navigations redondantes et les boucles infinies de routage
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }

  /** Statuts couverts par l'onglet actif (l'index change selon mobile/desktop). */
  private statusesForActiveTab(): string[] {
    if (this.isMobile) {
      switch (this.selectedTab) {
        case 1: return ['ENVOYEE'];
        case 2: return ['VALIDEE_SR', 'VALIDEE_NC'];
        case 3: return ['REJETEE_SR', 'REJETEE_NC'];
        case 4: return ['PAYEE'];
        default: return [];
      }
    }
    switch (this.selectedTab) {
      case 1: return ['ENVOYEE'];
      case 2: return ['VALIDEE_SR'];
      case 3: return ['VALIDEE_NC'];
      case 4: return ['REJETEE_SR'];
      case 5: return ['REJETEE_NC'];
      case 6: return ['PAYEE'];
      default: return [];
    }
  }

  /** Marque les factures de l'onglet actif comme vues → son badge disparaît. */
  private markActiveTabSeen(): void {
    const statuses = this.statusesForActiveTab();
    if (statuses.length) this.factureCount.markSeen(statuses);
  }
}
