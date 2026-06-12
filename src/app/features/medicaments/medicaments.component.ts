import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MedicamentService } from '../../core/services/medicament.service';
import { Medicament } from '../../core/models/medicament.model';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-medicaments',
  standalone: true,
  imports: [
    CommonModule, MatTableModule, MatPaginatorModule, MatSortModule,
    MatButtonModule, MatIconModule, MatCardModule, MatInputModule, MatSnackBarModule
  ],
  template: `
    <div class="fade-in">
      <!-- En-tête -->
      <div class="page-head">
        <div>
          <h1>Gestion des Médicaments</h1>
          <p>Consultez la liste des médicaments et importez les listes éligibles / exclues.</p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-primary" (click)="fileInput.click()">
            <mat-icon>upload_file</mat-icon> Liste Éligibles
          </button>
          <input type="file" #fileInput style="display: none" (change)="onFileSelected($event)" accept=".xlsx, .xls">
          <button class="btn btn-outline" (click)="exclusionInput.click()">
            <mat-icon>block</mat-icon> Liste Exclusions
          </button>
          <input type="file" #exclusionInput style="display: none" (change)="onExclusionFileSelected($event)" accept=".xlsx, .xls">
        </div>
      </div>

      <!-- Recherche -->
      <div class="filter-strip">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input (keyup)="applyFilter($event)" placeholder="Rechercher par nom, DCI…">
        </div>
      </div>

      <!-- Tableau (desktop) -->
      <mat-card class="table-card desktop-only">
        <table mat-table [dataSource]="dataSource" matSort class="w-100">
          <ng-container matColumnDef="nom">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Nom Commercial </th>
            <td mat-cell *matCellDef="let m"> <strong>{{ m.nom }}</strong> </td>
          </ng-container>

          <ng-container matColumnDef="dci">
            <th mat-header-cell *matHeaderCellDef> DCI / Principe actif </th>
            <td mat-cell *matCellDef="let m"> {{ m.dci || '-' }} </td>
          </ng-container>

          <ng-container matColumnDef="classeTherapeutique">
            <th mat-header-cell *matHeaderCellDef> Classe thérapeutique </th>
            <td mat-cell *matCellDef="let m"> {{ m.classeTherapeutique || '-' }} </td>
          </ng-container>

          <ng-container matColumnDef="liste">
            <th mat-header-cell *matHeaderCellDef> Liste </th>
            <td mat-cell *matCellDef="let m"> {{ m.liste || '-' }} </td>
          </ng-container>

          <ng-container matColumnDef="statut">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Statut </th>
            <td mat-cell *matCellDef="let m">
              <span class="m-chip" [class.danger]="m.statut === 'EXCLU'">
                {{ m.statut === 'EXCLU' ? 'Exclu' : 'Éligible' }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="motif">
            <th mat-header-cell *matHeaderCellDef> Motif / Description </th>
            <td mat-cell *matCellDef="let m">
              <ng-container *ngIf="m.statut === 'EXCLU'; else noMotif">
                <strong>{{ m.motif || '-' }}</strong>
                <span *ngIf="m.description" class="desc-text"> — {{ m.description }}</span>
              </ng-container>
              <ng-template #noMotif><span class="text-muted">—</span></ng-template>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          <tr class="mat-row" *matNoDataRow>
            <td class="mat-cell empty-state" [attr.colspan]="displayedColumns.length">
              <mat-icon>search_off</mat-icon>
              <p>Aucun médicament trouvé</p>
            </td>
          </tr>
        </table>
      </mat-card>

      <!-- Cartes (mobile) -->
      <div class="m-cards">
        <div class="m-card" *ngFor="let m of pagedMedicaments">
          <div class="m-card-top">
            <span class="m-title">{{ m.nom }}</span>
            <span class="m-chip" [class.danger]="m.statut === 'EXCLU'">
              {{ m.statut === 'EXCLU' ? 'Exclu' : 'Éligible' }}
            </span>
          </div>
          <div class="m-sub" *ngIf="m.dci">{{ m.dci }}</div>
          <div class="m-meta" *ngIf="m.classeTherapeutique">
            <mat-icon>category</mat-icon> {{ m.classeTherapeutique }}
          </div>
          <div class="m-meta" *ngIf="m.liste">
            <mat-icon>list_alt</mat-icon> Liste {{ m.liste }}
          </div>
          <div class="m-row motif-row" *ngIf="m.statut === 'EXCLU' && (m.motif || m.description)">
            <mat-icon>info</mat-icon>
            <span><strong>{{ m.motif || 'Motif non précisé' }}</strong><ng-container *ngIf="m.description"> — {{ m.description }}</ng-container></span>
          </div>
        </div>
        <div class="empty-state" *ngIf="!dataSource || dataSource.filteredData.length === 0">
          <mat-icon>search_off</mat-icon>
          <p>Aucun médicament trouvé</p>
        </div>
      </div>

      <mat-paginator [pageSizeOptions]="[10, 25, 50]" showFirstLastButtons aria-label="Pagination des médicaments"></mat-paginator>
    </div>
  `,
  styles: [`
    .desc-text { color: var(--text-secondary); font-size: 12px; }
    .motif-row {
      align-items: flex-start;
      background: #FFF7ED;
      border: 1px solid #FED7AA;
      border-radius: var(--radius-sm);
      padding: 8px 10px;
      color: #9A3412;
      font-size: 13px;
    }
    .motif-row mat-icon { font-size: 16px; width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; color: #EA580C; }
  `]
})
export class MedicamentsComponent implements OnInit {
  displayedColumns: string[] = ['nom', 'dci', 'classeTherapeutique', 'liste', 'statut', 'motif'];
  dataSource!: MatTableDataSource<Medicament>;
  medicaments: Medicament[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private medicamentService: MedicamentService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loadMedicaments();
  }

  /** Page courante pour la vue cartes mobile (suit le paginator). */
  get pagedMedicaments(): Medicament[] {
    const data = this.dataSource?.filteredData ?? [];
    if (!this.paginator) return data.slice(0, 10);
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    return data.slice(start, start + this.paginator.pageSize);
  }

  loadMedicaments() {
    this.medicamentService.getAll().subscribe(data => {
      this.medicaments = data;
      this.dataSource = new MatTableDataSource(this.medicaments);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.snackBar.open('Importation en cours...', '', { duration: 0 });
      this.medicamentService.importEligibles(file).subscribe({
        next: () => {
          this.snackBar.open('Import réussi ! Les médicaments éligibles ont été mis à jour.', 'Fermer', { duration: 3000 });
          this.loadMedicaments();
          // Réinitialiser l'input file pour pouvoir réimporter le même fichier
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
          // Réinitialiser l'input file
          event.target.value = '';
        }
      });
    }
  }

  onExclusionFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.snackBar.open('Importation des exclusions en cours...', '', { duration: 0 });
      this.medicamentService.importExclusions(file).subscribe({
        next: () => {
          this.snackBar.open('Import réussi ! La liste des exclusions a été mise à jour.', 'Fermer', { duration: 3000 });
          this.loadMedicaments();
          event.target.value = '';
        },
        error: (err: any) => {
          let errorMsg = 'Erreur lors de l\'importation des exclusions.';
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
          event.target.value = '';
        }
      });
    }
  }
}
