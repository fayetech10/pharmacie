import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PatientService } from '../../core/services/patient.service';
import { AuthService } from '../../core/services/auth.service';
import { Patient, Regime, REGIME_LABELS, REGIME_OPTIONS } from '../../core/models/bcsu.model';

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatSnackBarModule
  ],
  templateUrl: './patients.component.html',
  styleUrls: ['./patients.component.css']
})
export class PatientsComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  /** Catégories du classeur CS_EPS (les régimes hérités sont exclus des filtres/saisies). */
  readonly regimeValues = REGIME_OPTIONS;

  patients: Patient[] = [];
  loading = true;
  searchQuery = '';

  /** Filtres */
  selectedRegime: Regime | '' = '';

  /** Pagination (client-side, sur la liste déjà filtrée). */
  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [10, 20, 50, 100];

  constructor(
    private patientService: PatientService,
    private router: Router,
    private snackBar: MatSnackBar,
    public authService: AuthService
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.patientService.getAll().subscribe({
      next: (res) => {
        this.patients = res;
        this.loading = false;
      },
      error: () => {
        this.snackBar.open('Erreur lors du chargement des patients', 'Fermer', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  get filteredPatients(): Patient[] {
    let list = this.patients;

    // Filtre par régime
    if (this.selectedRegime) {
      list = list.filter(p => p.regime === this.selectedRegime);
    }

    // Filtre par recherche textuelle
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.nom.toLowerCase().includes(q) ||
        p.prenom.toLowerCase().includes(q) ||
        (p.numeroCni && p.numeroCni.toLowerCase().includes(q)) ||
        (p.numeroAssure && p.numeroAssure.toLowerCase().includes(q)) ||
        (p.telephone && p.telephone.includes(q))
      );
    }

    return list;
  }

  /** Page courante de la liste filtrée, affichée dans le tableau. */
  get pagedPatients(): Patient[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredPatients.slice(start, start + this.pageSize);
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  /** Revient à la première page lorsque la recherche ou un filtre change. */
  resetPage() {
    this.pageIndex = 0;
  }

  /** Compteur par régime pour les badges */
  getRegimeCount(regime: Regime): number {
    return this.patients.filter(p => p.regime === regime).length;
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedRegime = '';
    this.resetPage();
  }

  get hasActiveFilters(): boolean {
    return this.searchQuery.trim().length > 0 || this.selectedRegime !== '';
  }

  getRegimeBadgeStyle(regime: Regime): Record<string, string> {
    const map: Record<string, { bg: string; color: string }> = {
      CONTRIBUTIF: { bg: '#dbeafe', color: '#1e40af' },
      SESAME: { bg: '#fef3c7', color: '#92400e' },
      CESARIENNE: { bg: '#fce7f3', color: '#9d174d' },
      ZERO_CINQ_ANS: { bg: '#d1fae5', color: '#065f46' },
      DIALYSE: { bg: '#ede9fe', color: '#5b21b6' },
      BSF_CEC: { bg: '#ffedd5', color: '#9a3412' }
    };
    const style = map[regime] || { bg: '#f1f5f9', color: '#475569' };
    return {
      'font-size': '11.5px',
      'padding': '3px 8px',
      'border-radius': '6px',
      'font-weight': '600',
      'text-transform': 'uppercase',
      'background': style.bg,
      'color': style.color,
      'display': 'inline-block'
    };
  }

  openPatientDossier(id: string) {
    this.router.navigate(['/dashboard/patients', id]);
  }
}
