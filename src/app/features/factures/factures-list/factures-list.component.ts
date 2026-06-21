import { Component, OnInit, ViewChild, Input, ElementRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FactureService } from '../../../core/services/facture.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';
import { Facture, StatutFacture } from '../../../core/models/facture.model';
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
    MatSnackBarModule
  ],
  templateUrl: './factures-list.component.html',
  styleUrls: ['./factures-list.component.css']
})
export class FacturesListComponent implements OnInit {
  displayedColumns: string[] = ['id', 'periode', 'montant', 'statut', 'date', 'actions'];
  dataSource!: MatTableDataSource<Facture>;
  factures: Facture[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('input') input!: ElementRef<HTMLInputElement>;

  filterStatut = '';
  filterMois = 0;
  filterAnnee = 0;
  statuts = Object.values(StatutFacture);
  anneesDispo: number[] = [];
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

  @Input() allowedStatuses?: string[];
  @Input() showPaymentButton = false;
  /** Affiche l'en-tête (titre + boutons Excel/PDF/Import). Masqué quand la liste est intégrée dans un espace. */
  @Input() showToolbar = true;
  /** Active la vue mensuelle (Janvier → Décembre) comme dans la photo de référence. */
  @Input() monthlyView = false;

  /** Année sélectionnée dans la vue mensuelle. */
  selectedYear = new Date().getFullYear();
  /** Années disponibles pour le sélecteur. */
  availableYears: number[] = [];

  /** Cache des groupes par pharmacie (recalculé seulement à chaque chargement). */
  private _pharmacyGroups: { pharmacieId: string; pharmacieNom: string; factures: Facture[] }[] = [];

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

  /** Cartes affichées sur mobile : toute la liste (pas de pagination).
   *  Sur desktop la pagination ne concerne que le tableau, pas cette vue. */
  get pagedFactures(): Facture[] {
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

  openFacture(id: string) {
    this.router.navigate(['/dashboard/factures', id]);
  }

  statutLabel(s: string): string {
    return this.statutLabels[s] ?? s;
  }

  loadFactures() {
    this.factureService.getAll().subscribe((data: Facture[]) => {
      // Filtrer par statuts autorisés si spécifié
      if (this.allowedStatuses && this.allowedStatuses.length > 0) {
        this.factures = data.filter(f => this.allowedStatuses!.includes(f.statut.toString()));
      } else {
        this.factures = data;
      }

      // Années présentes dans les données (tri décroissant) pour le filtre
      this.anneesDispo = Array.from(new Set(this.factures.map(f => f.annee))).sort((a, b) => b - a);

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

      // Recalculer le cache des groupes (vue mensuelle multi-pharmacies)
      this.buildPharmacyGroups();
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  applyAdvancedFilter() {
    this.dataSource.filter = Math.random().toString();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  customFilterPredicate() {
    return (data: Facture, filter: string) => {
      let matchSearch = true;
      let matchStatut = true;
      let matchMois = true;
      let matchAnnee = true;

      if (this.input?.nativeElement?.value) {
        const term = this.input.nativeElement.value.toLowerCase();
        matchSearch = data.id.toLowerCase().includes(term) ||
          (data.pharmacieNom ? data.pharmacieNom.toLowerCase().includes(term) : false);
      }

      if (this.filterStatut) {
        matchStatut = data.statut === this.filterStatut;
      }

      if (this.filterMois > 0) {
        matchMois = data.mois === this.filterMois;
      }

      if (this.filterAnnee > 0) {
        matchAnnee = data.annee === this.filterAnnee;
      }

      return matchSearch && matchStatut && matchMois && matchAnnee;
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

  exportSingleExcel(id: string, mois: number, annee: number) {
    this.factureService.exportFactureExcel(id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(mois)}_${annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Excel réussi', 'Fermer', { duration: 3000 });
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
  canImportCorrige(f: Facture): boolean {
    return (this.authService.isServiceRegional() || this.authService.isServiceCentral())
      && f.statut !== StatutFacture.PAYEE;
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
  getFactureForMonth(month: number): Facture | null {
    return this.factures.find(f => f.mois === month && f.annee === this.selectedYear) || null;
  }

  /** Nombre de patients distincts dans une facture. */
  countPatients(f: Facture): number {
    if (!f.lignes || f.lignes.length === 0) return 0;
    const ids = new Set(
      f.lignes
        .map(l => (l.patientMatricule || l.patientNomPrenom || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return ids.size;
  }

  /** Génère l'identifiant de facture affiché (FACT-PHARMA-YYYY-MM). */
  getFactureLabel(f: Facture): string {
    const mm = String(f.mois).padStart(2, '0');
    return `FACT-PHARMA-${f.annee}-${mm}`;
  }

  /** Date d'envoi (première action ENVOYEE dans l'historique). */
  getDateEnvoi(f: Facture): string | null {
    if (!f.historique) return null;
    const envoi = f.historique.find(h => h.statut === StatutFacture.ENVOYEE);
    return envoi ? envoi.date : null;
  }

  /** Export PDF d'une facture individuelle. */
  exportSinglePdf(id: string, mois: number, annee: number) {
    this.factureService.exportFacturePdf(id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(mois)}_${annee}.pdf`;
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
  getStatutDateLabel(f: Facture): string {
    const dateEnvoi = this.getDateEnvoi(f);
    if (f.statut === StatutFacture.ENVOYEE && dateEnvoi) {
      return `Envoyé le ${dateEnvoi.substring(0, 10)}`;
    }
    return this.statutLabel(f.statut);
  }

  /** Envoyer une facture (depuis la vue mensuelle). */
  envoyerFacture(f: Facture) {
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

  /** Regroupe les factures chargées par pharmacie pour la vue mensuelle multi-pharmacies. */
  get pharmacyGroups(): { pharmacieId: string; pharmacieNom: string; factures: Facture[] }[] {
    return this._pharmacyGroups;
  }

  /** Recalcule le cache des groupes par pharmacie (appelé une seule fois par chargement). */
  private buildPharmacyGroups(): void {
    const groupsMap = new Map<string, { pharmacieId: string; pharmacieNom: string; factures: Facture[] }>();
    this.factures.forEach(f => {
      const key = f.pharmacieId || 'default';
      const nom = f.pharmacieNom || 'Pharmacie';
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { pharmacieId: key, pharmacieNom: nom, factures: [] });
      }
      groupsMap.get(key)!.factures.push(f);
    });
    this._pharmacyGroups = Array.from(groupsMap.values()).sort((a, b) => a.pharmacieNom.localeCompare(b.pharmacieNom));
  }

  /** Retourne la facture pour un mois donné et un groupe de factures spécifique (ou null). */
  getFactureForMonthAndGroup(month: number, groupFactures: Facture[]): Facture | null {
    return groupFactures.find(f => f.mois === month && f.annee === this.selectedYear) || null;
  }
}
