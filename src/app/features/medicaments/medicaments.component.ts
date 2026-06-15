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
  templateUrl: './medicaments.component.html',
  styleUrls: ['./medicaments.component.css']
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

  // ----- Synthèse -----
  get sumMeds(): number { return this.dataSource?.filteredData?.length ?? 0; }
  get sumEligibles(): number { return (this.dataSource?.filteredData ?? []).filter(m => String(m.statut) === 'ELIGIBLE').length; }
  get sumExclus(): number { return (this.dataSource?.filteredData ?? []).filter(m => String(m.statut) === 'EXCLU').length; }

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
