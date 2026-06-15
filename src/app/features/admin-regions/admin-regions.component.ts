import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { RegionService, Region } from '../../core/services/region.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { FactureService } from '../../core/services/facture.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { StatsComponent, StatsScope } from '../stats/stats.component';

interface RegionSummary {
  region: Region;
  pharmacyCount: number;
  factureCount: number;
  totalMontant: number;
}

interface PharmacieSummary {
  pharmacie: Pharmacie;
  factures: Facture[];
  factureCount: number;
  totalMontant: number;
}

type DrillLevel = 'regions' | 'pharmacies' | 'factures';

@Component({
  selector: 'app-admin-regions',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatSnackBarModule,
    StatusBadgeComponent,
    StatsComponent
  ],
  templateUrl: './admin-regions.component.html',
  styleUrls: ['./admin-regions.component.css']
})
export class AdminRegionsComponent implements OnInit {
  regions: Region[] = [];
  pharmacies: Pharmacie[] = [];
  factures: Facture[] = [];

  // Niveau de navigation courant
  level: DrillLevel = 'regions';

  // Niveau 1
  regionSummaries: RegionSummary[] = [];
  regionColumns = ['region', 'pharmacies', 'factures', 'montant', 'action'];

  // Niveau 2
  selectedRegion: RegionSummary | null = null;
  pharmacieSummaries: PharmacieSummary[] = [];
  pharmacieColumns = ['pharmacie', 'factures', 'montant', 'action'];

  // Niveau 3
  selectedPharmacie: PharmacieSummary | null = null;
  factureColumns = ['mois', 'montant', 'statut', 'action'];

  // Périmètres pour les tableaux de bord scopés (drill-down)
  regionScope: StatsScope | null = null;
  pharmacieScope: StatsScope | null = null;

  // Filtres niveau 3 (factures d'une pharmacie)
  filterYear = 0;
  filterStatut = '';
  statuts = Object.values(StatutFacture);
  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée SR', REJETEE_SR: 'Rejetée SR',
    VALIDEE_NC: 'Validée NC', REJETEE_NC: 'Rejetée NC', PAYEE: 'Payée'
  };

  constructor(
    private regionService: RegionService,
    private pharmacieService: PharmacieService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    forkJoin({
      regions: this.regionService.getAll(),
      pharmacies: this.pharmacieService.getAll(),
      factures: this.factureService.getAll()
    }).subscribe(({ regions, pharmacies, factures }) => {
      this.regions = regions;
      this.pharmacies = pharmacies;
      this.factures = factures;
      this.buildRegionSummaries();
    });
  }

  buildRegionSummaries() {
    this.regionSummaries = this.regions.map(region => {
      const regionPharmacies = this.pharmacies.filter(p => p.regionId === region.id);
      const pharmacyIds = regionPharmacies.map(p => p.id);
      const regionFactures = this.factures.filter(f => f.pharmacieId && pharmacyIds.includes(f.pharmacieId));
      return {
        region,
        pharmacyCount: regionPharmacies.length,
        factureCount: regionFactures.length,
        totalMontant: regionFactures.reduce((sum, f) => sum + f.montantTotal, 0)
      };
    });
    this.regionSummaries.sort((a, b) => a.region.nom.localeCompare(b.region.nom));
  }

  // Niveau 1 → 2
  selectRegion(summary: RegionSummary) {
    this.selectedRegion = summary;
    this.regionScope = { type: 'region', id: summary.region.id, label: summary.region.nom };

    const regionPharmacies = this.pharmacies.filter(p => p.regionId === summary.region.id);
    this.pharmacieSummaries = regionPharmacies.map(pharmacie => {
      const phFactures = this.factures
        .filter(f => f.pharmacieId === pharmacie.id)
        .sort((a, b) => (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois));
      return {
        pharmacie,
        factures: phFactures,
        factureCount: phFactures.length,
        totalMontant: phFactures.reduce((sum, f) => sum + f.montantTotal, 0)
      };
    });
    this.pharmacieSummaries.sort((a, b) => a.pharmacie.nom.localeCompare(b.pharmacie.nom));

    this.level = 'pharmacies';
  }

  /** Années présentes dans les factures de la pharmacie sélectionnée (tri décroissant). */
  get anneesDispo(): number[] {
    const fs = this.selectedPharmacie?.factures ?? [];
    return Array.from(new Set(fs.map(f => f.annee))).sort((a, b) => b - a);
  }

  /** Factures de la pharmacie sélectionnée filtrées par année + statut. */
  get displayedFactures(): Facture[] {
    let fs = this.selectedPharmacie?.factures ?? [];
    if (this.filterYear) fs = fs.filter(f => f.annee === this.filterYear);
    if (this.filterStatut) fs = fs.filter(f => f.statut === this.filterStatut);
    return fs;
  }

  statutLabel(s: string): string {
    return this.statutLabels[s] ?? s;
  }

  exportFacture(f: Facture) {
    this.factureService.exportFactureExcel(f.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(f.mois)}_${f.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Téléchargement lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  // Niveau 2 → 3
  selectPharmacie(ps: PharmacieSummary) {
    this.selectedPharmacie = ps;
    this.pharmacieScope = { type: 'pharmacie', id: ps.pharmacie.id, label: ps.pharmacie.nom };
    this.filterYear = 0;
    this.filterStatut = '';
    this.level = 'factures';
  }

  // Navigation arrière / fil d'Ariane
  goBack() {
    if (this.level === 'factures') {
      this.level = 'pharmacies';
      this.selectedPharmacie = null;
      this.pharmacieScope = null;
    } else if (this.level === 'pharmacies') {
      this.goToRegions();
    }
  }

  goToRegions() {
    this.level = 'regions';
    this.selectedRegion = null;
    this.selectedPharmacie = null;
    this.regionScope = null;
    this.pharmacieScope = null;
    this.pharmacieSummaries = [];
  }

  goToPharmacies() {
    if (!this.selectedRegion) return;
    this.level = 'pharmacies';
    this.selectedPharmacie = null;
    this.pharmacieScope = null;
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }
}
