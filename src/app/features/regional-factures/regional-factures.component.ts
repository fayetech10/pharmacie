import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';

import { AuthService } from '../../core/services/auth.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { FactureService } from '../../core/services/facture.service';
import { Facture } from '../../core/models/facture.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';

interface PharmacieSummary {
  pharmacie: Pharmacie;
  factures: Facture[];
  factureCount: number;
  totalMontant: number;
}

type DrillLevel = 'pharmacies' | 'factures';

@Component({
  selector: 'app-regional-factures',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    StatusBadgeComponent
  ],
  template: `
    <!-- Fil d'Ariane -->
    <nav class="breadcrumb">
      <button class="crumb" [class.active]="level === 'pharmacies'" (click)="goToPharmacies()" type="button">
        <mat-icon>local_pharmacy</mat-icon> Pharmacies
      </button>
      <ng-container *ngIf="selectedPharmacie && level === 'factures'">
        <mat-icon class="sep">chevron_right</mat-icon>
        <span class="crumb active">{{ selectedPharmacie.pharmacie.nom }}</span>
      </ng-container>
    </nav>

    <div class="page-header">
      <div class="header-content">
        <button *ngIf="level !== 'pharmacies'" class="back-btn" (click)="goBack()" type="button" aria-label="Retour">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div [ngSwitch]="level">
          <ng-container *ngSwitchCase="'pharmacies'">
            <h1>Factures de la région</h1>
            <p>{{ pharmacieSummaries.length }} pharmacie(s) · {{ totalRegionMontant | number:'1.0-0':'fr' }} CFA au total</p>
          </ng-container>
          <ng-container *ngSwitchCase="'factures'">
            <h1>{{ selectedPharmacie?.pharmacie?.nom }}</h1>
            <p>{{ selectedPharmacie?.factureCount }} facture(s) · {{ selectedPharmacie?.totalMontant | number:'1.0-0':'fr' }} CFA au total</p>
          </ng-container>
        </div>
      </div>
    </div>

    <!-- ===================== NIVEAU 1 : PHARMACIES ===================== -->
    <div class="m-cards" *ngIf="level === 'pharmacies'">
      <div class="m-card clickable" *ngFor="let p of pharmacieSummaries" (click)="selectPharmacie(p)">
        <div class="m-card-top">
          <span class="m-title">{{ p.pharmacie.nom }}</span>
          <mat-icon class="m-chevron">chevron_right</mat-icon>
        </div>
        <div class="m-sub">{{ p.pharmacie.code }}</div>
        <div class="m-row">
          <span><mat-icon class="inline-ic">receipt_long</mat-icon> {{ p.factureCount }} facture(s)</span>
        </div>
        <div class="m-foot">
          <span class="m-amount">{{ p.totalMontant | number:'1.0-0':'fr' }} CFA</span>
        </div>
      </div>
      <div class="empty-state" *ngIf="pharmacieSummaries.length === 0">
        <mat-icon>local_pharmacy</mat-icon>
        <p>Aucune pharmacie trouvée</p>
      </div>
    </div>

    <mat-card class="table-card desktop-only" *ngIf="level === 'pharmacies'">
      <table mat-table [dataSource]="pharmacieSummaries" class="w-100">
        <ng-container matColumnDef="pharmacie">
          <th mat-header-cell *matHeaderCellDef> Pharmacie </th>
          <td mat-cell *matCellDef="let p">
            <div class="entity-cell">
              <div class="entity-icon pharma"><mat-icon>local_pharmacy</mat-icon></div>
              <div>
                <span class="entity-name">{{ p.pharmacie.nom }}</span>
                <span class="entity-sub">{{ p.pharmacie.code }}</span>
              </div>
            </div>
          </td>
        </ng-container>
        <ng-container matColumnDef="factures">
          <th mat-header-cell *matHeaderCellDef> Factures </th>
          <td mat-cell *matCellDef="let p">{{ p.factureCount }}</td>
        </ng-container>
        <ng-container matColumnDef="montant">
          <th mat-header-cell *matHeaderCellDef> Montant total </th>
          <td mat-cell *matCellDef="let p"><strong>{{ p.totalMontant | number:'1.0-0':'fr' }} CFA</strong></td>
        </ng-container>
        <ng-container matColumnDef="action">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let p"><mat-icon class="chevron">chevron_right</mat-icon></td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="pharmacieColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: pharmacieColumns;" class="clickable" (click)="selectPharmacie(row)"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td class="empty-cell" colspan="4">Aucune pharmacie trouvée.</td>
        </tr>
      </table>
    </mat-card>

    <!-- ===================== NIVEAU 2 : FACTURES ===================== -->
    <div class="m-cards" *ngIf="level === 'factures'">
      <a class="m-card" *ngFor="let f of selectedPharmacie?.factures || []" [routerLink]="['/dashboard/factures', f.id]">
        <div class="m-card-top">
          <span class="m-title">{{ getMonthName(f.mois) }} {{ f.annee }}</span>
          <mat-icon class="m-chevron">chevron_right</mat-icon>
        </div>
        <div class="m-foot">
          <app-status-badge [statut]="f.statut"></app-status-badge>
          <span class="m-amount">{{ f.montantTotal | number:'1.0-0':'fr' }} CFA</span>
        </div>
      </a>
      <div class="empty-state" *ngIf="(selectedPharmacie?.factures || []).length === 0">
        <mat-icon>receipt_long</mat-icon>
        <p>Aucune facture pour cette pharmacie</p>
      </div>
    </div>

    <mat-card class="table-card desktop-only" *ngIf="level === 'factures'">
      <table mat-table [dataSource]="selectedPharmacie?.factures || []" class="w-100">
        <ng-container matColumnDef="mois">
          <th mat-header-cell *matHeaderCellDef> Mois / Année </th>
          <td mat-cell *matCellDef="let f">
            <div class="entity-cell">
              <div class="entity-icon month"><mat-icon>event</mat-icon></div>
              <span class="entity-name">{{ getMonthName(f.mois) }} {{ f.annee }}</span>
            </div>
          </td>
        </ng-container>
        <ng-container matColumnDef="montant">
          <th mat-header-cell *matHeaderCellDef> Montant </th>
          <td mat-cell *matCellDef="let f"><strong>{{ f.montantTotal | number:'1.0-0':'fr' }} CFA</strong></td>
        </ng-container>
        <ng-container matColumnDef="statut">
          <th mat-header-cell *matHeaderCellDef> Statut </th>
          <td mat-cell *matCellDef="let f"><app-status-badge [statut]="f.statut"></app-status-badge></td>
        </ng-container>
        <ng-container matColumnDef="action">
          <th mat-header-cell *matHeaderCellDef> Détail </th>
          <td mat-cell *matCellDef="let f">
            <a class="action-btn" [routerLink]="['/dashboard/factures', f.id]" (click)="$event.stopPropagation()" title="Voir la facture">
              <mat-icon>visibility</mat-icon>
            </a>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="factureColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: factureColumns;"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td class="empty-cell" colspan="4">Aucune facture pour cette pharmacie.</td>
        </tr>
      </table>
    </mat-card>
  `,
  styles: [`
    /* En-tête avec bouton retour */
    .header-content { display: flex; align-items: center; gap: 16px; }
    .header-content h1 {
      margin: 0 0 4px 0;
      font-size: 26px;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .header-content p { margin: 0; color: var(--text-secondary); font-size: 15px; }
    .back-btn {
      flex-shrink: 0;
      background: white;
      border: 1px solid var(--border);
      border-radius: 50%;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: all var(--transition);
    }
    .back-btn:hover { background: var(--bg); transform: scale(1.05); }

    tr.clickable { cursor: pointer; }
    tr.clickable:hover { background: var(--primary-light); }
    .chevron { color: var(--text-muted); }
    tr.clickable:hover .chevron { color: var(--primary); }

    .empty-cell {
      text-align: center;
      padding: 32px !important;
      color: var(--text-secondary);
      font-style: italic;
    }

    .inline-ic {
      font-size: 15px; width: 15px; height: 15px;
      vertical-align: -2px; color: var(--text-muted);
    }
    .m-row span { display: inline-flex; align-items: center; gap: 4px; }

    @media (max-width: 768px) {
      .header-content h1 { font-size: 21px; }
    }
  `]
})
export class RegionalFacturesComponent implements OnInit {
  pharmacies: Pharmacie[] = [];
  factures: Facture[] = [];

  // Niveau de navigation courant
  level: DrillLevel = 'pharmacies';

  // Niveau 1
  pharmacieSummaries: PharmacieSummary[] = [];
  pharmacieColumns = ['pharmacie', 'factures', 'montant', 'action'];
  totalRegionMontant = 0;

  // Niveau 2
  selectedPharmacie: PharmacieSummary | null = null;
  factureColumns = ['mois', 'montant', 'statut', 'action'];

  constructor(
    private authService: AuthService,
    private pharmacieService: PharmacieService,
    private factureService: FactureService
  ) {}

  ngOnInit() {
    forkJoin({
      pharmacies: this.pharmacieService.getAll(),
      factures: this.factureService.getAll()
    }).subscribe(({ pharmacies, factures }) => {
      // Pour le service régional, l'API devrait déjà filtrer par région, mais par sécurité on garde toutes celles reçues
      this.pharmacies = pharmacies;
      this.factures = factures;
      this.buildPharmacieSummaries();
    });
  }

  buildPharmacieSummaries() {
    this.pharmacieSummaries = this.pharmacies.map(pharmacie => {
      const phFactures = this.factures
        .filter(f => f.pharmacieId === pharmacie.id)
        .sort((a, b) => (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois));
      return {
        pharmacie,
        factures: phFactures,
        factureCount: phFactures.length,
        totalMontant: phFactures.reduce((sum, f) => sum + f.montantTotal, 0)
      };
    });
    this.pharmacieSummaries.sort((a, b) => a.pharmacie.nom.localeCompare(b.pharmacie.nom));
    this.totalRegionMontant = this.pharmacieSummaries.reduce((sum, p) => sum + p.totalMontant, 0);
  }

  // Niveau 1 → 2
  selectPharmacie(ps: PharmacieSummary) {
    this.selectedPharmacie = ps;
    this.level = 'factures';
  }

  // Navigation arrière
  goBack() {
    if (this.level === 'factures') {
      this.goToPharmacies();
    }
  }

  goToPharmacies() {
    this.level = 'pharmacies';
    this.selectedPharmacie = null;
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }
}
