import { Component, OnInit, OnChanges, SimpleChanges, ViewChild, Input, ElementRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { SkeletonListComponent } from '../../../shared/skeleton-list/skeleton-list.component';
import { Router, RouterModule } from '@angular/router';
import { FactureService } from '../../../core/services/facture.service';
import { StructureService } from '../../../core/services/structure.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';
import { Facture, StatutFacture } from '../../../core/models/facture.model';
import { UnifiedFacture, mapToUnifiedFacture } from '../../../core/models/unified.model';
import { REGIME_OPTIONS, REGIME_LABELS } from '../../../core/models/bcsu.model';
import { forkJoin, of } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { apparenceStatut } from '../../../core/models/statuts';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ConfirmService } from '../../../core/services/confirm.service';
import { MatMenuModule } from '@angular/material/menu';

import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
/**
 * Groupe de la vue mensuelle : un prestataire (× régime) et ses factures.
 * {@code providerId} est la clé du groupe (id + régime), {@code nomPrestataire} le nom
 * seul — {@code providerNom} y ajoute le suffixe « - Régime X ».
 */
export type ProviderFilterKey = 'TOUS' | 'A_TRAITER' | 'VALIDEES' | 'REJETEES' | 'PAYEES';
export type ProviderSortKey = 'NOM' | 'MONTANT' | 'FACTURES' | 'A_TRAITER';

export interface ProviderGroup {
  providerId: string;
  providerNom: string;
  nomPrestataire: string;
  providerType: string;
  regime?: string;
  factures: UnifiedFacture[];
}

@Component({
  selector: 'app-factures-list',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, 
    CommonModule,
    RouterModule,
    MatTableModule,
    MatSortModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    StatusBadgeComponent,
    MatSnackBarModule,
    MatMenuModule
  ],
  templateUrl: './factures-list.component.html',
  styleUrls: ['./factures-list.component.css']
})
export class FacturesListComponent implements OnInit, OnChanges {
  displayedColumns: string[] = ['id', 'periode', 'montant', 'statut', 'date', 'actions'];
  dataSource: MatTableDataSource<UnifiedFacture> = new MatTableDataSource<UnifiedFacture>([]);
  factures: UnifiedFacture[] = [];

  private _sort!: MatSort;

  /** Pagination partagée ; le tri reste porté par la source de données. */
  @ViewChild('pg') pg?: PaginationComponent;

  @ViewChild(MatSort) set sort(matSort: MatSort) {
    this._sort = matSort;
    if (this.dataSource && matSort) {
      this.dataSource.sort = matSort;
    }
  }
  get sort(): MatSort {
    return this._sort;
  }

  @ViewChild('input') input!: ElementRef<HTMLInputElement>;

  filterStatut = '';
  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  readonly regimeOptions = REGIME_OPTIONS;
  readonly regimeLabels = REGIME_LABELS;
  statuts = Object.values(StatutFacture);
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027]; // Static list for server-side filtering
  isImporting = false;
  /** Facture ciblée par l'import par ligne (« importer la facture corrigée »). */
  pendingImportId: string | null = null;
  /** Mobile (≤768px) : vue cartes sans pagination → on affiche toutes les factures. */
  isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;


  @Input() displayMode: 'PHARMACIE' | 'STRUCTURE' | 'ALL' = 'PHARMACIE';
  @Input() allowedStatuses?: string[];
  /** Restreint la liste à un seul prestataire (ciblage depuis le tableau de bord). */
  @Input() providerId?: string | null;
  @Input() showPaymentButton = false;
  /** Affiche l'en-tête (titre + boutons Excel/PDF/Import). Masqué quand la liste est intégrée dans un espace. */
  @Input() showToolbar = true;
  /** Active la vue mensuelle (Janvier → Décembre) comme dans la photo de référence. */
  @Input() monthlyView = false;
  /** Filtre région (Espace Central) : ne garde que les factures de cette région. */
  @Input() regionId?: string | null;
  /**
   * Restreint la liste à un ensemble de prestataires (ex. structures d'un district).
   * Un tableau vide masque tout ; {@code null}/absent = aucun filtre. Le wrapper
   * (Espace Central) résout district → ids de structures, la liste reste générique.
   */
  @Input() providerIds?: string[] | null;

  /**
   * Chargement en cours : évite d'afficher « aucune facture » avant la réponse du
   * serveur (l'onglet resterait sinon vide sans explication).
   */
  loading = true;

  /** Année sélectionnée dans la vue mensuelle. */
  selectedYear = new Date().getFullYear();
  /** Années disponibles pour le sélecteur. */
  availableYears: number[] = [];

  /** Mois sélectionné pour le défilement automatique (0 = aucun). */
  selectedMonthToScroll = 0;

  scrollToMonth() {
    if (!this.selectedMonthToScroll) return;
    const id = this.isMobile ? `month-card-${this.selectedMonthToScroll}` : `month-row-${this.selectedMonthToScroll}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Remettre à 0 pour permettre un nouveau clic sur le même mois plus tard
    setTimeout(() => this.selectedMonthToScroll = 0, 500);
  }

  /** Cache des groupes par prestataire (recalculé seulement à chaque chargement). */
  private _providerGroups: ProviderGroup[] = [];

  /**
   * Vue mensuelle multi-prestataires : clé du prestataire ouvert. La liste des
   * prestataires est présentée en barre horizontale et un seul bloc mensuel est
   * affiché à la fois — empiler les 12 mois de chaque pharmacie devient illisible
   * dès qu'une région en compte beaucoup.
   */
  selectedProviderKey: string | null = null;

  /** Recherche par nom dans la barre des prestataires (accents ignorés). */
  providerSearch = '';

  /** Filtre de statut de la barre des prestataires. */
  providerFilter: ProviderFilterKey = 'TOUS';

  /** Critère de tri de la barre des prestataires. */
  providerSort: ProviderSortKey = 'NOM';

  /** Filtres de statut proposés au-dessus de la barre des prestataires. */
  readonly providerFilters: { key: ProviderFilterKey; label: string; statuts: string[] }[] = [
    { key: 'TOUS',      label: 'Toutes',    statuts: [] },
    { key: 'A_TRAITER', label: 'À traiter', statuts: ['ENVOYEE'] },
    { key: 'VALIDEES',  label: 'Validées',  statuts: ['VALIDEE_SR', 'VALIDEE_NC'] },
    { key: 'REJETEES',  label: 'Rejetées',  statuts: ['REJETEE_SR', 'REJETEE_NC'] },
    { key: 'PAYEES',    label: 'Payées',    statuts: ['PAYEE'] }
  ];

  /** Nombre de prestataires par filtre (recherche appliquée) — affiché sur les puces. */
  filterCounts: Record<string, number> = {};

  /** Résultat de la recherche + du filtre + du tri : ce qu'affiche la barre. */
  private _visibleGroups: ProviderGroup[] = [];

  /** Prestataires ayant au moins une facture sur l'année affichée (avant recherche). */
  private _yearGroups: ProviderGroup[] = [];

  /** Piste scrollable de la barre horizontale (défilement par les flèches). */
  @ViewChild('providerTrack') providerTrack?: ElementRef<HTMLElement>;

  /** Nom des mois. */
  readonly monthNames = [
    '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  /** Date du jour pour le surlignage du mois courant. */
  readonly today = new Date();
  readonly currentMonth = this.today.getMonth() + 1;
  readonly currentYear = this.today.getFullYear();

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private structureService: StructureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    private router: Router,
    private breakpoints: BreakpointObserver
  ) {
    if (!this.authService.isPharmacien()) {
      this.displayedColumns = ['id', 'pharmacie', 'periode', 'montant', 'statut', 'date', 'actions'];
    }
  }

  private destroyRef = inject(DestroyRef);
  private factureEvents = inject(FactureEventsService);

  ngOnInit() {
    this.breakpoints.observe('(max-width: 768px)')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => this.isMobile = state.matches);
    this.loadFactures();
    // Rafraîchit la liste sans recharger la page après toute modification de facture
    // (ex. enregistrement dans l'onglet « Facturation » de l'espace pharmacie).
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadFactures());
  }

  /** Recharge quand le filtre de statut ou le mode d'affichage change (sous-onglets régionaux). */
  ngOnChanges(changes: SimpleChanges) {
    const statutsChange = changes['allowedStatuses'];
    const modeChange = changes['displayMode'];
    const providerChange = changes['providerId'];
    const regionChange = changes['regionId'];
    const providerIdsChange = changes['providerIds'];
    if ((statutsChange && !statutsChange.firstChange)
        || (modeChange && !modeChange.firstChange)
        || (providerChange && !providerChange.firstChange)
        || (regionChange && !regionChange.firstChange)
        || (providerIdsChange && !providerIdsChange.firstChange)) {
      this.loadFactures();
    }
  }

  // ----- Synthèse (basée sur les factures filtrées affichées) -----
  get summaryCount(): number {
    return this.dataSource?.filteredData?.length ?? 0;
  }
  get summaryMontant(): number {
    return (this.dataSource?.filteredData ?? []).reduce((sum, f) => sum + f.montantTotal, 0);
  }
  get summaryCsu(): number {
    return Math.round(this.summaryMontant / 2);
  }

  openFacture(f: UnifiedFacture) {
    if (f.providerType === 'PHARMACIE') {
      this.router.navigate(['/dashboard/factures', f.id]);
    } else {
      this.router.navigate(['/dashboard/factures-structure', f.id]);
    }
  }

  /** Libellé commun à tout le projet (core/models/statuts). */
  statutLabel(s: string): string {
    return apparenceStatut(s).libelle;
  }

  loadFactures() {
    this.loading = true;
    let obs$ = of({ pharmacies: [], structures: [] } as any);
    let params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    if (this.displayMode === 'PHARMACIE') {
      obs$ = forkJoin({ pharmacies: this.factureService.getAll(params), structures: of([]) });
    } else if (this.displayMode === 'STRUCTURE') {
      obs$ = forkJoin({ pharmacies: of([]), structures: this.structureService.getFactures(params) });
    } else {
      obs$ = forkJoin({ pharmacies: this.factureService.getAll(params), structures: this.structureService.getFactures(params) });
    }

    obs$.subscribe({
      next: ({ pharmacies, structures }: any) => {
      let unified: UnifiedFacture[] = [
        ...pharmacies.map((f: any) => mapToUnifiedFacture(f, 'PHARMACIE')),
        ...structures.map((f: any) => mapToUnifiedFacture(f, 'STRUCTURE'))
      ];

      // Filter by authorized statuses if specified
      if (this.allowedStatuses && this.allowedStatuses.length > 0) {
        unified = unified.filter(f => this.allowedStatuses!.includes(f.statut.toString()));
      }
      // Ciblage d'un prestataire (arrivée depuis le classement du tableau de bord).
      if (this.providerId) {
        unified = unified.filter(f => f.providerId === this.providerId);
      }
      // Filtre région (Espace Central) : regionId porté par la facture d'origine.
      if (this.regionId) {
        unified = unified.filter(f => {
          const r = f.providerType === 'PHARMACIE'
            ? f.originalFacturePharmacie?.regionId
            : f.originalFactureStructure?.regionId;
          return r === this.regionId;
        });
      }
      // Restriction à un ensemble de prestataires (ex. structures d'un district).
      if (this.providerIds) {
        const ids = new Set(this.providerIds);
        unified = unified.filter(f => ids.has(f.providerId));
      }
      this.factures = unified;

      // Vue mensuelle : calculer les années disponibles
      if (this.monthlyView) {
        const yearsSet = new Set(this.factures.map(f => f.annee));
        yearsSet.add(new Date().getFullYear());
        this.availableYears = Array.from(yearsSet).sort((a, b) => b - a);
        if (!this.availableYears.includes(this.selectedYear)) {
          this.selectedYear = this.availableYears[0] || new Date().getFullYear();
        }
      }

      this.dataSource.data = this.factures;
      if (this.sort) this.dataSource.sort = this.sort;
      this.dataSource.filterPredicate = this.customFilterPredicate();

      // Recalculer le cache des groupes (vue mensuelle)
      this.buildProviderGroups();
      this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  /**
   * Message affiché quand l'onglet ne contient aucune facture : adapté aux statuts
   * qu'il présente, pour ne jamais laisser une zone vide sans explication.
   */
  get emptyStateMessage(): string {
    const statuts = this.allowedStatuses ?? [];
    if (statuts.length === 1) {
      switch (statuts[0]) {
        case 'VALIDEE_SR': return 'Aucune facture reçue pour le moment';
        case 'VALIDEE_NC': return 'Aucune facture validée pour le moment';
        case 'PAYEE':      return 'Aucune facture payée pour le moment';
        case 'REJETEE_NC':
        case 'REJETEE_SR': return 'Aucune facture rejetée pour le moment';
        case 'ENVOYEE':    return 'Aucune facture envoyée pour le moment';
        case 'BROUILLON':  return 'Aucune facture en brouillon';
      }
    }
    if (statuts.length > 1) {
      return 'Aucune facture ne correspond à cet onglet pour le moment';
    }
    return 'Aucune facture enregistrée pour le moment';
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    this.pg?.aller(0);
  }

  onYearChange() {
    this.filterAnnee = this.selectedYear;
    this.loadFactures();
  }

  applyAdvancedFilter() {
    // When advanced filters change (Mois, Annee, Regime), trigger backend refresh
    this.loadFactures();
  }

  customFilterPredicate() {
    return (data: UnifiedFacture, filter: string) => {
      let matchSearch = true;
      let matchStatut = true;

      if (this.input?.nativeElement?.value) {
        const term = this.input.nativeElement.value.toLowerCase();
        matchSearch = data.id.toLowerCase().includes(term) ||
          (data.providerNom ? data.providerNom.toLowerCase().includes(term) : false);
      }

      if (this.filterStatut) {
        matchStatut = data.statut === this.filterStatut;
      }

      return matchSearch && matchStatut;
    };
  }

  exportExcel() {
    this.factureService.exportExcel().subscribe((blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factures_csu_${new Date().getTime()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  exportPdf() {
    this.factureService.exportPdf().subscribe((blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factures_csu_${new Date().getTime()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }

  exportSingleExcel(f: UnifiedFacture) {
    const obs$ = f.providerType === 'PHARMACIE' 
      ? this.factureService.exportFactureExcel(f.id)
      : this.structureService.exportFactureExcel(f.id);

    obs$.subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(f.mois)}_${f.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Excel réussi', 'Fermer', { duration: 3000 });
      },
      error: (err: any) => {
        this.snackBar.open('Erreur lors de l\'export: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  exportSingleWord(f: UnifiedFacture) {
    if (f.providerType !== 'STRUCTURE') return;
    this.structureService.exportFactureWord(f.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(f.mois)}_${f.annee}.docx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Word réussi', 'Fermer', { duration: 3000 });
      },
      error: (err: any) => {
        this.snackBar.open('Erreur lors de l\'export: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.isImporting = true;
      this.snackBar.open('Importation en cours...', '', { duration: 0 });
      this.factureService.importExcel(file).subscribe({
        next: () => {
          this.snackBar.open('Import réussi ! Les factures ont été mises à jour.', 'Fermer', { duration: 3000 });
          this.loadFactures();
          this.isImporting = false;
          event.target.value = '';
        },
        error: (err: any) => {
          let errorMsg = 'Erreur lors de l\'importation.';
          if (err.error && err.error.message) {
            errorMsg = err.error.message;
          } else if (err.error && err.error.cause) {
            errorMsg = err.error.cause;
          } else if (err.status === 403) {
            errorMsg = 'Accès refusé. Vous n\'avez pas les droits pour effectuer cette action.';
          } else if (err.status === 0) {
            errorMsg = 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
          }
          this.snackBar.open(errorMsg, 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
          this.isImporting = false;
          event.target.value = '';
        }
      });
    }
  }

  /** Le rôle courant peut-il réimporter une facture corrigée (SR / SC, hors payée) ? */
  canImportCorrige(f: UnifiedFacture): boolean {
    return (this.authService.isServiceRegional() || this.authService.isServiceCentral())
      && f.statut !== 'PAYEE';
  }

  /** Mémorise la facture ciblée puis ouvre le sélecteur de fichier partagé. */
  triggerSingleImport(id: string, fileInput: HTMLInputElement) {
    this.pendingImportId = id;
    fileInput.value = '';
    fileInput.click();
  }

  onSingleFileSelected(event: any) {
    const file: File = event.target.files[0];
    const id = this.pendingImportId;
    if (!file || !id) {
      event.target.value = '';
      return;
    }
    this.isImporting = true;
    this.snackBar.open('Importation de la facture corrigée…', '', { duration: 0 });
    this.factureService.importFactureExcel(id, file).subscribe({
      next: () => {
        this.snackBar.open('Facture corrigée importée avec succès.', 'Fermer', { duration: 3000 });
        this.loadFactures();
        this.isImporting = false;
        this.pendingImportId = null;
        event.target.value = '';
      },
      error: (err: any) => {
        let errorMsg = 'Erreur lors de l\'importation.';
        if (err.error && err.error.message) {
          errorMsg = err.error.message;
        } else if (err.error && err.error.cause) {
          errorMsg = err.error.cause;
        } else if (err.status === 403) {
          errorMsg = 'Accès refusé. Vous n\'avez pas les droits pour effectuer cette action.';
        } else if (err.status === 0) {
          errorMsg = 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
        }
        this.snackBar.open(errorMsg, 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
        this.isImporting = false;
        this.pendingImportId = null;
        event.target.value = '';
      }
    });
  }

  deleteFacture(id: string) {
    this.confirm.ask({
      title: 'Supprimer la facture',
      message: 'Êtes-vous sûr de vouloir supprimer cette facture brouillon ? Cette action est irréversible.',
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.delete(id).subscribe({
        next: () => {
          this.snackBar.open('Facture supprimée', 'Fermer', { duration: 3000 });
          this.loadFactures();
        },
        error: () => {
          this.snackBar.open('Erreur lors de la suppression', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  payerFacture(id: string) {
    this.confirm.ask({
      title: 'Payer la facture',
      message: 'Confirmez-vous le paiement de cette facture ?',
      confirmText: 'Payer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.payer(id).subscribe({
        next: () => {
          this.snackBar.open('Facture payée avec succès', 'Fermer', { duration: 3000 });
          this.loadFactures();
        },
        error: (err: any) => {
          this.snackBar.open('Erreur lors du paiement: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  /** Service Régional : retransmet une facture rejetée par le central (REJETEE_NC) au niveau central. */
  renvoyerAuCentral(id: string) {
    this.confirm.ask({
      title: 'Renvoyer au central',
      message: 'Confirmez-vous le renvoi de cette facture au niveau central pour réexamen ?',
      confirmText: 'Renvoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.renvoyerAuCentral(id).subscribe({
        next: () => {
          this.snackBar.open('Facture renvoyée au central avec succès', 'Fermer', { duration: 3000 });
          this.loadFactures();
        },
        error: (err: any) => {
          this.snackBar.open('Erreur lors du renvoi: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  getMonthName(mois: number): string {
    return this.monthNames[mois] || '';
  }

  // ===== VUE MENSUELLE =====

  /** Retourne la facture pour un mois donné dans l'année sélectionnée (ou null). */
  getFactureForMonth(month: number): UnifiedFacture | null {
    return this.factures.find(f => f.mois === month && f.annee === this.selectedYear) || null;
  }

  countPatients(f: UnifiedFacture): number {
    if (f.providerType === 'PHARMACIE') {
      const orig = f.originalFacturePharmacie;
      if (!orig || !orig.lignes || orig.lignes.length === 0) return 0;
      const ids = new Set(
        orig.lignes
          .map(l => (l.patientMatricule || l.patientNomPrenom || '').trim().toLowerCase())
          .filter(Boolean)
      );
      return ids.size;
    } else {
      const orig = f.originalFactureStructure;
      if (!orig || !orig.lignes || orig.lignes.length === 0) return 0;
      const ids = new Set(
        orig.lignes
          .map(l => (l.lettreGarantieNumero || `${l.patientPrenom}-${l.patientNom}`).trim().toLowerCase())
          .filter(Boolean)
      );
      return ids.size;
    }
  }

  /** Génère l'identifiant de facture affiché. */
  getFactureLabel(f: UnifiedFacture): string {
    const mm = String(f.mois).padStart(2, '0');
    return f.providerType === 'PHARMACIE' 
      ? `FACT-PHARMA-${f.annee}-${mm}`
      : `FACT-STRUCT-${f.annee}-${mm}`;
  }

  /** Date d'envoi (première action ENVOYEE dans l'historique). */
  getDateEnvoi(f: UnifiedFacture): string | null {
    if (f.providerType === 'PHARMACIE') {
      if (!f.originalFacturePharmacie?.historique) return null;
      const envoi = f.originalFacturePharmacie.historique.find(h => h.statut === StatutFacture.ENVOYEE);
      return envoi ? envoi.date : null;
    } else {
      return f.date ?? null;
    }
  }

  /** Export PDF d'une facture individuelle. */
  exportSinglePdf(f: UnifiedFacture) {
    const obs$ = f.providerType === 'PHARMACIE' 
      ? this.factureService.exportFacturePdf(f.id)
      : this.structureService.exportFacturePdf(f.id);

    obs$.subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(f.mois)}_${f.annee}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export PDF réussi', 'Fermer', { duration: 3000 });
      },
      error: (err: any) => {
        this.snackBar.open('Erreur lors de l\'export PDF: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Le statut affiché sous forme de label pour le badge de la vue mensuelle. */
  getStatutDateLabel(f: UnifiedFacture): string {
    const dateEnvoi = this.getDateEnvoi(f);
    if (f.statut === 'ENVOYEE' && dateEnvoi) {
      return `Envoyé le ${dateEnvoi.substring(0, 10)}`;
    }
    return this.statutLabel(f.statut);
  }

  /** Envoyer une facture (depuis la vue mensuelle). */
  envoyerFacture(f: UnifiedFacture) {
    if (f.providerType !== 'PHARMACIE') return; // Only pharmacies have 'envoyer' from here currently
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.',
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.envoyer(f.id).subscribe({
        next: () => {
          this.snackBar.open('Facture envoyée avec succès', 'OK', { duration: 3000 });
          this.loadFactures();
        },
        error: (err: any) => {
          this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  /** Regroupe les factures chargées par prestataire pour la vue mensuelle. */
  get providerGroups(): ProviderGroup[] {
    return this._providerGroups;
  }

  /** Recalcule le cache des groupes par prestataire (appelé une seule fois par chargement). */
  private buildProviderGroups(): void {
    const groupsMap = new Map<string, ProviderGroup>();
    this.factures.forEach(f => {
      const regimeSuffix = f.regime ? `_${f.regime}` : '';
      const key = (f.providerId || 'default') + regimeSuffix;
      const nomPrestataire = f.providerNom || 'Prestataire';
      const nom = f.regime ? `${nomPrestataire} - Régime ${f.regime}` : nomPrestataire;
      const type = f.providerType;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { providerId: key, providerNom: nom, nomPrestataire, providerType: type, regime: f.regime, factures: [] });
      }
      groupsMap.get(key)!.factures.push(f);
    });
    this._providerGroups = Array.from(groupsMap.values()).sort((a, b) => a.providerNom.localeCompare(b.providerNom, 'fr'));
    this.applyProviderFilters();
  }

  /** Prestataires affichés dans la barre horizontale (recherche + filtre + tri). */
  get visibleProviderGroups(): ProviderGroup[] {
    return this._visibleGroups;
  }

  /** Nombre de prestataires ayant facturé sur l'année affichée (dénominateur de l'en-tête). */
  get yearProviderCount(): number {
    return this._yearGroups.length;
  }

  /** Au moins un critère de recherche / filtre est actif. */
  get providerFiltersActifs(): boolean {
    return this.providerSearch.trim().length > 0 || this.providerFilter !== 'TOUS' || this.providerSort !== 'NOM';
  }

  /** Recalcule la barre après une frappe, un changement de filtre ou de tri. */
  onProviderFilterChange(): void {
    this.applyProviderFilters();
  }

  /** Remet la barre à zéro (recherche vidée, tous les statuts, tri par nom). */
  resetProviderFilters(): void {
    this.providerSearch = '';
    this.providerFilter = 'TOUS';
    this.providerSort = 'NOM';
    this.applyProviderFilters();
  }

  /**
   * Applique recherche, filtre de statut et tri, puis garde la sélection cohérente :
   * un prestataire masqué par les filtres ne peut pas rester ouvert en dessous, la
   * barre bascule alors sur le premier résultat.
   */
  private applyProviderFilters(): void {
    const term = this.sansAccent(this.providerSearch.trim());

    // La grille ne montre que l'année sélectionnée : un prestataire sans facture cette
    // année-là n'a rien à faire dans la barre (il afficherait « 0 facture »).
    this._yearGroups = this._providerGroups.filter(g => this.groupCount(g) > 0);

    let list = term
      ? this._yearGroups.filter(g => this.sansAccent(g.providerNom).includes(term))
      : this._yearGroups;

    // Compteurs des puces : calculés sur le résultat de la recherche, avant le filtre
    // de statut — chaque puce annonce ainsi ce qu'elle donnerait si on la cliquait.
    const base = list;
    this.filterCounts = {};
    for (const f of this.providerFilters) {
      this.filterCounts[f.key] = f.statuts.length
        ? base.filter(g => this.groupStatutCount(g, f.statuts) > 0).length
        : base.length;
    }

    const statuts = this.providerFilters.find(f => f.key === this.providerFilter)?.statuts ?? [];
    if (statuts.length) {
      list = list.filter(g => this.groupStatutCount(g, statuts) > 0);
    }

    const parNom = (a: ProviderGroup, b: ProviderGroup) => a.providerNom.localeCompare(b.providerNom, 'fr');
    const trie = [...list];
    switch (this.providerSort) {
      case 'MONTANT':   trie.sort((a, b) => this.groupTotal(b) - this.groupTotal(a) || parNom(a, b)); break;
      case 'FACTURES':  trie.sort((a, b) => this.groupCount(b) - this.groupCount(a) || parNom(a, b)); break;
      case 'A_TRAITER': trie.sort((a, b) => this.groupPending(b) - this.groupPending(a) || parNom(a, b)); break;
      default:          trie.sort(parNom);
    }
    this._visibleGroups = trie;

    // La sélection suit toujours ce qui est visible (et ne laisse jamais la zone vide).
    if (!trie.some(g => g.providerId === this.selectedProviderKey)) {
      this.selectedProviderKey = trie[0]?.providerId ?? null;
    }
    if (this.providerTrack) this.providerTrack.nativeElement.scrollLeft = 0;
  }

  /** Minuscules sans accents : « Médina » se retrouve en tapant « medina ». */
  private sansAccent(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  trackByProvider(_: number, g: ProviderGroup): string {
    return g.providerId;
  }

  /** Groupe dont les 12 mois sont affichés sous la barre horizontale. */
  get selectedGroup(): ProviderGroup | null {
    return this._providerGroups.find(g => g.providerId === this.selectedProviderKey) ?? null;
  }

  selectProvider(key: string): void {
    this.selectedProviderKey = key;
  }

  /** Défilement de la barre horizontale par les flèches (desktop). */
  scrollProviders(direction: -1 | 1): void {
    const el = this.providerTrack?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  }

  /** Factures du groupe pour l'année affichée (la grille ne montre que celle-ci). */
  private groupYearFactures(g: ProviderGroup): UnifiedFacture[] {
    return g.factures.filter(f => f.annee === this.selectedYear);
  }

  /** Nombre de factures du prestataire sur l'année affichée. */
  groupCount(g: ProviderGroup): number {
    return this.groupYearFactures(g).length;
  }

  /** Montant total facturé par le prestataire sur l'année affichée. */
  groupTotal(g: ProviderGroup): number {
    return this.groupYearFactures(g).reduce((sum, f) => sum + (f.montantTotal || 0), 0);
  }

  /** Factures encore à traiter (envoyées, sans décision) sur l'année affichée. */
  groupPending(g: ProviderGroup): number {
    return this.groupYearFactures(g).filter(f => f.statut === 'ENVOYEE').length;
  }

  /** Factures du prestataire dans l'un des statuts donnés, sur l'année affichée. */
  groupStatutCount(g: ProviderGroup, statuts: string[]): number {
    return this.groupYearFactures(g).filter(f => statuts.includes(f.statut)).length;
  }

  /**
   * Initiales affichées dans la pastille de la vignette. Le mot « pharmacie », présent
   * dans presque tous les noms, est ignoré : sans ça toutes les pastilles afficheraient
   * la même lettre.
   */
  groupInitials(g: ProviderGroup): string {
    const mots = g.nomPrestataire
      .split(/[\s'’\-_.]+/)
      .filter(m => m.length > 1 && !/^(pharmacie|pharmacies|pharma|centre|poste|de|du|des|la|le|les)$/i.test(m));
    const source = mots.length ? mots : [g.nomPrestataire];
    return source.slice(0, 2).map(m => m.charAt(0).toUpperCase()).join('') || '?';
  }

  readonly moisAnnee = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /**
   * Facture d'un mois : celle du pharmacien connecté, ou celle du prestataire ouvert. Une facture
   * vide (ni patient ni montant) compte comme absente : « Aucune facture » plutôt que « 0 patient · 0 F ».
   */
  factureDuMois(month: number, groupFactures: UnifiedFacture[] | null): UnifiedFacture | null {
    const f = groupFactures ? this.getFactureForMonthAndGroup(month, groupFactures) : this.getFactureForMonth(month);
    return f && (this.countPatients(f) > 0 || f.montantTotal) ? f : null;
  }

  /** Retourne la facture pour un mois donné et un groupe de factures spécifique (ou null). */
  getFactureForMonthAndGroup(month: number, groupFactures: UnifiedFacture[]): UnifiedFacture | null {
    return groupFactures.find(f => f.mois === month && f.annee === this.selectedYear) || null;
  }
}

