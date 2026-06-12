import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { AdminRegionsComponent } from '../admin-regions/admin-regions.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';

@Component({
  selector: 'app-espace-central',
  standalone: true,
  imports: [CommonModule, MatTabsModule, AdminRegionsComponent, FacturesListComponent],
  template: `
    <div class="espace-page fade-in">
      <div class="page-head">
        <div>
          <h1>Espace Central</h1>
          <p>Supervisez au niveau national et effectuez les paiements</p>
        </div>
      </div>

      <mat-tab-group animationDuration="0ms" [selectedIndex]="selectedTab" (selectedIndexChange)="onTabChange($event)">
        <mat-tab label="Tableau de bord">
          <div class="tab-content">
            <!-- admin-regions agit comme vue drill-down Région -> Pharmacies -->
            <app-admin-regions></app-admin-regions>
          </div>
        </mat-tab>
        <mat-tab label="Factures reçues">
          <div class="tab-content">
            <app-factures-list [allowedStatuses]="['VALIDEE_SR']"></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Factures validées">
          <div class="tab-content">
            <app-factures-list [allowedStatuses]="['VALIDEE_NC']" [showPaymentButton]="true"></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Factures rejetées">
          <div class="tab-content">
            <!-- Les factures rejetées par le central sont au statut REJETEE_NC -->
            <app-factures-list [allowedStatuses]="['REJETEE_NC']"></app-factures-list>
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
export class EspaceCentralComponent implements OnInit {
  selectedTab = 0;

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
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
