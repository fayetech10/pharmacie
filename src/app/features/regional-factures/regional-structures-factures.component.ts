import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { StructureService } from '../../core/services/structure.service';
import { FactureStructure, StructureSanitaire, typeEffectifStructure } from '../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../core/models/bcsu.model';

/** Ligne du niveau 1 : une structure sanitaire (EPS ou CS) avec ses volumes. */
interface StructureRow {
  structure: StructureSanitaire;
  type: string;
  postes: StructureSanitaire[];
  factureCount: number;
  totalSencsu: number;
}

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
  VALIDEE_SR: 'Validée SR', REJETEE_SR: 'Rejetée SR',
  VALIDEE_NC: 'Validée NC', REJETEE_NC: 'Rejetée NC', PAYEE: 'Payée'
};

/**
 * Onglet régional « Factures structures sanitaires » : les factures sont présentées
 * PAR STRUCTURE (EPS et CS). Un clic sur un centre de santé ouvre ses factures ET
 * celles des postes de santé qui lui sont rattachés, avec filtres régime / mois / année.
 */
@Component({
  selector: 'app-regional-structures-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './regional-structures-factures.component.html',
  styleUrls: ['./regional-structures-factures.component.css']
})
export class RegionalStructuresFacturesComponent implements OnInit, OnChanges {
  /** Statuts autorisés (filtre de l'onglet : Reçues/Validées/Rejetées/Payées). */
  @Input() allowedStatuses?: string[];

  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  private factures: FactureStructure[] = [];
  private structures: StructureSanitaire[] = [];

  /** Niveau 1 : structures EPS / CS de la région. */
  rows: StructureRow[] = [];
  /** Niveau 2 : structure sélectionnée. */
  selected: StructureRow | null = null;
  /** Vue active du niveau 2 : factures de la structure elle-même ou de ses postes rattachés. */
  detailView: 'structure' | 'postes' = 'structure';
  /** Factures émises par la structure sanitaire elle-même (EPS / CS). */
  selectedStructureFactures: FactureStructure[] = [];
  /** Factures émises par les postes de santé rattachés à la structure. */
  selectedPostesFactures: FactureStructure[] = [];

  loading = true;
  exporting: string | null = null;

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  constructor(
    private structureService: StructureService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['allowedStatuses'] && !changes['allowedStatuses'].firstChange) {
      this.rebuild();
    }
  }

  load() {
    this.loading = true;
    const params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    forkJoin({
      structures: this.structureService.getStructures(),
      factures: this.structureService.getFactures(params)
    }).subscribe({
      next: ({ structures, factures }) => {
        this.structures = structures;
        this.factures = factures;
        this.rebuild();
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur lors du chargement : ' + (err.error?.message || err.message),
          'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  private get facturesFiltrees(): FactureStructure[] {
    const allowed = this.allowedStatuses;
    return allowed && allowed.length
      ? this.factures.filter(f => allowed.includes(f.statut))
      : this.factures;
  }

  /** Construit le niveau 1 : une ligne par EPS / CS, les postes agrégés sous leur structure. */
  private rebuild() {
    const filtered = this.facturesFiltrees;
    const postesParParent = new Map<string, StructureSanitaire[]>();
    for (const s of this.structures) {
      if (typeEffectifStructure(s) === 'PS' && s.structureRattachementId) {
        const list = postesParParent.get(s.structureRattachementId) || [];
        list.push(s);
        postesParParent.set(s.structureRattachementId, list);
      }
    }

    this.rows = this.structures
      .filter(s => typeEffectifStructure(s) !== 'PS')
      .map(structure => {
        const postes = postesParParent.get(structure.id) || [];
        const ids = new Set<string>([structure.id, ...postes.map(p => p.id)]);
        const fs = filtered.filter(f => ids.has(f.structureSanitaireId));
        return {
          structure,
          type: typeEffectifStructure(structure),
          postes,
          factureCount: fs.length,
          totalSencsu: fs.reduce((sum, f) => sum + (f.montantTotalSencsu || 0), 0)
        };
      })
      .sort((a, b) => b.totalSencsu - a.totalSencsu || a.structure.nom.localeCompare(b.structure.nom));

    // Rafraîchit le niveau 2 si une structure est ouverte.
    if (this.selected) {
      const again = this.rows.find(r => r.structure.id === this.selected!.structure.id);
      this.selected = again || null;
      if (this.selected) this.buildSelectedFactures();
    }
  }

  select(row: StructureRow) {
    this.selected = row;
    this.detailView = 'structure';
    this.buildSelectedFactures();
  }

  back() {
    this.selected = null;
    this.detailView = 'structure';
    this.selectedStructureFactures = [];
    this.selectedPostesFactures = [];
  }

  /** Bascule le niveau 2 vers les factures de la structure ou de ses postes rattachés. */
  showView(view: 'structure' | 'postes') {
    if (view === 'postes' && !this.selected?.postes.length) return;
    this.detailView = view;
  }

  /** Liste affichée au niveau 2 selon l'onglet actif. */
  get detailFactures(): FactureStructure[] {
    return this.detailView === 'postes' ? this.selectedPostesFactures : this.selectedStructureFactures;
  }

  /**
   * Sépare les factures du groupe : celles de la structure elle-même d'un côté,
   * celles de ses postes de santé rattachés de l'autre — les plus récentes d'abord.
   */
  private buildSelectedFactures() {
    if (!this.selected) {
      this.selectedStructureFactures = [];
      this.selectedPostesFactures = [];
      return;
    }
    const structureId = this.selected.structure.id;
    const posteIds = new Set(this.selected.postes.map(p => p.id));
    const parDate = (a: FactureStructure, b: FactureStructure) =>
      (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois);

    this.selectedStructureFactures = this.facturesFiltrees
      .filter(f => f.structureSanitaireId === structureId)
      .sort(parDate);
    this.selectedPostesFactures = this.facturesFiltrees
      .filter(f => posteIds.has(f.structureSanitaireId))
      .sort(parDate);
  }

  typeLabel(type: string): string {
    return type === 'EPS' ? 'Hôpital (EPS)' : type === 'PS' ? 'Poste de santé' : 'Centre de santé';
  }

  statutLabel(s: string): string {
    return STATUT_LABELS[s] ?? s;
  }

  patientsCount(f: FactureStructure): number {
    const ids = new Set((f.lignes || []).map(l => l.patientId || l.lettreGarantieNumero || `${l.patientPrenom}|${l.patientNom}`));
    return ids.size;
  }

  openDetail(f: FactureStructure) {
    this.router.navigate(['/dashboard/factures-structure', f.id]);
  }

  exporterExcel(f: FactureStructure, event: Event) {
    event.stopPropagation();
    this.exporting = f.id;
    this.structureService.exportGroupeExcel(f.structureSanitaireId, f.regime, f.mois, f.annee).subscribe({
      next: (blob: Blob) => { this.exporting = null; this.downloadBlob(blob, `Facture_${f.structureNom}_${f.regime}_${f.mois}_${f.annee}.xlsx`); },
      error: (err) => { this.exporting = null; this.snackBar.open('Erreur export : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
    });
  }

  exporterPdf(f: FactureStructure, event: Event) {
    event.stopPropagation();
    this.exporting = f.id;
    this.structureService.exportGroupePdf(f.structureSanitaireId, f.regime, f.mois, f.annee).subscribe({
      next: (blob: Blob) => { this.exporting = null; this.downloadBlob(blob, `Facture_${f.structureNom}_${f.regime}_${f.mois}_${f.annee}.pdf`); },
      error: (err) => { this.exporting = null; this.snackBar.open('Erreur export : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
    });
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
