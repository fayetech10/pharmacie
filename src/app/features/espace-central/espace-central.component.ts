import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { AdminRegionsComponent } from '../admin-regions/admin-regions.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';

@Component({
  selector: 'app-espace-central',
  standalone: true,
  imports: [CommonModule, MatTabsModule, AdminRegionsComponent, FacturesListComponent],
  templateUrl: './espace-central.component.html',
  styleUrls: ['./espace-central.component.css']
})
export class EspaceCentralComponent implements OnInit {
  selectedTab = 0;
  counts: StatutCounts = {};
  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private factureCount: FactureCountService
  ) {}

  ngOnInit() {
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

  /** Statuts couverts par chaque onglet (pour le marquage « vu » des badges). */
  private statusesForTab(index: number): string[] {
    switch (index) {
      case 1: return ['VALIDEE_SR'];
      case 2: return ['VALIDEE_NC'];
      case 3: return ['PAYEE'];
      case 4: return ['REJETEE_NC'];
      default: return [];
    }
  }

  /** Marque les factures de l'onglet actif comme vues → son badge disparaît. */
  private markActiveTabSeen(): void {
    const statuses = this.statusesForTab(this.selectedTab);
    if (statuses.length) this.factureCount.markSeen(statuses);
  }
}
