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
    <div class="page-header flex-header">
      <div>
        <h1>Gestion des Médicaments</h1>
        <p>Consultez la liste des médicaments et importez la liste des médicaments éligibles.</p>
      </div>
      <div class="actions">
        <button mat-flat-button color="primary" (click)="fileInput.click()">
          <mat-icon>upload_file</mat-icon> Importer Liste Éligibles (Excel)
        </button>
        <input type="file" #fileInput style="display: none" (change)="onFileSelected($event)" accept=".xlsx, .xls">
      </div>
    </div>

    <mat-card class="filter-card mb-4 mt-4">
      <mat-card-content>
        <mat-form-field appearance="outline" class="w-100">
          <mat-label>Recherche globale</mat-label>
          <input matInput (keyup)="applyFilter($event)" placeholder="Rechercher par code ou nom...">
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>
      </mat-card-content>
    </mat-card>

    <mat-card class="table-card">
      <table mat-table [dataSource]="dataSource" matSort class="w-100">
        <ng-container matColumnDef="code">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Code </th>
          <td mat-cell *matCellDef="let m"> {{ m.code }} </td>
        </ng-container>

        <ng-container matColumnDef="nom">
          <th mat-header-cell *matHeaderCellDef mat-sort-header> Nom Commercial </th>
          <td mat-cell *matCellDef="let m"> {{ m.nom }} </td>
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
            <span class="badge" [ngClass]="m.statut === 'EXCLU' ? 'badge-danger' : 'badge-success'">
              {{ m.statut }}
            </span>
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        <tr class="mat-row" *matNoDataRow>
          <td class="mat-cell text-center p-4" [attr.colspan]="displayedColumns.length">
            <mat-icon class="empty-icon">search_off</mat-icon>
            <p>Aucun médicament trouvé</p>
          </td>
        </tr>
      </table>
      <mat-paginator [pageSizeOptions]="[10, 25, 50]"></mat-paginator>
    </mat-card>
  `,
  styles: [`
    .flex-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .table-card { padding: 0; overflow: hidden; }
    .w-100 { width: 100%; }
    .mb-4 { margin-bottom: 24px; }
    .mt-4 { margin-top: 24px; }
    th.mat-header-cell { font-weight: 600; color: var(--text-secondary); background: #F8FAFC; }
    .text-center { text-align: center; }
    .p-4 { padding: 32px; }
    .empty-icon { font-size: 48px; width: 48px; height: 48px; color: var(--text-secondary); opacity: 0.5; margin-bottom: 16px; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .badge-danger { background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; }
    .badge-success { background: #dcfce7; color: #22c55e; border: 1px solid #bbf7d0; }
  `]
})
export class MedicamentsComponent implements OnInit {
  displayedColumns: string[] = ['code', 'nom', 'dci', 'classeTherapeutique', 'liste', 'statut'];
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
}
