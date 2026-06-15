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

import { AuthService } from '../../core/services/auth.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { FactureService } from '../../core/services/facture.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { StatsComponent, StatsScope } from '../stats/stats.component';

interface PharmacieSummary {
  pharmacie: Pharmacie;
  factures: Facture[];
  factureCount: number;
  totalMontant: number;
}

type DrillLevel = 'pharmacies' | 'factures';

@Component({
  selector: 'app-regional-factures',
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
  templateUrl: './regional-factures.component.html',
  styleUrls: ['./regional-factures.component.css']
})
export class RegionalFacturesComponent implements OnInit {
  pharmacies: Pharmacie[] = [];
  factures: Facture[] = [];

  // Niveau de navigation courant
  level: DrillLevel = 'pharmacies';

  // Niveau 1
  pharmacieSummaries: PharmacieSummary[] = [];
  pharmacieColumns = ['pharmacie', 'factures', 'montant', 'action'];
  totalRegionMontant = 0;

  // Niveau 2
  selectedPharmacie: PharmacieSummary | null = null;
  factureColumns = ['mois', 'montant', 'statut', 'action'];
  /** Périmètre pour le tableau de bord de la pharmacie en drill-down. */
  pharmacieScope: StatsScope | null = null;

  // Filtres niveau 2 (factures d'une pharmacie)
  filterYear = 0;
  filterStatut = '';
  statuts = Object.values(StatutFacture);
  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée SR', REJETEE_SR: 'Rejetée SR',
    VALIDEE_NC: 'Validée NC', REJETEE_NC: 'Rejetée NC', PAYEE: 'Payée'
  };

  constructor(
    private authService: AuthService,
    private pharmacieService: PharmacieService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    forkJoin({
      pharmacies: this.pharmacieService.getAll(),
      factures: this.factureService.getAll()
    }).subscribe(({ pharmacies, factures }) => {
      // Pour le service régional, l'API devrait déjà filtrer par région, mais par sécurité on garde toutes celles reçues
      this.pharmacies = pharmacies;
      this.factures = factures;
      this.buildPharmacieSummaries();
    });
  }

  buildPharmacieSummaries() {
    this.pharmacieSummaries = this.pharmacies.map(pharmacie => {
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
    this.totalRegionMontant = this.pharmacieSummaries.reduce((sum, p) => sum + p.totalMontant, 0);
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

  // Niveau 1 → 2
  selectPharmacie(ps: PharmacieSummary) {
    this.selectedPharmacie = ps;
    this.pharmacieScope = { type: 'pharmacie', id: ps.pharmacie.id, label: ps.pharmacie.nom };
    this.filterYear = 0;
    this.filterStatut = '';
    this.level = 'factures';
  }

  // Navigation arrière
  goBack() {
    if (this.level === 'factures') {
      this.goToPharmacies();
    }
  }

  goToPharmacies() {
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
