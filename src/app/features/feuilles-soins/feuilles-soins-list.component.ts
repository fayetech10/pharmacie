import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FeuilleSoinsService } from '../../core/services/feuille-soins.service';
import { AuthService } from '../../core/services/auth.service';
import { FeuilleSoins, StatutFeuilleSoins, STATUT_FEUILLE_LABELS } from '../../core/models/feuille-soins.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../core/models/bcsu.model';

@Component({
  selector: 'app-feuilles-soins-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, MatCardModule,
    MatButtonModule, MatIconModule, MatInputModule, MatSnackBarModule
  ],
  templateUrl: './feuilles-soins-list.component.html',
  styleUrls: ['./feuilles-soins-list.component.css']
})
export class FeuillesSoinsListComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  readonly statutLabels = STATUT_FEUILLE_LABELS;

  feuilles: FeuilleSoins[] = [];
  loading = true;
  searchQuery = '';

  searchNumero = '';
  searchingNumero = false;

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  constructor(
    private feuilleService: FeuilleSoinsService,
    private router: Router,
    private snackBar: MatSnackBar,
    public authService: AuthService
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    let params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    this.feuilleService.getAll(params).subscribe({
      next: (res) => {
        // Les plus récentes en premier.
        this.feuilles = res.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        this.loading = false;
      },
      error: () => {
        this.snackBar.open('Erreur lors du chargement des feuilles de soins', 'Fermer', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  get canDelivrer(): boolean {
    return this.authService.isBcsu() || this.authService.isAdmin();
  }

  get isStructure(): boolean {
    return this.authService.isStructureSanitaire();
  }

  get filtered(): FeuilleSoins[] {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.feuilles;
    return this.feuilles.filter(f =>
      f.numero.toLowerCase().includes(q) ||
      f.patientNom.toLowerCase().includes(q) ||
      f.patientPrenom.toLowerCase().includes(q) ||
      (f.codeAssure || '').toLowerCase().includes(q) ||
      (f.lettreGarantieNumero || '').toLowerCase().includes(q)
    );
  }

  /** Structure : recherche par numéro de la feuille remise par le patient. */
  rechercherParNumero() {
    const numero = this.searchNumero.trim();
    if (!numero) return;
    this.searchingNumero = true;
    this.feuilleService.searchByNumero(numero).subscribe({
      next: (feuille) => {
        this.searchingNumero = false;
        this.router.navigate(['/dashboard/feuilles-soins', feuille.id]);
      },
      error: (err) => {
        this.searchingNumero = false;
        this.snackBar.open(err.error?.message || 'Aucune feuille de soins pour ce numéro', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Tonalité sémantique du badge de statut (classe CSS scoped). */
  statutTone(statut: StatutFeuilleSoins): string {
    switch (statut) {
      case StatutFeuilleSoins.FACTUREE: return 'success';
      case StatutFeuilleSoins.DEPOSEE_STRUCTURE: return 'warn';
      case StatutFeuilleSoins.ANNULEE: return 'danger';
      case StatutFeuilleSoins.EMISE: return 'info';
      default: return 'neutral';
    }
  }

  open(id: string) {
    this.router.navigate(['/dashboard/feuilles-soins', id]);
  }
}
