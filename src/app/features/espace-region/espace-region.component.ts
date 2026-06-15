import { Component, OnInit } from '@angular/core';
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private breakpoints: BreakpointObserver,
    private factureCount: FactureCountService
  ) {}

  ngOnInit() {
    this.breakpoints.observe('(max-width: 768px)').subscribe(state => {
      this.isMobile = state.matches;
      // En mobile, seuls les onglets 0..3 existent : on borne l'index courant.
      if (this.isMobile && this.selectedTab > 3) {
        this.selectedTab = 3;
      }
    });
    this.route.queryParamMap.subscribe(params => {
      this.selectedTab = +(params.get('tab') ?? 0);
      this.markActiveTabSeen();
    });
    this.factureCount.counts$.subscribe(c => {
      this.counts = c;
      // Une fois les compteurs chargés, on efface d'emblée le badge de l'onglet ouvert.
      this.markActiveTabSeen();
    });
    this.factureCount.refresh();
  }

  onTabChange(index: number) {
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
        default: return [];
      }
    }
    switch (this.selectedTab) {
      case 1: return ['ENVOYEE'];
      case 2: return ['VALIDEE_SR'];
      case 3: return ['VALIDEE_NC'];
      case 4: return ['REJETEE_SR'];
      case 5: return ['REJETEE_NC'];
      default: return [];
    }
  }

  /** Marque les factures de l'onglet actif comme vues → son badge disparaît. */
  private markActiveTabSeen(): void {
    const statuses = this.statusesForActiveTab();
    if (statuses.length) this.factureCount.markSeen(statuses);
  }
}
