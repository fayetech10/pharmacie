import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';

import { RegionService, Region } from '../../core/services/region.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { FactureService } from '../../core/services/facture.service';
import { Facture } from '../../core/models/facture.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';

interface RegionSummary {
  region: Region;
  pharmacyCount: number;
  factureCount: number;
  totalMontant: number;
}

interface PharmacieSummary {
  pharmacie: Pharmacie;
  factures: Facture[];
  totalMontant: number;
}

@Component({
  selector: 'app-admin-regions',
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
    <div class="page-header">
      <div class="header-content" *ngIf="!selectedRegion">
        <h1>Vue Régionale</h1>
        <p>Explorez les statistiques et factures par région.</p>
      </div>
      <div class="header-content" *ngIf="selectedRegion">
        <button mat-icon-button (click)="goBack()" class="back-btn">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div>
          <h1>Région : {{ selectedRegion.region.nom }}</h1>
          <p>{{ selectedPharmacies.length }} pharmacies, {{ selectedRegion.totalMontant | number }} CFA au total.</p>
        </div>
      </div>
    </div>

    <!-- VUE GLOBALE : Liste des régions -->
    <div class="regions-grid" *ngIf="!selectedRegion">
      <div *ngFor="let summary of regionSummaries" class="region-card" (click)="selectRegion(summary)">
        <div class="card-header">
          <div class="region-icon">
            <mat-icon>map</mat-icon>
          </div>
          <h2>{{ summary.region.nom }}</h2>
        </div>
        <div class="card-stats">
          <div class="stat-item">
            <span class="stat-label">Pharmacies</span>
            <span class="stat-value">{{ summary.pharmacyCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Factures</span>
            <span class="stat-value">{{ summary.factureCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total CFA</span>
            <span class="stat-value highlight">{{ summary.totalMontant | number }}</span>
          </div>
        </div>
        <div class="card-footer">
          <span>Voir les détails</span>
          <mat-icon>arrow_forward</mat-icon>
        </div>
      </div>
    </div>

    <!-- VUE DETAILLEE : Région sélectionnée -->
    <div class="region-details" *ngIf="selectedRegion">
      <div *ngIf="selectedPharmacies.length === 0" class="empty-state">
        <mat-icon>domain_disabled</mat-icon>
        <p>Aucune pharmacie dans cette région.</p>
      </div>

      <div *ngFor="let ps of selectedPharmacies" class="pharmacy-section">
        <div class="pharmacy-header">
          <div class="pharmacy-title">
            <mat-icon>local_pharmacy</mat-icon>
            <h2>{{ ps.pharmacie.nom }}</h2>
            <span class="code-badge">{{ ps.pharmacie.code }}</span>
          </div>
          <div class="pharmacy-total">
            Total : <strong>{{ ps.totalMontant | number }} CFA</strong>
          </div>
        </div>

        <mat-card class="table-card">
          <table mat-table [dataSource]="ps.factures" class="w-100">
            <ng-container matColumnDef="mois">
              <th mat-header-cell *matHeaderCellDef> Mois / Année </th>
              <td mat-cell *matCellDef="let f"> {{ getMonthName(f.mois) }} {{ f.annee }} </td>
            </ng-container>

            <ng-container matColumnDef="montant">
              <th mat-header-cell *matHeaderCellDef> Montant </th>
              <td mat-cell *matCellDef="let f"> <strong>{{ f.montantTotal | number }} CFA</strong> </td>
            </ng-container>

            <ng-container matColumnDef="statut">
              <th mat-header-cell *matHeaderCellDef> Statut </th>
              <td mat-cell *matCellDef="let f"> <app-status-badge [statut]="f.statut"></app-status-badge> </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef> Actions </th>
              <td mat-cell *matCellDef="let f">
                <a class="action-btn" [routerLink]="['/dashboard/factures', f.id]">
                  <mat-icon>visibility</mat-icon>
                </a>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="['mois', 'montant', 'statut', 'actions']"></tr>
            <tr mat-row *matRowDef="let row; columns: ['mois', 'montant', 'statut', 'actions'];"></tr>
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell empty-state-table" colspan="4">
                Aucune facture enregistrée pour cette pharmacie.
              </td>
            </tr>
          </table>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .page-header {
      margin-bottom: 32px;
    }
    .header-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-content h1 {
      margin: 0 0 4px 0;
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .header-content p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
    }
    .back-btn {
      background: white;
      border: 1px solid var(--border);
      border-radius: 50%;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: var(--shadow-sm);
      transition: all 0.2s ease;
    }
    .back-btn:hover {
      background: var(--bg);
      transform: scale(1.05);
    }

    /* Grille des Régions */
    .regions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }
    .region-card {
      background: white;
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: 24px;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
    }
    .region-card:hover {
      box-shadow: var(--shadow-lg);
      transform: translateY(-4px);
      border-color: var(--primary-light);
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
    }
    .region-icon {
      width: 48px;
      height: 48px;
      background: var(--primary-light);
      color: var(--primary);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .card-stats {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
      flex: 1;
    }
    .stat-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-light);
    }
    .stat-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .stat-label {
      color: var(--text-secondary);
      font-size: 14px;
      font-weight: 500;
    }
    .stat-value {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 15px;
    }
    .stat-value.highlight {
      color: var(--primary);
      font-weight: 700;
      font-size: 16px;
    }
    .card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--primary);
      font-weight: 600;
      font-size: 14px;
      padding-top: 16px;
      border-top: 1px dashed var(--border);
    }
    .card-footer mat-icon {
      transition: transform 0.2s ease;
    }
    .region-card:hover .card-footer mat-icon {
      transform: translateX(4px);
    }

    /* Détails de la région */
    .pharmacy-section {
      margin-bottom: 40px;
    }
    .pharmacy-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding: 0 8px;
    }
    .pharmacy-title {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pharmacy-title mat-icon {
      color: var(--accent);
    }
    .pharmacy-title h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .code-badge {
      background: var(--bg);
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      border: 1px solid var(--border);
    }
    .pharmacy-total {
      font-size: 16px;
      color: var(--text-secondary);
    }
    .pharmacy-total strong {
      color: var(--primary);
      font-size: 18px;
    }

    .table-card {
      padding: 0;
      overflow: hidden;
    }
    .w-100 {
      width: 100%;
    }
    th.mat-header-cell {
      background: #F8FAFC;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .action-btn {
      color: var(--primary);
      background: var(--primary-light);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .action-btn:hover {
      background: var(--primary);
      color: white;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 0;
      color: var(--text-muted);
    }
    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    .empty-state-table {
      text-align: center;
      padding: 32px !important;
      color: var(--text-secondary);
      font-style: italic;
    }
  `]
})
export class AdminRegionsComponent implements OnInit {
  regions: Region[] = [];
  pharmacies: Pharmacie[] = [];
  factures: Facture[] = [];

  regionSummaries: RegionSummary[] = [];
  
  selectedRegion: RegionSummary | null = null;
  selectedPharmacies: PharmacieSummary[] = [];

  constructor(
    private regionService: RegionService,
    private pharmacieService: PharmacieService,
    private factureService: FactureService
  ) {}

  ngOnInit() {
    forkJoin({
      regions: this.regionService.getAll(),
      pharmacies: this.pharmacieService.getAll(),
      factures: this.factureService.getAll()
    }).subscribe(({ regions, pharmacies, factures }) => {
      this.regions = regions;
      this.pharmacies = pharmacies;
      this.factures = factures;

      this.buildRegionSummaries();
    });
  }

  buildRegionSummaries() {
    this.regionSummaries = this.regions.map(region => {
      const regionPharmacies = this.pharmacies.filter(p => p.regionId === region.id);
      const pharmacyIds = regionPharmacies.map(p => p.id);
      const regionFactures = this.factures.filter(f => f.pharmacieId && pharmacyIds.includes(f.pharmacieId));
      
      const totalMontant = regionFactures.reduce((sum, f) => sum + f.montantTotal, 0);

      return {
        region,
        pharmacyCount: regionPharmacies.length,
        factureCount: regionFactures.length,
        totalMontant
      };
    });
    
    // Trier par ordre alphabétique
    this.regionSummaries.sort((a, b) => a.region.nom.localeCompare(b.region.nom));
  }

  selectRegion(summary: RegionSummary) {
    this.selectedRegion = summary;
    
    // Construire les détails par pharmacie pour cette région
    const regionPharmacies = this.pharmacies.filter(p => p.regionId === summary.region.id);
    
    this.selectedPharmacies = regionPharmacies.map(pharmacie => {
      const phFactures = this.factures.filter(f => f.pharmacieId === pharmacie.id);
      
      // Trier les factures par date décroissante (année puis mois)
      phFactures.sort((a, b) => {
        if (a.annee !== b.annee) return b.annee - a.annee;
        return b.mois - a.mois;
      });

      const totalMontant = phFactures.reduce((sum, f) => sum + f.montantTotal, 0);
      
      return {
        pharmacie,
        factures: phFactures,
        totalMontant
      };
    });

    // Trier les pharmacies par nom
    this.selectedPharmacies.sort((a, b) => a.pharmacie.nom.localeCompare(b.pharmacie.nom));
  }

  goBack() {
    this.selectedRegion = null;
    this.selectedPharmacies = [];
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }
}
