import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { StatsComponent } from '../stats/stats.component';
import { AuthService } from '../../core/services/auth.service';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';

@Component({
  selector: 'app-espace-pharmacie',
  standalone: true,
  imports: [CommonModule, MatTabsModule, DashboardComponent, FacturesListComponent, StatsComponent],
  templateUrl: './espace-pharmacie.component.html',
  styleUrls: ['./espace-pharmacie.component.css']
})
export class EspacePharmacieComponent implements OnInit {
  selectedTab = 0;
  /** Factures non vues par statut (pour le badge « Mes factures »). */
  counts: StatutCounts = {};
  private destroyRef = inject(DestroyRef);

  /** Nombre total de factures non lues. */
  get totalCount(): number {
    return Object.values(this.counts).reduce((sum, count) => sum + count, 0);
  }

  /** Nombre de factures rejetées non encore consultées (SR + central) pour l'affichage en rouge. */
  get rejeteeCount(): number {
    return (this.counts['REJETEE_SR'] || 0) + (this.counts['REJETEE_NC'] || 0);
  }

  constructor(
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private factureCount: FactureCountService
  ) {}

  ngOnInit() {
    // La navigation basse mobile pointe directement vers un onglet via ?tab=
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.selectedTab = +(params.get('tab') ?? 0);
        this.markActiveTabSeen();
      });
    this.factureCount.counts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        this.counts = c;
        // Une fois les compteurs chargés, on efface le badge si « Mes factures » est ouvert.
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

  /** « Mes factures » (onglet 1) couvre toutes les factures. */
  private markActiveTabSeen(): void {
    if (this.selectedTab === 1) {
      this.factureCount.markSeen(['BROUILLON', 'ENVOYEE', 'VALIDEE_SR', 'REJETEE_SR', 'VALIDEE_NC', 'REJETEE_NC', 'PAYEE']);
    }
  }
}
