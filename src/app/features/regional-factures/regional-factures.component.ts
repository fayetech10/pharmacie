import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { FactureService } from '../../core/services/facture.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { StatsComponent } from '../stats/stats.component';

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
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatSnackBarModule,
    StatusBadgeComponent,
    StatsComponent
  ],
  template: `
    <!-- Statistiques de la région (vue principale uniquement) -->
    <app-stats [embedded]="true" *ngIf="level === 'pharmacies'"></app-stats>

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
    <!-- Filtres Année + Statut -->
    <div class="dash-filters" *ngIf="level === 'factures'">
      <label class="dash-select">
        <span>Année</span>
        <select [(ngModel)]="filterYear">
          <option [ngValue]="0">Toutes</option>
          <option *ngFor="let y of anneesDispo" [ngValue]="y">{{ y }}</option>
        </select>
      </label>
      <label class="dash-select">
        <span>Statut</span>
        <select [(ngModel)]="filterStatut">
          <option value="">Tous les statuts</option>
          <option *ngFor="let s of statuts" [value]="s">{{ statutLabel(s) }}</option>
        </select>
      </label>
    </div>

    <div class="m-cards" *ngIf="level === 'factures'">
      <div class="m-card" *ngFor="let f of displayedFactures">
        <div class="m-card-top">
          <span class="m-title">{{ getMonthName(f.mois) }} {{ f.annee }}</span>
          <div class="m-actions">
            <button class="action-btn success" (click)="exportFacture(f)" title="Télécharger">
              <mat-icon>download</mat-icon>
            </button>
            <a class="action-btn" [routerLink]="['/dashboard/factures', f.id]" title="Voir">
              <mat-icon>visibility</mat-icon>
            </a>
          </div>
        </div>
        <div class="m-foot">
          <app-status-badge [statut]="f.statut"></app-status-badge>
          <span class="m-amount">{{ f.montantTotal | number:'1.0-0':'fr' }} CFA</span>
        </div>
      </div>
      <div class="empty-state" *ngIf="displayedFactures.length === 0">
        <mat-icon>receipt_long</mat-icon>
        <p>Aucune facture pour ce filtre</p>
      </div>
    </div>

    <mat-card class="table-card desktop-only" *ngIf="level === 'factures'">
      <table mat-table [dataSource]="displayedFactures" class="w-100">
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
          <th mat-header-cell *matHeaderCellDef> Actions </th>
          <td mat-cell *matCellDef="let f">
            <div class="action-group">
              <button class="action-btn success" (click)="exportFacture(f)" title="Télécharger">
                <mat-icon>download</mat-icon>
              </button>
              <a class="action-btn" [routerLink]="['/dashboard/factures', f.id]" title="Voir la facture">
                <mat-icon>visibility</mat-icon>
              </a>
            </div>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="factureColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: factureColumns;"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td class="empty-cell" colspan="4">Aucune facture pour ce filtre.</td>
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

    /* Filtres de tableau de bord (Année / Statut) */
    .dash-filters { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .dash-select { display: flex; flex-direction: column; gap: 4px; min-width: 150px; flex: 1; max-width: 220px; }
    .dash-select span { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
    .dash-select select {
      height: 44px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--field-bg);
      padding: 0 12px;
      font-family: inherit;
      font-size: 14px;
      color: var(--text-primary);
      cursor: pointer;
    }
    .dash-select select:focus { outline: none; border-color: var(--primary); background: #fff; }

    @media (max-width: 768px) {
      .header-content h1 { font-size: 21px; }
      .dash-select { max-width: none; }
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

  // Filtres niveau 2 (factures d'une pharmacie)
  filterYear = 0;
  filterStatut = '';
  statuts = Object.values(StatutFacture);
  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée SR', REJETEE_SR: 'Rejetée SR',
    VALIDEE_NC: 'Validée NC', REJETEE_NC: 'Rejetée NC', PAYEE: 'Payée'
  };

  constructor(
    private authService: AuthService,
    private pharmacieService: PharmacieService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
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

  /** Années présentes dans les factures de la pharmacie sélectionnée (tri décroissant). */
  get anneesDispo(): number[] {
    const fs = this.selectedPharmacie?.factures ?? [];
    return Array.from(new Set(fs.map(f => f.annee))).sort((a, b) => b - a);
  }

  /** Factures de la pharmacie sélectionnée filtrées par année + statut. */
  get displayedFactures(): Facture[] {
    let fs = this.selectedPharmacie?.factures ?? [];
    if (this.filterYear) fs = fs.filter(f => f.annee === this.filterYear);
    if (this.filterStatut) fs = fs.filter(f => f.statut === this.filterStatut);
    return fs;
  }

  statutLabel(s: string): string {
    return this.statutLabels[s] ?? s;
  }

  exportFacture(f: Facture) {
    this.factureService.exportFactureExcel(f.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(f.mois)}_${f.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Téléchargement lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  // Niveau 1 → 2
  selectPharmacie(ps: PharmacieSummary) {
    this.selectedPharmacie = ps;
    this.filterYear = 0;
    this.filterStatut = '';
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
