import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FactureService } from '../../../core/services/facture.service';
import { Facture, StatutFacture } from '../../../core/models/facture.model';
import { AuthService } from '../../../core/services/auth.service';
import { RegionService, Region } from '../../../core/services/region.service';
import { PharmacieService } from '../../../core/services/pharmacie.service';
import { Pharmacie } from '../../../core/models/pharmacie.model';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfirmService } from '../../../core/services/confirm.service';

@Component({
  selector: 'app-factures-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    StatusBadgeComponent,
    MatSnackBarModule
  ],
  template: `
    <div class="list-page">
      <!-- Header -->
      <div class="list-header">
        <div>
          <h1>{{ authService.isPharmacien() ? 'Mes Factures' : 'Liste des Factures' }}</h1>
          <p>Gérez et suivez le statut des factures pharmaceutiques</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" (click)="exportExcel()">
            <mat-icon>table_view</mat-icon> Excel
          </button>
          <button class="btn btn-outline" (click)="exportPdf()">
            <mat-icon>picture_as_pdf</mat-icon> PDF
          </button>
          <button class="btn btn-outline" *ngIf="!authService.isPharmacien()" (click)="fileInput.click()">
            <mat-icon>upload_file</mat-icon> Import
          </button>
          <input type="file" #fileInput style="display: none" (change)="onFileSelected($event)" accept=".xlsx, .xls">
          <a class="btn btn-primary" routerLink="create" *ngIf="authService.isPharmacien()">
            <mat-icon>add</mat-icon> Nouvelle Facture
          </a>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon blue">
            <mat-icon>receipt_long</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ totalFactures }}</span>
            <span class="kpi-label">Total Factures</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon green">
            <mat-icon>payments</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ montantTotal | number }} <small>CFA</small></span>
            <span class="kpi-label">Montant Total</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon amber">
            <mat-icon>pending_actions</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ facturesAttente }}</span>
            <span class="kpi-label">En attente</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon red">
            <mat-icon>error_outline</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ facturesRejetees }}</span>
            <span class="kpi-label">Rejetées</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-strip">
        <mat-form-field appearance="outline" class="filter-field search-field">
          <mat-label>Rechercher...</mat-label>
          <input matInput (keyup)="applyFilter($event)" placeholder="ID, pharmacie..." #input>
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>
        
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Statut</mat-label>
          <mat-select [(value)]="filterStatut" (selectionChange)="applyAdvancedFilter()">
            <mat-option value="">Tous</mat-option>
            <mat-option *ngFor="let s of statuts" [value]="s">{{ s }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field" *ngIf="!authService.isPharmacien()">
          <mat-label>Mois</mat-label>
          <mat-select [(value)]="filterMois" (selectionChange)="applyAdvancedFilter()">
            <mat-option [value]="0">Tous</mat-option>
            <mat-option *ngFor="let m of [1,2,3,4,5,6,7,8,9,10,11,12]" [value]="m">{{ getMonthName(m) }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field" *ngIf="!authService.isPharmacien()">
          <mat-label>Année</mat-label>
          <mat-select [(value)]="filterAnnee" (selectionChange)="applyAdvancedFilter()">
            <mat-option [value]="0">Toutes</mat-option>
            <mat-option *ngFor="let a of [2023, 2024, 2025, 2026]" [value]="a">{{ a }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <!-- Table -->
      <mat-card class="table-card">
        <table mat-table [dataSource]="dataSource" matSort class="w-100">
          <ng-container matColumnDef="id">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> ID </th>
            <td mat-cell *matCellDef="let f">
              <span class="id-chip">{{ f.id | slice:0:8 }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="pharmacie" *ngIf="!authService.isPharmacien()">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Pharmacie </th>
            <td mat-cell *matCellDef="let f"> {{ f.pharmacieNom }} </td>
          </ng-container>

          <ng-container matColumnDef="periode">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Période </th>
            <td mat-cell *matCellDef="let f"> {{ getMonthName(f.mois) }} {{ f.annee }} </td>
          </ng-container>

          <ng-container matColumnDef="montant">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Montant </th>
            <td mat-cell *matCellDef="let f">
              <strong>{{ f.montantTotal | number }} CFA</strong>
            </td>
          </ng-container>

          <ng-container matColumnDef="statut">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Statut </th>
            <td mat-cell *matCellDef="let f"> <app-status-badge [statut]="f.statut"></app-status-badge> </td>
          </ng-container>

          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Modifiée </th>
            <td mat-cell *matCellDef="let f" class="text-muted"> {{ f.updatedAt | date:'dd/MM/yyyy' }} </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef> </th>
            <td mat-cell *matCellDef="let f">
              <div class="action-group">
                <a class="action-btn" [routerLink]="['/dashboard/factures', f.id]" title="Voir">
                  <mat-icon>visibility</mat-icon>
                </a>
                <button class="action-btn success" (click)="exportSingleExcel(f.id, f.mois, f.annee)" title="Excel">
                  <mat-icon>table_view</mat-icon>
                </button>
                <a class="action-btn" *ngIf="authService.isPharmacien() && f.statut === 'BROUILLON'" [routerLink]="['/dashboard/factures', f.id, 'edit']" title="Modifier">
                  <mat-icon>edit</mat-icon>
                </a>
                <button class="action-btn danger" *ngIf="authService.isPharmacien() && f.statut === 'BROUILLON'" (click)="deleteFacture(f.id)" title="Supprimer">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty-state" [attr.colspan]="displayedColumns.length">
              <mat-icon>search_off</mat-icon>
              <p>Aucune facture trouvée</p>
            </td>
          </tr>
        </table>

        <mat-paginator [pageSizeOptions]="[10, 25, 50]" aria-label="Select page of factures"></mat-paginator>
      </mat-card>

      <!-- Vue mobile : cartes cliquables (clic → détail, comme la vue admin) -->
      <div class="mobile-cards">
        <a class="facture-card" *ngFor="let f of dataSource.filteredData"
           [routerLink]="['/dashboard/factures', f.id]">
          <div class="fc-head">
            <span class="fc-title">{{ authService.isPharmacien() ? (getMonthName(f.mois) + ' ' + f.annee) : f.pharmacieNom }}</span>
            <app-status-badge [statut]="f.statut"></app-status-badge>
          </div>
          <div class="fc-row">
            <span class="fc-period" *ngIf="!authService.isPharmacien()">
              <mat-icon>event</mat-icon> {{ getMonthName(f.mois) }} {{ f.annee }}
            </span>
            <span class="fc-amount">{{ f.montantTotal | number }} CFA</span>
            <mat-icon class="fc-chevron">chevron_right</mat-icon>
          </div>
        </a>
        <div class="mobile-empty" *ngIf="dataSource.filteredData.length === 0">
          <mat-icon>search_off</mat-icon>
          <p>Aucune facture trouvée</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .list-page {
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .list-header h1 {
      font-size: 26px;
      font-weight: 700;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .list-header p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
    }
    .header-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }
    .btn-outline {
      background: white;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-outline:hover {
      background: var(--border-light);
    }

    .filter-strip {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      align-items: flex-start;
    }
    .filter-field {
      min-width: 160px;
    }
    .search-field {
      flex: 1;
      min-width: 240px;
    }

    .table-card {
      padding: 0 !important;
      overflow: hidden;
    }
    .w-100 { width: 100%; }

    .id-chip {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 13px;
      background: var(--border-light);
      padding: 3px 8px;
      border-radius: 4px;
      color: var(--text-secondary);
    }

    .text-muted {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .action-group {
      display: flex;
      gap: 4px;
    }
    .action-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .action-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .action-btn:hover {
      background: var(--border-light);
      color: var(--primary);
    }
    .action-btn.success:hover {
      color: #16A34A;
    }
    .action-btn.danger:hover {
      color: var(--warn);
      background: var(--warn-light);
    }

    .empty-state {
      text-align: center;
      padding: 48px !important;
    }
    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .empty-state p {
      color: var(--text-secondary);
      font-size: 15px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }
    @media (max-width: 1024px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
    .kpi-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: var(--shadow-sm);
      transition: all 0.2s ease;
    }
    .kpi-card:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .kpi-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-icon.blue { background: #DBEAFE; color: #2563EB; }
    .kpi-icon.green { background: #DCFCE7; color: #16A34A; }
    .kpi-icon.amber { background: #FEF3C7; color: #D97706; }
    .kpi-icon.red { background: #FEE2E2; color: #EF4444; }
    .kpi-body {
      display: flex;
      flex-direction: column;
    }
    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .kpi-value small {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .kpi-label {
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
      margin-top: 2px;
    }

    /* Vue cartes mobile (cachée sur desktop) */
    .mobile-cards { display: none; }
    .facture-card {
      display: block;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
      padding: 14px 16px;
      text-decoration: none;
      color: var(--text-primary);
      transition: background 0.15s ease;
    }
    .facture-card:active { background: var(--primary-light); }
    .fc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .fc-title { font-weight: 700; font-size: 15px; }
    .fc-row { display: flex; align-items: center; gap: 8px; }
    .fc-period { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-secondary); }
    .fc-period mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .fc-amount { margin-left: auto; font-weight: 700; color: var(--primary); }
    .fc-chevron { color: var(--text-muted); }
    .mobile-empty { text-align: center; padding: 40px 0; color: var(--text-muted); }
    .mobile-empty mat-icon { font-size: 40px; width: 40px; height: 40px; opacity: 0.6; }

    @media (max-width: 768px) {
      .list-header {
        flex-direction: column;
      }
      .filter-strip {
        flex-direction: column;
      }
      .filter-field, .search-field {
        min-width: 100%;
      }
      /* Bascule tableau → cartes cliquables */
      .table-card { display: none; }
      .mobile-cards { display: flex; flex-direction: column; gap: 12px; }
    }
  `]
})
export class FacturesListComponent implements OnInit {
  displayedColumns: string[] = ['id', 'periode', 'montant', 'statut', 'date', 'actions'];
  dataSource!: MatTableDataSource<Facture>;
  factures: Facture[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  filterStatut = '';
  filterMois = 0;
  filterAnnee = 0;
  statuts = Object.values(StatutFacture);
  isImporting = false;

  totalFactures = 0;
  montantTotal = 0;
  facturesAttente = 0;
  facturesRejetees = 0;

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService
  ) {
    if (!this.authService.isPharmacien()) {
      this.displayedColumns = ['id', 'pharmacie', 'periode', 'montant', 'statut', 'date', 'actions'];
    }
  }

  ngOnInit() {
    this.loadFactures();
  }

  loadFactures() {
    this.factureService.getAll().subscribe((data: Facture[]) => {
      this.factures = data;

      // Calculate KPIs
      this.totalFactures = this.factures.length;
      this.montantTotal = this.factures.reduce((sum: number, f: Facture) => sum + f.montantTotal, 0);
      this.facturesAttente = this.factures.filter((f: Facture) => f.statut === 'ENVOYEE' || f.statut === 'EN_VERIFICATION').length;
      this.facturesRejetees = this.factures.filter((f: Facture) => f.statut === 'REJETEE').length;

      this.dataSource = new MatTableDataSource(this.factures);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.dataSource.filterPredicate = this.customFilterPredicate();
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  applyAdvancedFilter() {
    this.dataSource.filter = Math.random().toString();
  }

  customFilterPredicate() {
    return (data: Facture, filter: string) => {
      let matchSearch = true;
      let matchStatut = true;
      let matchMois = true;
      let matchAnnee = true;

      if (this.input?.nativeElement?.value) {
        const term = this.input.nativeElement.value.toLowerCase();
        matchSearch = data.id.toLowerCase().includes(term) ||
          (data.pharmacieNom ? data.pharmacieNom.toLowerCase().includes(term) : false);
      }

      if (this.filterStatut) {
        matchStatut = data.statut === this.filterStatut;
      }

      if (this.filterMois > 0) {
        matchMois = data.mois === this.filterMois;
      }

      if (this.filterAnnee > 0) {
        matchAnnee = data.annee === this.filterAnnee;
      }

      return matchSearch && matchStatut && matchMois && matchAnnee;
    };
  }

  @ViewChild('input') input: any;

  exportExcel() {
    this.factureService.exportExcel().subscribe((blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factures_csu_${new Date().getTime()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  exportPdf() {
    this.factureService.exportPdf().subscribe((blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factures_csu_${new Date().getTime()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  exportSingleExcel(id: string, mois: number, annee: number) {
    this.factureService.exportFactureExcel(id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(mois)}_${annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Excel réussi', 'Fermer', { duration: 3000 });
      },
      error: (err: any) => {
        this.snackBar.open('Erreur lors de l\'export: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.isImporting = true;
      this.snackBar.open('Importation en cours...', '', { duration: 0 });
      this.factureService.importExcel(file).subscribe({
        next: () => {
          this.snackBar.open('Import réussi ! Les factures ont été mises à jour.', 'Fermer', { duration: 3000 });
          this.loadFactures();
          this.isImporting = false;
          event.target.value = '';
        },
        error: (err: any) => {
          let errorMsg = 'Erreur lors de l\'importation.';
          if (err.error && err.error.message) {
            errorMsg = err.error.message;
          } else if (err.error && err.error.cause) {
            errorMsg = err.error.cause;
          } else if (err.status === 403) {
            errorMsg = 'Accès refusé. Vous n\'avez pas les droits pour effectuer cette action.';
          } else if (err.status === 0) {
            errorMsg = 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
          }
          this.snackBar.open(errorMsg, 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
          this.isImporting = false;
          event.target.value = '';
        }
      });
    }
  }

  deleteFacture(id: string) {
    this.confirm.ask({
      title: 'Supprimer la facture',
      message: 'Êtes-vous sûr de vouloir supprimer cette facture brouillon ? Cette action est irréversible.',
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.delete(id).subscribe({
        next: () => {
          this.snackBar.open('Facture supprimée', 'Fermer', { duration: 3000 });
          this.loadFactures();
        },
        error: () => {
          this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }
}
