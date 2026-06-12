import { Component, OnInit, ViewChild, Input, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FactureService } from '../../../core/services/facture.service';
import { Facture, StatutFacture } from '../../../core/models/facture.model';
import { AuthService } from '../../../core/services/auth.service';
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
    <div class="list-page fade-in">
      <!-- En-tête -->
      <div class="page-head">
        <div>
          <h1>{{ authService.isPharmacien() ? 'Mes Factures' : 'Liste des Factures' }}</h1>
          <p>Gérez et suivez le statut des factures pharmaceutiques</p>
        </div>
        <div class="page-head-actions">
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
          <a class="btn btn-primary" routerLink="/dashboard" *ngIf="authService.isPharmacien()">
            <mat-icon>add</mat-icon> Nouvelle Facture
          </a>
        </div>
      </div>

      <!-- Filtres -->
      <div class="filter-strip">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input (keyup)="applyFilter($event)" placeholder="Rechercher par ID ou pharmacie…" #input>
        </div>

        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic">
          <mat-label>Statut</mat-label>
          <mat-select [(value)]="filterStatut" (selectionChange)="applyAdvancedFilter()">
            <mat-option value="">Tous</mat-option>
            <mat-option *ngFor="let s of statuts" [value]="s">{{ s }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic" *ngIf="!authService.isPharmacien()">
          <mat-label>Mois</mat-label>
          <mat-select [(value)]="filterMois" (selectionChange)="applyAdvancedFilter()">
            <mat-option [value]="0">Tous</mat-option>
            <mat-option *ngFor="let m of [1,2,3,4,5,6,7,8,9,10,11,12]" [value]="m">{{ getMonthName(m) }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic" *ngIf="!authService.isPharmacien()">
          <mat-label>Année</mat-label>
          <mat-select [(value)]="filterAnnee" (selectionChange)="applyAdvancedFilter()">
            <mat-option [value]="0">Toutes</mat-option>
            <mat-option *ngFor="let a of [2023, 2024, 2025, 2026]" [value]="a">{{ a }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <!-- Tableau (desktop) -->
      <mat-card class="table-card desktop-only">
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
                <button class="btn btn-primary btn-sm" *ngIf="showPaymentButton && f.statut === 'VALIDEE_NC'" (click)="payerFacture(f.id)" style="margin-left:8px;">
                  <mat-icon>payments</mat-icon> Payer
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
      </mat-card>

      <!-- Cartes (mobile) -->
      <div class="m-cards">
        <div class="m-card clickable" *ngFor="let f of pagedFactures" (click)="openFacture(f.id)">
          <div class="m-card-top">
            <span class="m-title">{{ authService.isPharmacien() ? (getMonthName(f.mois) + ' ' + f.annee) : f.pharmacieNom }}</span>
            <div class="m-actions">
              <a class="action-btn" *ngIf="authService.isPharmacien() && f.statut === 'BROUILLON'"
                 [routerLink]="['/dashboard/factures', f.id, 'edit']"
                 (click)="$event.stopPropagation()" title="Modifier">
                <mat-icon>edit</mat-icon>
              </a>
              <button class="action-btn danger" *ngIf="authService.isPharmacien() && f.statut === 'BROUILLON'"
                      (click)="$event.stopPropagation(); deleteFacture(f.id)" title="Supprimer">
                <mat-icon>delete</mat-icon>
              </button>
              <mat-icon class="m-chevron" *ngIf="!(authService.isPharmacien() && f.statut === 'BROUILLON')">chevron_right</mat-icon>
            </div>
          </div>
          <div class="m-sub">#{{ f.id | slice:0:8 }}</div>
          <div class="m-meta" *ngIf="!authService.isPharmacien()">
            <mat-icon>event</mat-icon> {{ getMonthName(f.mois) }} {{ f.annee }}
          </div>
          <div class="m-meta">
            <mat-icon>history</mat-icon> Modifiée le {{ f.updatedAt | date:'dd/MM/yyyy' }}
          </div>
          <div class="m-foot">
            <app-status-badge [statut]="f.statut"></app-status-badge>
            <span class="m-amount">{{ f.montantTotal | number }} CFA</span>
          </div>
          <button class="btn btn-primary btn-block pay-btn" *ngIf="showPaymentButton && f.statut === 'VALIDEE_NC'"
                  (click)="$event.stopPropagation(); payerFacture(f.id)">
            <mat-icon>payments</mat-icon> Payer cette facture
          </button>
        </div>
        <div class="empty-state" *ngIf="!dataSource || dataSource.filteredData.length === 0">
          <mat-icon>search_off</mat-icon>
          <p>Aucune facture trouvée</p>
        </div>
      </div>

      <!-- Pagination (desktop + mobile) -->
      <mat-paginator [pageSizeOptions]="[10, 25, 50]" showFirstLastButtons aria-label="Pagination des factures"></mat-paginator>
    </div>
  `,
  styles: [`
    .pay-btn { margin-top: 12px; }
  `]
})
export class FacturesListComponent implements OnInit {
  displayedColumns: string[] = ['id', 'periode', 'montant', 'statut', 'date', 'actions'];
  dataSource!: MatTableDataSource<Facture>;
  factures: Facture[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('input') input!: ElementRef<HTMLInputElement>;

  filterStatut = '';
  filterMois = 0;
  filterAnnee = 0;
  statuts = Object.values(StatutFacture);
  isImporting = false;

  @Input() allowedStatuses?: string[];
  @Input() showPaymentButton = false;

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    private router: Router
  ) {
    if (!this.authService.isPharmacien()) {
      this.displayedColumns = ['id', 'pharmacie', 'periode', 'montant', 'statut', 'date', 'actions'];
    }
  }

  ngOnInit() {
    this.loadFactures();
  }

  /** Page courante pour la vue cartes mobile (suit le paginator). */
  get pagedFactures(): Facture[] {
    const data = this.dataSource?.filteredData ?? [];
    if (!this.paginator) return data;
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    return data.slice(start, start + this.paginator.pageSize);
  }

  openFacture(id: string) {
    this.router.navigate(['/dashboard/factures', id]);
  }

  loadFactures() {
    this.factureService.getAll().subscribe((data: Facture[]) => {
      // Filtrer par statuts autorisés si spécifié
      if (this.allowedStatuses && this.allowedStatuses.length > 0) {
        this.factures = data.filter(f => this.allowedStatuses!.includes(f.statut.toString()));
      } else {
        this.factures = data;
      }

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
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
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

  payerFacture(id: string) {
    this.confirm.ask({
      title: 'Payer la facture',
      message: 'Confirmez-vous le paiement de cette facture ?',
      confirmText: 'Payer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.payer(id).subscribe({
        next: () => {
          this.snackBar.open('Facture payée avec succès', 'Fermer', { duration: 3000 });
          this.loadFactures();
        },
        error: (err: any) => {
          this.snackBar.open('Erreur lors du paiement: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
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
