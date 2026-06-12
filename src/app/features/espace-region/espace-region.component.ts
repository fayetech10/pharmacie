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
            <!-- Factures envoyées par les pharmacies (et corrections renvoyées) à contrôler -->
            <app-factures-list [allowedStatuses]="['ENVOYEE']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Validées">
          <div class="tab-content">
            <!-- Validées par le SR (transmises au central) ou validées par le service central -->
            <div class="seg-toggle">
              <button type="button" [class.active]="valideeView === 'SR'" (click)="valideeView = 'SR'">Validée</button>
              <button type="button" [class.active]="valideeView === 'SC'" (click)="valideeView = 'SC'">Validée par SC</button>
            </div>
            <app-factures-list *ngIf="valideeView === 'SR'" [allowedStatuses]="['VALIDEE_SR']" [showToolbar]="false"></app-factures-list>
            <app-factures-list *ngIf="valideeView === 'SC'" [allowedStatuses]="['VALIDEE_NC']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>
        <mat-tab label="Rejetées">
          <div class="tab-content">
            <!-- Rejetées par le SR (renvoyées à la pharmacie) ou rejetées par le service central -->
            <div class="seg-toggle">
              <button type="button" [class.active]="rejeteeView === 'SR'" (click)="rejeteeView = 'SR'">Rejetée</button>
              <button type="button" [class.active]="rejeteeView === 'SC'" (click)="rejeteeView = 'SC'">Rejetée par SC</button>
            </div>
            <app-factures-list *ngIf="rejeteeView === 'SR'" [allowedStatuses]="['REJETEE_SR']" [showToolbar]="false"></app-factures-list>
            <app-factures-list *ngIf="rejeteeView === 'SC'" [allowedStatuses]="['REJETEE_NC']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .espace-page { padding: 0; }
    .tab-content { padding-top: 24px; }

    /* Segmented control : Validée / Validée par SC (idem Rejetées) */
    .seg-toggle {
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: var(--border-light);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .seg-toggle button {
      border: none;
      background: transparent;
      padding: 8px 18px;
      border-radius: 9px;
      font-family: inherit;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .seg-toggle button.active {
      background: #fff;
      color: var(--primary);
      box-shadow: var(--shadow-sm);
    }
    @media (max-width: 768px) {
      /* La navigation se fait via la barre du bas (navigation stack) :
         on masque la barre d'onglets redondante. */
      :host ::ng-deep .mat-mdc-tab-header { display: none; }
      .tab-content { padding-top: 8px; }
      .seg-toggle { display: flex; width: 100%; }
      .seg-toggle button { flex: 1; padding: 9px 8px; }
    }
  `]
})
export class EspaceRegionComponent implements OnInit {
  selectedTab = 0;
  valideeView: 'SR' | 'SC' = 'SR';
  rejeteeView: 'SR' | 'SC' = 'SR';

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
