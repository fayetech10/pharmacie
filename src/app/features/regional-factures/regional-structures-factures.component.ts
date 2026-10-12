import { Component, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { StructureService } from '../../core/services/structure.service';
import { FactureStructure, StructureSanitaire, typeEffectifStructure } from '../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../core/models/bcsu.model';
import { RegimeBadgeComponent } from '../../shared/regime-badge/regime-badge.component';
import { apparenceStatut } from '../../core/models/statuts';

import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';
import { AvancementPointageComponent } from '../../shared/avancement-pointage/avancement-pointage.component';
import { nombrePatients } from '../espace-poste/poste-facturation';
/** Ligne du niveau 1 : une structure sanitaire (EPS ou CS) avec ses volumes. */
interface StructureRow {
  structure: StructureSanitaire;
  type: string;
  postes: StructureSanitaire[];
  /** Factures de la structure ET de ses postes rattachés (filtres serveur appliqués). */
  factures: FactureStructure[];
  factureCount: number;
  totalSencsu: number;
  /** Factures envoyées au régional et sans décision — ce qui reste à traiter. */
  pending: number;
}

/** Poste de santé rattaché, avec ses volumes, pour la barre de second niveau. */
interface PosteRow {
  poste: StructureSanitaire;
  factures: FactureStructure[];
  totalSencsu: number;
  pending: number;
}

type FiltreStatutKey = 'TOUS' | 'A_TRAITER' | 'VALIDEES' | 'REJETEES' | 'PAYEES';
type TriKey = 'NOM' | 'MONTANT' | 'FACTURES' | 'A_TRAITER';


/**
 * Onglet régional « Factures structures sanitaires » : les structures (EPS et CS) sont
 * présentées en BARRE HORIZONTALE — recherche, filtre de statut, filtre de type et tri —
 * et une seule structure est ouverte à la fois en dessous.
 *
 * <p>Spécificité par rapport aux pharmacies : une structure porte des <b>postes de santé
 * rattachés</b>. Le détail sépare donc les factures de la structure elle-même de celles
 * de ses postes, et la vue « postes » ajoute une seconde barre horizontale pour cibler
 * un poste précis.</p>
 */
@Component({
  selector: 'app-regional-structures-factures',
  standalone: true,
  imports: [AvancementPointageComponent, PaginationComponent, PaginerPipe, RegimeBadgeComponent, CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatMenuModule, MatSnackBarModule],
  templateUrl: './regional-structures-factures.component.html'
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

  /** Niveau 1 : toutes les structures EPS / CS de la région ayant facturé. */
  rows: StructureRow[] = [];
  /** Niveau 1 après recherche / filtres / tri : ce qu'affiche la barre horizontale. */
  visibleRows: StructureRow[] = [];
  /** Niveau 2 : structure sélectionnée. */
  selected: StructureRow | null = null;
  /** Vue active du niveau 2 : factures de la structure elle-même ou de ses postes rattachés. */
  detailView: 'structure' | 'postes' = 'structure';
  /** Factures émises par la structure sanitaire elle-même (EPS / CS). */
  selectedStructureFactures: FactureStructure[] = [];
  /** Factures émises par les postes de santé rattachés à la structure. */
  selectedPostesFactures: FactureStructure[] = [];
  /** Postes rattachés ayant au moins une facture, pour la barre de second niveau. */
  posteRows: PosteRow[] = [];
  /** Poste ciblé dans la vue « postes » (null = tous les postes). */
  selectedPosteId: string | null = null;

  // ----- Recherche / filtres / tri de la barre horizontale -----
  search = '';
  filtreStatut: FiltreStatutKey = 'TOUS';
  filtreType: '' | 'EPS' | 'CS' = '';
  tri: TriKey = 'NOM';

  readonly filtresStatut: { key: FiltreStatutKey; label: string; statuts: string[] }[] = [
    { key: 'TOUS',      label: 'Toutes',    statuts: [] },
    { key: 'A_TRAITER', label: 'À traiter', statuts: ['ENVOYEE'] },
    { key: 'VALIDEES',  label: 'Validées',  statuts: ['VALIDEE_SR', 'VALIDEE_NC'] },
    { key: 'REJETEES',  label: 'Rejetées',  statuts: ['REJETEE_SR', 'REJETEE_NC', 'REJETEE_CS'] },
    { key: 'PAYEES',    label: 'Payées',    statuts: ['PAYEE'] }
  ];

  /** Nombre de structures par filtre (recherche et type appliqués) — affiché sur les puces. */
  filterCounts: Record<string, number> = {};

  /** Piste scrollable des structures (défilement par les flèches). */
  @ViewChild('structureTrack') structureTrack?: ElementRef<HTMLElement>;

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

  /**
   * Construit le niveau 1 : une ligne par EPS / CS, les postes agrégés sous leur structure.
   * Les structures sans aucune facture sont écartées — la barre ne sert qu'à naviguer
   * entre celles qui ont facturé.
   */
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
          factures: fs,
          factureCount: fs.length,
          totalSencsu: fs.reduce((sum, f) => sum + (f.montantTotalSencsu || 0), 0),
          pending: fs.filter(f => f.statut === 'ENVOYEE').length
        };
      })
      .filter(r => r.factureCount > 0);

    this.applyFilters();
  }

  // =============== Barre horizontale : recherche, filtres, tri ===============

  /** Recalcule la barre après une frappe, un changement de filtre ou de tri. */
  onFilterChange() {
    this.applyFilters();
  }

  /** Au moins un critère de recherche / filtre est actif. */
  get filtresActifs(): boolean {
    return this.search.trim().length > 0 || this.filtreStatut !== 'TOUS' || this.filtreType !== '' || this.tri !== 'NOM';
  }

  resetFilters() {
    this.search = '';
    this.filtreStatut = 'TOUS';
    this.filtreType = '';
    this.tri = 'NOM';
    this.applyFilters();
  }

  /**
   * Applique recherche, filtres et tri, puis garde la sélection cohérente : une structure
   * masquée par les filtres ne peut pas rester ouverte en dessous.
   */
  private applyFilters() {
    const term = this.sansAccent(this.search.trim());

    let list = this.rows;
    if (term) {
      // Le nom d'un poste rattaché suffit à faire remonter sa structure : c'est par là
      // qu'on cherche quand on ne sait plus à quel centre un poste est rattaché.
      list = list.filter(r =>
        this.sansAccent(r.structure.nom).includes(term)
        || this.sansAccent(r.structure.code || '').includes(term)
        || r.postes.some(p => this.sansAccent(p.nom).includes(term)));
    }
    if (this.filtreType) {
      list = list.filter(r => r.type === this.filtreType);
    }

    // Compteurs des puces : calculés avant le filtre de statut, pour que chaque puce
    // annonce ce qu'elle donnerait si on la cliquait.
    const base = list;
    this.filterCounts = {};
    for (const f of this.filtresStatut) {
      this.filterCounts[f.key] = f.statuts.length
        ? base.filter(r => this.statutCount(r, f.statuts) > 0).length
        : base.length;
    }

    const statuts = this.filtresStatut.find(f => f.key === this.filtreStatut)?.statuts ?? [];
    if (statuts.length) {
      list = list.filter(r => this.statutCount(r, statuts) > 0);
    }

    const parNom = (a: StructureRow, b: StructureRow) => a.structure.nom.localeCompare(b.structure.nom, 'fr');
    const trie = [...list];
    switch (this.tri) {
      case 'MONTANT':   trie.sort((a, b) => b.totalSencsu - a.totalSencsu || parNom(a, b)); break;
      case 'FACTURES':  trie.sort((a, b) => b.factureCount - a.factureCount || parNom(a, b)); break;
      case 'A_TRAITER': trie.sort((a, b) => b.pending - a.pending || parNom(a, b)); break;
      default:          trie.sort(parNom);
    }
    this.visibleRows = trie;

    // La sélection suit toujours ce qui est visible (et ne laisse jamais la zone vide).
    const encoreLa = this.selected
      ? trie.find(r => r.structure.id === this.selected!.structure.id) ?? null
      : null;
    this.selected = encoreLa ?? trie[0] ?? null;
    if (!encoreLa) {
      this.detailView = 'structure';
      this.selectedPosteId = null;
    }
    this.buildSelectedFactures();
    if (this.structureTrack) this.structureTrack.nativeElement.scrollLeft = 0;
  }

  /** Factures de la structure (postes inclus) dans l'un des statuts donnés. */
  statutCount(r: StructureRow, statuts: string[]): number {
    return r.factures.filter(f => statuts.includes(f.statut)).length;
  }

  /** Minuscules sans accents : « Médina » se retrouve en tapant « medina ». */
  private sansAccent(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Initiales de la pastille, en ignorant les mots trop courants pour distinguer. */
  initiales(nom: string): string {
    const mots = (nom || '')
      .split(/[\s'’\-_.]+/)
      .filter(m => m.length > 1 && !/^(centre|poste|hopital|hôpital|sante|santé|de|du|des|la|le|les|el|et)$/i.test(m));
    const source = mots.length ? mots : [nom || '?'];
    return source.slice(0, 2).map(m => m.charAt(0).toUpperCase()).join('') || '?';
  }

  /** Défilement de la barre horizontale par les flèches (desktop). */
  scrollStructures(direction: -1 | 1) {
    const el = this.structureTrack?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  }

  trackByRow(_: number, r: StructureRow): string {
    return r.structure.id;
  }

  // =============== Niveau 2 : structure ouverte et ses postes ===============

  select(row: StructureRow) {
    this.selected = row;
    this.detailView = 'structure';
    this.selectedPosteId = null;
    this.buildSelectedFactures();
  }

  /** Bascule le niveau 2 vers les factures de la structure ou de ses postes rattachés. */
  showView(view: 'structure' | 'postes') {
    if (view === 'postes' && !this.posteRows.length) return;
    this.detailView = view;
    if (view === 'structure') this.selectedPosteId = null;
  }

  /** Cible un poste de santé précis dans la vue « postes » (null = tous). */
  selectPoste(posteId: string | null) {
    this.selectedPosteId = posteId;
  }

  /** Liste affichée au niveau 2 selon l'onglet actif et le poste ciblé. */
  get detailFactures(): FactureStructure[] {
    if (this.detailView !== 'postes') return this.selectedStructureFactures;
    return this.selectedPosteId
      ? this.selectedPostesFactures.filter(f => f.structureSanitaireId === this.selectedPosteId)
      : this.selectedPostesFactures;
  }

  /** Nom du poste ciblé, pour le titre de la vue « postes ». */
  get selectedPosteNom(): string | null {
    return this.posteRows.find(p => p.poste.id === this.selectedPosteId)?.poste.nom ?? null;
  }

  /**
   * Sépare les factures du groupe : celles de la structure elle-même d'un côté,
   * celles de ses postes de santé rattachés de l'autre — les plus récentes d'abord —
   * et construit la barre des postes ayant facturé.
   */
  private buildSelectedFactures() {
    if (!this.selected) {
      this.selectedStructureFactures = [];
      this.selectedPostesFactures = [];
      this.posteRows = [];
      return;
    }
    const structureId = this.selected.structure.id;
    const posteIds = new Set(this.selected.postes.map(p => p.id));
    const parDate = (a: FactureStructure, b: FactureStructure) =>
      (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois);

    this.selectedStructureFactures = this.selected.factures
      .filter(f => f.structureSanitaireId === structureId)
      .sort(parDate);
    this.selectedPostesFactures = this.selected.factures
      .filter(f => posteIds.has(f.structureSanitaireId))
      .sort(parDate);

    // Un poste sans facture n'a rien à faire dans la barre : il n'ouvrirait qu'un tableau vide.
    this.posteRows = this.selected.postes
      .map(poste => {
        const fs = this.selectedPostesFactures.filter(f => f.structureSanitaireId === poste.id);
        return {
          poste,
          factures: fs,
          totalSencsu: fs.reduce((sum, f) => sum + (f.montantTotalSencsu || 0), 0),
          pending: fs.filter(f => f.statut === 'ENVOYEE').length
        };
      })
      .filter(p => p.factures.length > 0)
      .sort((a, b) => b.totalSencsu - a.totalSencsu || a.poste.nom.localeCompare(b.poste.nom, 'fr'));

    if (this.selectedPosteId && !this.posteRows.some(p => p.poste.id === this.selectedPosteId)) {
      this.selectedPosteId = null;
    }
    if (this.detailView === 'postes' && !this.posteRows.length) {
      this.detailView = 'structure';
    }
  }

  /** Montant total des factures de la structure elle-même. */
  get totalStructure(): number {
    return this.selectedStructureFactures.reduce((sum, f) => sum + (f.montantTotalSencsu || 0), 0);
  }

  /** Montant total des factures des postes rattachés. */
  get totalPostes(): number {
    return this.selectedPostesFactures.reduce((sum, f) => sum + (f.montantTotalSencsu || 0), 0);
  }

  typeLabel(type: string): string {
    return type === 'EPS' ? 'Hôpital (EPS)' : type === 'PS' ? 'Poste de santé' : 'Centre de santé';
  }

  statutLabel(s: string): string {
    return apparenceStatut(s).libelle;
  }

  /**
   * Patients distincts — un patient venu plusieurs fois (plusieurs lettres, plusieurs
   * dossiers) compte une fois, comme dans le détail et l'avancement du pointage.
   */
  patientsCount(f: FactureStructure): number {
    if (f.dossiers?.length) return nombrePatients(f);
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
