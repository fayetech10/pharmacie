import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { RegionalFacturesComponent } from '../regional-factures/regional-factures.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';

@Component({
  selector: 'app-espace-region',
  standalone: true,
  imports: [CommonModule, MatTabsModule, RegionalFacturesComponent, FacturesListComponent],
  template: `
    <div class="espace-page fade-in">
      <div class="page-head">
        <div>
          <h1>Espace Régional</h1>
          <p>Supervisez et validez les factures de votre région</p>
        </div>
      </div>

      <mat-tab-group animationDuration="0ms" [selectedIndex]="selectedTab" (selectedIndexChange)="onTabChange($event)">
        <mat-tab label="Tableau de bord">
          <div class="tab-content">
            <app-regional-factures></app-regional-factures>
          </div>
        </mat-tab>
        <mat-tab label="Factures reçues">
          <div class="tab-content">
            <!-- Le service régional reçoit les ENVOYEE (depuis la pharmacie) et les REJETEE_NC (retournées par le central) -->
            <app-factures-list [allowedStatuses]="['ENVOYEE', 'REJETEE_NC']"></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Factures validées">
          <div class="tab-content">
            <app-factures-list [allowedStatuses]="['VALIDEE_SR']"></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Factures rejetées">
          <div class="tab-content">
            <app-factures-list [allowedStatuses]="['REJETEE_SR']"></app-factures-list>
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
export class EspaceRegionComponent implements OnInit {
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
