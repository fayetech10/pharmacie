import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { StatsComponent } from '../stats/stats.component';
import { AuthService } from '../../core/services/auth.service';

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
        <mat-tab label="Mes factures">
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
  `]
})
export class EspacePharmacieComponent implements OnInit {
  selectedTab = 0;

  constructor(
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // La navigation basse mobile pointe directement vers un onglet via ?tab=
    this.route.queryParamMap.subscribe(params => {
      this.selectedTab = +(params.get('tab') ?? 0);
    });
  }

  onTabChange(index: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }
}
