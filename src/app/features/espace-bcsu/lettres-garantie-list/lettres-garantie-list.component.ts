import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SkeletonListComponent } from '../../../shared/skeleton-list/skeleton-list.component';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BcsuService } from '../../../core/services/bcsu.service';
import { LettreGarantie, REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: 'Brouillon',
  EMISE: 'Émise',
  ANNULEE: 'Annulée'
};

const STATUT_ICONS: Record<string, string> = {
  BROUILLON: 'edit_note',
  EMISE: 'verified',
  ANNULEE: 'cancel'
};

@Component({
  selector: 'app-lettres-garantie-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule, SkeletonListComponent],
  templateUrl: './lettres-garantie-list.component.html',
  styleUrls: ['./lettres-garantie-list.component.css']
})
export class LettresGarantieListComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;

  @Input() filterBcsuId: string | null = null;

  lettres: LettreGarantie[] = [];
  loading = true;
  searchNumero = '';
  searching = false;
  exporting = false;
  expandedIds = new Set<string>();

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  constructor(private bcsuService: BcsuService, private router: Router, private snackBar: MatSnackBar) {}

  get filteredLettres(): LettreGarantie[] {
    if (!this.filterBcsuId) return this.lettres;
    return this.lettres.filter(l => l.createdBy === this.filterBcsuId);
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    let params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    this.bcsuService.getLettresGarantie(params).subscribe({
      next: (res) => {
        this.lettres = res.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  openDetail(id: string) {
    this.router.navigate(['/dashboard/lettres-garantie', id]);
  }

  toggleExpand(id: string, event: Event) {
    event.stopPropagation();
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
    } else {
      this.expandedIds.add(id);
    }
  }

  isExpanded(id: string): boolean {
    return this.expandedIds.has(id);
  }

  statutLabel(statut: string): string {
    return STATUT_LABELS[statut] || statut;
  }

  statutIcon(statut: string): string {
    return STATUT_ICONS[statut] || 'info';
  }

  /** Export Excel de la liste filtrée (régime / mois / année). */
  exporterExcel() {
    this.exporting = true;
    const params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    this.bcsuService.exportLettresGarantieExcel(params).subscribe({
      next: (blob: Blob) => {
        this.exporting = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Patients_Enregistres.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Excel téléchargé', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.exporting = false;
        this.snackBar.open('Erreur lors de l\'export : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  rechercherParNumero() {
    if (!this.searchNumero.trim()) return;
    this.searching = true;
    this.bcsuService.searchLettreGarantieByNumero(this.searchNumero.trim()).subscribe({
      next: (lettre) => {
        this.searching = false;
        this.openDetail(lettre.id);
      },
      error: () => {
        this.searching = false;
        this.snackBar.open('Aucun dossier trouvé pour ce numéro', 'Fermer', { duration: 3000 });
      }
    });
  }
}
