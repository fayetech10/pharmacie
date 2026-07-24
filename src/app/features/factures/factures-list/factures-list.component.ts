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
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BreakpointObserver } from '@angular/cdk/layout';
import { ConfirmService } from '../../../core/services/confirm.service';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-factures-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatTableModule,
    MatPaginatorModule,
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
  dataSource!: MatTableDataSource<UnifiedFacture>;
  factures: UnifiedFacture[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
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

  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Non envoyée',
    ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée SR',
    REJETEE_SR: 'Rejetée SR',
    VALIDEE_NC: 'Validée NC',
    REJETEE_NC: 'Rejetée NC',
    PAYEE: 'Payée'
  };

  @Input() displayMode: 'PHARMACIE' | 'STRUCTURE' | 'ALL' = 'PHARMACIE';
  @Input() allowedStatuses?: string[];
  /** Restreint la liste à un seul prestataire (ciblage depuis le tableau de bord). */
  @Input() providerId?: string | null;
  @Input() showPaymentButton = false;
  /** Affiche l'en-tête (titre + boutons Excel/PDF/Import). Masqué quand la liste est intégrée dans un espace. */
  @Input() showToolbar = true;
  /** Active la vue mensuelle (Janvier → Décembre) comme dans la photo de référence. */
  @Input() monthlyView = false;

  /**
   * Chargement en cours : évite d'afficher « aucune facture » avant la réponse du
   * serveur (l'onglet resterait sinon vide sans explication).
   */
  loading = true;

  /** Année sélectionnée dans la vue mensuelle. */
  selectedYear = new Date().getFullYear();
  /** Années disponibles pour le sélecteur. */
  availableYears: number[] = [];

  /** Cache des groupes par prestataire (recalculé seulement à chaque chargement). */
  private _providerGroups: { providerId: string; providerNom: string; providerType: string; regime?: string; factures: UnifiedFacture[] }[] = [];

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
    if ((statutsChange && !statutsChange.firstChange)
        || (modeChange && !modeChange.firstChange)
        || (providerChange && !providerChange.firstChange)) {
      this.loadFactures();
    }
  }

  /** Cartes affichées sur mobile : toute la liste (pas de pagination).
   *  Sur desktop la pagination ne concerne que le tableau, pas cette vue. */
  get pagedFactures(): UnifiedFacture[] {
    const data = this.dataSource?.filteredData ?? [];
    if (this.isMobile) return data;
    if (!this.paginator) return data;
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    return data.slice(start, start + this.paginator.pageSize);
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

  statutLabel(s: string): string {
    return this.statutLabels[s] ?? s;
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

      this.dataSource = new MatTableDataSource(this.factures);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
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
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
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
  get providerGroups(): { providerId: string; providerNom: string; providerType: string; regime?: string; factures: UnifiedFacture[] }[] {
    return this._providerGroups;
  }

  /** Recalcule le cache des groupes par prestataire (appelé une seule fois par chargement). */
  private buildProviderGroups(): void {
    const groupsMap = new Map<string, { providerId: string; providerNom: string; providerType: string; regime?: string; factures: UnifiedFacture[] }>();
    this.factures.forEach(f => {
      const regimeSuffix = f.regime ? `_${f.regime}` : '';
      const key = (f.providerId || 'default') + regimeSuffix;
      let nom = f.providerNom || 'Prestataire';
      if (f.regime) {
        nom = `${nom} - Régime ${f.regime}`;
      }
      const type = f.providerType;
      
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { providerId: key, providerNom: nom, providerType: type, regime: f.regime, factures: [] });
      }
      groupsMap.get(key)!.factures.push(f);
    });
    this._providerGroups = Array.from(groupsMap.values()).sort((a, b) => a.providerNom.localeCompare(b.providerNom));
  }

  /** Retourne la facture pour un mois donné et un groupe de factures spécifique (ou null). */
  getFactureForMonthAndGroup(month: number, groupFactures: UnifiedFacture[]): UnifiedFacture | null {
    return groupFactures.find(f => f.mois === month && f.annee === this.selectedYear) || null;
  }
}

