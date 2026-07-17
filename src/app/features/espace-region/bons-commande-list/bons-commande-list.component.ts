import { Component, OnInit, ViewChild, ElementRef, DestroyRef, inject, Input } from '@angular/core';
import { SkeletonListComponent } from '../../../shared/skeleton-list/skeleton-list.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BcsuService } from '../../../core/services/bcsu.service';
import { BonCommande, REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';

/**
 * Liste (lecture seule) des bons de commande émis par les agents BCSU,
 * utilisée dans l'Espace Régional pour la supervision.
 */
@Component({
  selector: 'app-bons-commande-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSnackBarModule, SkeletonListComponent],
  templateUrl: './bons-commande-list.component.html',
  styleUrls: ['./bons-commande-list.component.css']
})
export class BonsCommandeListComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;

  @Input() filterBcsuId: string | null = null;

  bons: BonCommande[] = [];
  loading = true;
  searchNumero = '';
  searching = false;

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  constructor(private bcsuService: BcsuService, private snackBar: MatSnackBar) {}

  get filteredBons(): BonCommande[] {
    if (!this.filterBcsuId) return this.bons;
    return this.bons.filter(b => b.createdBy === this.filterBcsuId);
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

    this.bcsuService.getBonsCommande(params).subscribe({
      next: (res) => {
        // Recalcul des montants CSU pour les anciens bons (s'ils sont à 0)
        res.forEach(bc => {
          if (!bc.montantTotalSencsu && bc.prestations) {
            let mSen = 0;
            const taux = bc.regime === 'CONTRIBUTIF' ? 0.8 : 1.0;
            bc.prestations.forEach(p => {
              let partCsu = p.montantSencsu;
              if (!partCsu && p.montant) partCsu = p.montant * taux;
              mSen += (partCsu || 0);
            });
            bc.montantTotalSencsu = mSen;
          }
        });

        this.bons = res.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  rechercherParNumero() {
    if (!this.searchNumero.trim()) return;
    this.searching = true;
    this.bcsuService.searchBonCommandeByNumero(this.searchNumero.trim()).subscribe({
      next: (bon) => {
        this.searching = false;
        this.bons = [bon];
      },
      error: () => {
        this.searching = false;
        this.snackBar.open('Aucun bon de commande trouvé pour ce numéro', 'Fermer', { duration: 3000 });
      }
    });
  }

  effacerRecherche() {
    this.searchNumero = '';
    this.load();
  }

  imprimer(bon: BonCommande) {
    this.bcsuService.exportBonCommandePdf(bon.id).subscribe(blob => {
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 10000);
    });
  }
}

