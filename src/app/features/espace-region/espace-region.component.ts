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
        <mat-tab>
          <ng-template mat-tab-label>
            Factures reçues
            <span class="tab-count" *ngIf="counts['ENVOYEE']">{{ counts['ENVOYEE'] }}</span>
          </ng-template>
          <div class="tab-content">
            <!-- Factures envoyées par les pharmacies (et corrections renvoyées) à contrôler -->
            <app-factures-list [allowedStatuses]="['ENVOYEE']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>
        <!-- Validées par le SR (transmises au central) -->
        <mat-tab>
          <ng-template mat-tab-label>
            Validées
            <span class="tab-count" *ngIf="counts['VALIDEE_SR']">{{ counts['VALIDEE_SR'] }}</span>
          </ng-template>
          <div class="tab-content">
            <!-- Mobile : la barre du bas n'a qu'un onglet « Validées » → bascule SR / SC ici.
                 Desktop : onglet « Validées SC » dédié ci-dessous. -->
            <div class="seg-toggle" *ngIf="isMobile">
              <button type="button" [class.active]="valideeView === 'SR'" (click)="valideeView = 'SR'">
                Validée <span class="seg-count" *ngIf="counts['VALIDEE_SR']">{{ counts['VALIDEE_SR'] }}</span>
              </button>
              <button type="button" [class.active]="valideeView === 'SC'" (click)="valideeView = 'SC'">
                Validée par SC <span class="seg-count" *ngIf="counts['VALIDEE_NC']">{{ counts['VALIDEE_NC'] }}</span>
              </button>
            </div>
            <app-factures-list *ngIf="!isMobile || valideeView === 'SR'" [allowedStatuses]="['VALIDEE_SR']" [showToolbar]="false"></app-factures-list>
            <app-factures-list *ngIf="isMobile && valideeView === 'SC'" [allowedStatuses]="['VALIDEE_NC']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>
        <!-- Validées par le service central (desktop : onglet dédié) -->
        <mat-tab *ngIf="!isMobile">
          <ng-template mat-tab-label>
            Validées SC
            <span class="tab-count" *ngIf="counts['VALIDEE_NC']">{{ counts['VALIDEE_NC'] }}</span>
          </ng-template>
          <div class="tab-content">
            <app-factures-list [allowedStatuses]="['VALIDEE_NC']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>

        <!-- Rejetées par le SR (renvoyées à la pharmacie) -->
        <mat-tab>
          <ng-template mat-tab-label>
            Rejetées
            <span class="tab-count danger" *ngIf="counts['REJETEE_SR']">{{ counts['REJETEE_SR'] }}</span>
          </ng-template>
          <div class="tab-content">
            <div class="seg-toggle" *ngIf="isMobile">
              <button type="button" [class.active]="rejeteeView === 'SR'" (click)="rejeteeView = 'SR'">
                Rejetée <span class="seg-count danger" *ngIf="counts['REJETEE_SR']">{{ counts['REJETEE_SR'] }}</span>
              </button>
              <button type="button" [class.active]="rejeteeView === 'SC'" (click)="rejeteeView = 'SC'">
                Rejetée par SC <span class="seg-count danger" *ngIf="counts['REJETEE_NC']">{{ counts['REJETEE_NC'] }}</span>
              </button>
            </div>
            <app-factures-list *ngIf="!isMobile || rejeteeView === 'SR'" [allowedStatuses]="['REJETEE_SR']" [showToolbar]="false"></app-factures-list>
            <app-factures-list *ngIf="isMobile && rejeteeView === 'SC'" [allowedStatuses]="['REJETEE_NC']" [showToolbar]="false"></app-factures-list>
          </div>
        </mat-tab>
        <!-- Rejetées par le service central (desktop : onglet dédié) -->
        <mat-tab *ngIf="!isMobile">
          <ng-template mat-tab-label>
            Rejetées SC
            <span class="tab-count danger" *ngIf="counts['REJETEE_NC']">{{ counts['REJETEE_NC'] }}</span>
          </ng-template>
          <div class="tab-content">
            <app-factures-list [allowedStatuses]="['REJETEE_NC']" [showToolbar]="false"></app-factures-list>
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

    /* Badge de notification (compteur) sur la bascule */
    .seg-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 17px; height: 17px; padding: 0 5px; margin-left: 6px;
      border-radius: 999px; background: var(--primary); color: #fff;
      font-size: 10.5px; font-weight: 700; line-height: 1;
    }
    .seg-count.danger { background: var(--warn); }

    /* Badge de notification (compteur) sur les onglets — label projeté par Material */
    :host ::ng-deep .tab-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px; margin-left: 6px;
      border-radius: 999px; background: var(--primary); color: #fff;
      font-size: 11px; font-weight: 700; line-height: 1;
    }
    :host ::ng-deep .tab-count.danger { background: var(--warn); }

    @media (max-width: 768px) {
      /* La navigation se fait via la barre du bas (navigation stack) :
         on masque la barre d'onglets redondante. */
      :host ::ng-deep .mat-mdc-tab-header { display: none; }
      /* En-tête (titre + sous-titre) masqué sur mobile : redondant avec la barre du bas. */
      .page-head { display: none; }
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
    });
    this.factureCount.counts$.subscribe(c => this.counts = c);
    this.factureCount.refresh();
  }

  onTabChange(index: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }
}
