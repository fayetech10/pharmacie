import { Component, OnInit } from '@angular/core';
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
  template: `
    <div class="espace-page fade-in">
      <div class="page-head">
        <div>
          <h1>Espace Pharmacie</h1>
          <p>Gérez vos facturations et suivez vos statistiques</p>
        </div>
      </div>

      <mat-tab-group animationDuration="0ms" [selectedIndex]="selectedTab" (selectedIndexChange)="onTabChange($event)">
        <mat-tab label="Facturation">
          <div class="tab-content">
            <app-dashboard></app-dashboard>
          </div>
        </mat-tab>
        <mat-tab>
          <ng-template mat-tab-label>
            Mes factures
            <span class="tab-count danger" *ngIf="rejeteeCount">{{ rejeteeCount }}</span>
          </ng-template>
          <div class="tab-content">
            <app-factures-list></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Tableau de bord">
          <div class="tab-content">
            <app-stats></app-stats>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .espace-page { padding: 0; }
    .tab-content { padding-top: 24px; }

    /* Badge de notification (factures rejetées) sur l'onglet — label projeté par Material */
    :host ::ng-deep .tab-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px; margin-left: 6px;
      border-radius: 999px; background: var(--primary); color: #fff;
      font-size: 11px; font-weight: 700; line-height: 1;
    }
    :host ::ng-deep .tab-count.danger { background: var(--warn); }

    @media (max-width: 768px) {
      /* Mobile : navigation via la barre du bas → en-tête + onglets redondants masqués. */
      :host ::ng-deep .mat-mdc-tab-header { display: none; }
      .page-head { display: none; }
      .tab-content { padding-top: 8px; }
    }
  `]
})
export class EspacePharmacieComponent implements OnInit {
  selectedTab = 0;
  /** Factures non vues par statut (pour le badge « Mes factures »). */
  counts: StatutCounts = {};

  /** Nombre de factures rejetées non encore consultées (SR + central). */
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
    this.route.queryParamMap.subscribe(params => {
      this.selectedTab = +(params.get('tab') ?? 0);
      this.markActiveTabSeen();
    });
    this.factureCount.counts$.subscribe(c => {
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

  /** « Mes factures » (onglet 1) couvre les factures rejetées renvoyées au pharmacien. */
  private markActiveTabSeen(): void {
    if (this.selectedTab === 1) {
      this.factureCount.markSeen(['REJETEE_SR', 'REJETEE_NC']);
    }
  }
}
