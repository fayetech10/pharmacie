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
import { BcsuService } from '../../core/services/bcsu.service';
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
  templateUrl: './patients.component.html'
})
export class PatientsComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  /** Catégories du classeur CS_EPS (les régimes hérités sont exclus des filtres/saisies). */
  readonly regimeValues = REGIME_OPTIONS;

  patients: Patient[] = [];
  loading = true;
  searchQuery = '';
  exporting = false;

  /** Filtres */
  selectedRegime: Regime | '' = '';
  /** 0 = tous. Le mois porte sur la date d'enregistrement du bénéficiaire. */
  filterMois = 0;
  filterAnnee = 0;

  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  /** Pagination (client-side, sur la liste déjà filtrée). */
  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [10, 20, 50, 100];

  constructor(
    private patientService: PatientService,
    private bcsuService: BcsuService,
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
        // Le dernier enregistrement doit apparaître en haut de la liste.
        this.patients = [...res].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        this.loading = false;
      },
      error: () => {
        this.snackBar.open('Erreur lors du chargement des patients', 'Fermer', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  /** Années présentes dans les enregistrements, la plus récente d'abord. */
  get anneesDispo(): number[] {
    const set = new Set<number>();
    for (const p of this.patients) {
      const a = this.anneeDe(p);
      if (a) set.add(a);
    }
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }

  private anneeDe(p: Patient): number | null {
    return p.createdAt ? new Date(p.createdAt).getFullYear() : null;
  }

  private moisDe(p: Patient): number | null {
    return p.createdAt ? new Date(p.createdAt).getMonth() + 1 : null;
  }

  get filteredPatients(): Patient[] {
    let list = this.patients;

    // Filtre par régime
    if (this.selectedRegime) {
      list = list.filter(p => p.regime === this.selectedRegime);
    }

    // Filtres sur la date d'enregistrement
    if (this.filterMois > 0) {
      list = list.filter(p => this.moisDe(p) === this.filterMois);
    }
    if (this.filterAnnee > 0) {
      list = list.filter(p => this.anneeDe(p) === this.filterAnnee);
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

  /** Nombre d'enregistrements du mois en cours (mois + année courants). */
  get countThisMonth(): number {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    return this.patients.filter(p => this.moisDe(p) === m && this.anneeDe(p) === y).length;
  }

  /** Nombre d'enregistrements de l'année en cours. */
  get countThisYear(): number {
    const y = new Date().getFullYear();
    return this.patients.filter(p => this.anneeDe(p) === y).length;
  }

  /** Âge en années révolues à partir de la date de naissance, si disponible. */
  age(p: Patient): number | null {
    if (!p.dateNaissance) return null;
    const d = new Date(p.dateNaissance);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
    return a >= 0 && a < 130 ? a : null;
  }

  /** Libellé lisible du sexe ("M"/"F" → Homme/Femme). */
  sexeLabel(p: Patient): string {
    const s = (p.sexe || '').toUpperCase();
    return s === 'M' ? 'Homme' : s === 'F' ? 'Femme' : '';
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedRegime = '';
    this.filterMois = 0;
    this.filterAnnee = 0;
    this.resetPage();
  }

  get hasActiveFilters(): boolean {
    return this.searchQuery.trim().length > 0
      || this.selectedRegime !== ''
      || this.filterMois > 0
      || this.filterAnnee > 0;
  }

  /**
   * Export Excel des enregistrements, avec les filtres actifs de l'onglet.
   * Le filtre plein texte n'est pas transmis : il n'a pas d'équivalent côté serveur.
   */
  exporter() {
    this.exporting = true;
    this.bcsuService.exportLettresGarantieExcel({
      mois: this.filterMois || undefined,
      annee: this.filterAnnee || undefined,
      regime: this.selectedRegime || undefined
    }).subscribe({
      next: (blob: Blob) => {
        this.exporting = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Patients_Enregistres.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Téléchargement lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => {
        this.exporting = false;
        this.snackBar.open('Erreur lors de l\'export : ' + (err.error?.message || err.message),
          'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
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
