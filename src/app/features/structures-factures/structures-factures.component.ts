import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { StructureService } from '../../core/services/structure.service';
import { RegionService, Region } from '../../core/services/region.service';
import { FactureStructure } from '../../core/models/structure.model';
import { Regime, REGIME_LABELS } from '../../core/models/bcsu.model';

/** Agrégat d'une structure : toutes ses factures sur une seule ligne. */
interface StructureSummary {
  structureId: string;
  structureNom: string;
  regionId: string;
  regionNom: string;
  nbFactures: number;
  total: number;
}

interface MonthGroup {
  key: string;
  mois: number;
  annee: number;
  label: string;
  factures: FactureStructure[];
  total: number;
  currentPage?: number;
  pageSize?: number;
}

/** Un régime de la structure sélectionnée, avec ses factures groupées par mois. */
interface RegimeGroup {
  regime: Regime;
  regimeLabel: string;
  nbFactures: number;
  total: number;
  months: MonthGroup[];
}

/**
 * Factures des structures sanitaires (partie « gestion structure ») :
 *  - niveau 1 : une ligne par structure (ex. « Dixieme ») ;
 *  - clic → niveau 2 : les factures de cette structure séparées par régime, puis par mois ;
 *  - clic sur une facture → son détail.
 */
@Component({
  selector: 'app-structures-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatIconModule, MatSnackBarModule],
  templateUrl: './structures-factures.component.html',
  styleUrls: ['./structures-factures.component.css']
})
export class StructuresFacturesComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  private readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  factures: FactureStructure[] = [];
  private regionsById = new Map<string, string>();
  loading = true;

  level: 'structures' | 'factures' = 'structures';
  selected: StructureSummary | null = null;

  // Filtres (appliqués aux deux niveaux)
  filterYear = 0;
  filterStatut = '';
  readonly statuts = ['ENVOYEE', 'VALIDEE_SR', 'VALIDEE_NC', 'REJETEE_SR', 'REJETEE_NC', 'PAYEE'];
  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée CSUR', REJETEE_SR: 'Rejetée CSUR',
    VALIDEE_NC: 'Validée Centrale', REJETEE_NC: 'Rejetée Centrale', PAYEE: 'Payée'
  };

  constructor(
    private structureService: StructureService,
    private regionService: RegionService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.loading = true;
    forkJoin({
      factures: this.structureService.getFactures(),
      regions: this.regionService.getAll()
    }).subscribe({
      next: (res) => {
        this.factures = res.factures;
        res.regions.forEach((r: Region) => this.regionsById.set(r.id, r.nom));
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.snackBar.open('Erreur lors du chargement des factures des structures : ' + (err.error?.message || err.message),
          'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  get anneesDispo(): number[] {
    return Array.from(new Set(this.factures.map(f => f.annee))).sort((a, b) => b - a);
  }

  private get facturesFiltrees(): FactureStructure[] {
    return this.factures.filter(f =>
      (!this.filterYear || f.annee === this.filterYear) &&
      (!this.filterStatut || f.statut === this.filterStatut)
    );
  }

  // ===== Niveau 1 : une ligne par structure =====
  get structureSummaries(): StructureSummary[] {
    const map = new Map<string, StructureSummary>();
    for (const f of this.facturesFiltrees) {
      let s = map.get(f.structureSanitaireId);
      if (!s) {
        s = {
          structureId: f.structureSanitaireId,
          structureNom: f.structureNom,
          regionId: f.regionId,
          regionNom: this.regionName(f.regionId),
          nbFactures: 0,
          total: 0
        };
        map.set(f.structureSanitaireId, s);
      }
      s.nbFactures++;
      s.total += f.montantTotalSencsu || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.structureNom.localeCompare(b.structureNom));
  }

  get totalGlobal(): number {
    return this.facturesFiltrees.reduce((s, f) => s + (f.montantTotalSencsu || 0), 0);
  }

  selectStructure(s: StructureSummary) {
    this.selected = s;
    this.level = 'factures';
  }

  back() {
    this.level = 'structures';
    this.selected = null;
  }

  // ===== Niveau 2 : factures de la structure sélectionnée, par mois =====
  get selectedFactures(): FactureStructure[] {
    if (!this.selected) return [];
    return this.facturesFiltrees.filter(f => f.structureSanitaireId === this.selected!.structureId);
  }

  /** Factures de la structure séparées par régime (chacun avec ses mois). */
  get regimeGroups(): RegimeGroup[] {
    const byRegime = new Map<Regime, FactureStructure[]>();
    for (const f of this.selectedFactures) {
      const arr = byRegime.get(f.regime) || [];
      arr.push(f);
      byRegime.set(f.regime, arr);
    }
    const groups: RegimeGroup[] = [];
    byRegime.forEach((factures, regime) => {
      groups.push({
        regime,
        regimeLabel: this.regimeLabels[regime] || regime,
        nbFactures: factures.length,
        total: factures.reduce((s, f) => s + (f.montantTotalSencsu || 0), 0),
        months: this.groupByMonth(factures)
      });
    });
    return groups.sort((a, b) => a.regimeLabel.localeCompare(b.regimeLabel));
  }

  /** Regroupe un lot de factures par mois (année + mois), le plus récent d'abord. */
  private groupByMonth(factures: FactureStructure[]): MonthGroup[] {
    const map = new Map<string, MonthGroup>();
    for (const f of factures) {
      const key = `${f.annee}-${String(f.mois).padStart(2, '0')}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          mois: f.mois,
          annee: f.annee,
          label: `${this.moisNoms[f.mois] || f.mois} ${f.annee}`,
          factures: [],
          total: 0,
          currentPage: 1,
          pageSize: 10
        };
        map.set(key, group);
      }
      group.factures.push(f);
      group.total += f.montantTotalSencsu || 0;
    }
    const groups = Array.from(map.values());
    groups.forEach(g => g.factures.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    return groups.sort((a, b) => (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois));
  }

  get selectedTotal(): number {
    return this.selectedFactures.reduce((s, f) => s + (f.montantTotalSencsu || 0), 0);
  }

  regionName(regionId: string | undefined): string {
    return (regionId && this.regionsById.get(regionId)) || '—';
  }

  /** Nombre de bénéficiaires distincts d'une facture (identité portée par les lignes). */
  nbBeneficiaires(f: FactureStructure): number {
    const lignes = f.lignes || [];
    const ids = new Set(
      lignes
        .map(l => (l.patientMatricule || `${l.patientPrenom || ''} ${l.patientNom || ''}`).trim().toLowerCase())
        .filter(Boolean)
    );
    return ids.size || lignes.length;
  }

  statutLabel(s: string): string {
    return this.statutLabels[s] ?? s;
  }

  openDetail(f: FactureStructure) {
    this.router.navigate(['/dashboard/factures-structure', f.id]);
  }

  // --- Pagination pour MonthGroup ---
  getPaginatedFactures(g: MonthGroup): FactureStructure[] {
    const page = g.currentPage || 1;
    const size = g.pageSize || 10;
    const start = (page - 1) * size;
    return g.factures.slice(start, start + size);
  }

  getTotalPages(g: MonthGroup): number {
    const size = g.pageSize || 10;
    return Math.ceil(g.factures.length / size);
  }

  getPageNumbers(g: MonthGroup): number[] {
    const pages = [];
    for (let i = 1; i <= this.getTotalPages(g); i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(g: MonthGroup, page: number) {
    if (page >= 1 && page <= this.getTotalPages(g)) {
      g.currentPage = page;
    }
  }

  Math = Math;
}
