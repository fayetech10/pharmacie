import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FactureService } from '../../core/services/facture.service';
import { FactureEventsService } from '../../core/services/facture-events.service';
import { StatsService } from '../../core/services/stats.service';
import { AuthService } from '../../core/services/auth.service';
import { MedicamentService } from '../../core/services/medicament.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { Medicament, StatutMedicament } from '../../core/models/medicament.model';
import { MonthData } from '../../core/models/stats.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { ConfirmService } from '../../core/services/confirm.service';
import { compressImageToDataUrl } from '../../core/utils/image-compression';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { BreakpointObserver } from '@angular/cdk/layout';

type PhotoKey = 'ticketCaisse' | 'bonCommande' | 'ordonnance';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatTooltipModule,
    StatusBadgeComponent,
    BaseChartDirective
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  currentUser: any;
  totalFactures = 0;
  montantTotal = 0;
  facturesAttente = 0;
  facturesRejetees = 0;

  // For other roles
  recentFactures: Facture[] = [];
  displayedColumns: string[] = ['pharmacie', 'montant', 'statut', 'actions'];

  // Saisie rapide
  patientForm!: FormGroup;
  medicamentForm!: FormGroup;
  patientLignes: any[] = [];
  currentFacture: Facture | null = null;
  isSubmitting = false;
  /** Affichage mobile : enregistrement en 2 étapes (wizard). */
  isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  /** Étape du wizard mobile : 0 = médicaments, 1 = patient + dossier. */
  wizardStep: 0 | 1 = 0;
  suggestions: Medicament[] = [];
  // Info d'exclusion affichée quand un médicament exclu est saisi/sélectionné
  excludedInfo: { nom: string; motif?: string; description?: string } | null = null;

  // Dossier patient : pièces justificatives (data URL base64)
  readonly photoFields: { key: PhotoKey; label: string }[] = [
    { key: 'ticketCaisse', label: 'Ticket de caisse' },
    { key: 'bonCommande', label: 'Bon de commande' },
    { key: 'ordonnance', label: 'Ordonnance' }
  ];
  photos: Record<PhotoKey, string | null> = { ticketCaisse: null, bonCommande: null, ordonnance: null };
  viewerImage: string | null = null;

  // === Statistiques dérivées (rôles superviseurs) ===
  montantCsu = 0;
  montantMoyen = 0;
  facturesValidees = 0;
  tauxValidation = 0;
  montantTrend: number | null = null;   // % d'évolution du dernier mois vs précédent
  countTrend: number | null = null;
  chartYear = new Date().getFullYear();

  topPharmacies: { nom: string; montant: number; count: number; pct: number }[] = [];
  statusBreakdown: { statut: string; label: string; count: number; color: string }[] = [];
  hasStatusData = false;

  /** Libellés + couleurs des statuts (alignés sur les badges de statut). */
  private readonly statusMeta: Record<string, { label: string; color: string }> = {
    BROUILLON:  { label: 'Non envoyée', color: '#64748B' },
    ENVOYEE:    { label: 'Envoyée',     color: '#2563EB' },
    VALIDEE_SR: { label: 'Validée SR',  color: '#059669' },
    VALIDEE_NC: { label: 'Validée NC',  color: '#047857' },
    PAYEE:      { label: 'Payée',       color: '#A16207' },
    REJETEE_SR: { label: 'Rejetée SR',  color: '#EA580C' },
    REJETEE_NC: { label: 'Rejetée NC',  color: '#DC2626' }
  };
  private readonly statusOrder = ['ENVOYEE', 'VALIDEE_SR', 'VALIDEE_NC', 'PAYEE', 'REJETEE_SR', 'REJETEE_NC', 'BROUILLON'];

  // === Graphique en barres (évolution mensuelle) ===
  chartMode: 'montant' | 'nombre' = 'montant';
  private evolutionData: MonthData[] = [];

  public barChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 10,
        callbacks: {
          label: (ctx: any) => this.chartMode === 'montant'
            ? `  ${Number(ctx.parsed.y).toLocaleString('fr-FR')} CFA`
            : `  ${ctx.parsed.y} facture(s)`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#F1F5F9' },
        ticks: { callback: (v: any) => this.chartMode === 'montant' ? this.shortNum(+v) : v }
      },
      x: { grid: { display: false } }
    }
  };
  public barChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  public isChartReady = false;

  // === Graphique doughnut (répartition par statut) ===
  public doughnutData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  public doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 10,
        callbacks: {
          label: (ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((s, n) => s + n, 0) || 1;
            const pct = Math.round((ctx.parsed / total) * 100);
            return `  ${ctx.label} : ${ctx.parsed} (${pct}%)`;
          }
        }
      }
    }
  };

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private statsService: StatsService,
    private medicamentService: MedicamentService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private router: Router,
    private confirm: ConfirmService,
    private breakpoints: BreakpointObserver
  ) {
    this.currentUser = this.authService.getCurrentUser();

    this.patientForm = this.fb.group({
      patientNomPrenom: ['', Validators.required],
      patientMatricule: ['', Validators.required]
    });

    this.medicamentForm = this.fb.group({
      medicament: ['', Validators.required],
      codeProduit: ['', Validators.required],
      quantite: [1, [Validators.required, Validators.min(1)]],
      prixUnitaire: [0, [Validators.required, Validators.min(0)]]
    });
  }

  private destroyRef = inject(DestroyRef);
  private factureEvents = inject(FactureEventsService);

  ngOnInit() {
    // Wizard mobile : suit le point de rupture (≤768px). Sur desktop, tout est visible.
    this.breakpoints.observe('(max-width: 768px)').subscribe(state => {
      this.isMobile = state.matches;
      if (!this.isMobile) this.wizardStep = 0;
    });
    this.loadData();
    this.loadCurrentFacture();
    if (!this.authService.isPharmacien()) {
      this.loadChart();
    } else {
      // Précharge le cache des médicaments pour une autocomplétion instantanée dès la 1ʳᵉ frappe
      this.medicamentService.getAllCached().subscribe();
    }
    // Rafraîchit le tableau de bord sans recharger la page après toute modification de facture.
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadData();
        this.loadCurrentFacture();
        if (!this.authService.isPharmacien()) this.loadChart();
      });
  }

  loadData() {
    this.factureService.getAll().subscribe((factures: Facture[]) => {
      this.totalFactures = factures.length;
      this.montantTotal = factures.reduce((sum: number, f: Facture) => sum + f.montantTotal, 0);
      this.facturesAttente = factures.filter((f: Facture) => f.statut === StatutFacture.ENVOYEE).length;
      this.facturesRejetees = factures.filter((f: Facture) => f.statut === StatutFacture.REJETEE_SR || f.statut === StatutFacture.REJETEE_NC).length;

      if (this.authService.isPharmacien()) return;

      // --- Statistiques dérivées (superviseurs) ---
      this.montantCsu = Math.round(this.montantTotal / 2);
      this.montantMoyen = this.totalFactures ? Math.round(this.montantTotal / this.totalFactures) : 0;
      this.facturesValidees = factures.filter(f =>
        f.statut === StatutFacture.VALIDEE_SR || f.statut === StatutFacture.VALIDEE_NC || f.statut === StatutFacture.PAYEE
      ).length;
      const traitees = factures.filter(f => f.statut !== StatutFacture.BROUILLON).length;
      this.tauxValidation = traitees ? Math.round((this.facturesValidees / traitees) * 100) : 0;

      // Répartition par statut (pour le doughnut + la légende)
      const counts: Record<string, number> = {};
      for (const f of factures) counts[f.statut] = (counts[f.statut] || 0) + 1;
      this.statusBreakdown = this.statusOrder
        .filter(s => counts[s])
        .map(s => ({ statut: s, label: this.statusMeta[s].label, count: counts[s], color: this.statusMeta[s].color }));
      this.hasStatusData = this.statusBreakdown.length > 0;
      this.doughnutData = {
        labels: this.statusBreakdown.map(s => s.label),
        datasets: [{
          data: this.statusBreakdown.map(s => s.count),
          backgroundColor: this.statusBreakdown.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      };

      // Top pharmacies (par montant total)
      const byPh: Record<string, { montant: number; count: number }> = {};
      for (const f of factures) {
        const key = f.pharmacieNom || '—';
        byPh[key] = byPh[key] || { montant: 0, count: 0 };
        byPh[key].montant += f.montantTotal;
        byPh[key].count++;
      }
      const ranked = Object.entries(byPh)
        .map(([nom, v]) => ({ nom, montant: v.montant, count: v.count }))
        .sort((a, b) => b.montant - a.montant);
      const max = ranked.length ? ranked[0].montant : 0;
      this.topPharmacies = ranked.slice(0, 5).map(p => ({ ...p, pct: max ? Math.round((p.montant / max) * 100) : 0 }));

      this.recentFactures = [...factures]
        .sort((a: Facture, b: Facture) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
    });
  }

  loadCurrentFacture() {
    this.factureService.getCurrent().subscribe(res => {
      this.currentFacture = res;
    });
  }

  loadChart() {
    this.chartYear = new Date().getFullYear();
    const obs$ = this.authService.isServiceCentral()
      ? this.statsService.getEvolutionMensuelle(this.chartYear)
      : this.statsService.getEvolutionMensuelle(this.chartYear, this.currentUser?.regionId);

    obs$.subscribe((data: MonthData[]) => {
      this.evolutionData = data || [];
      this.computeTrends();
      this.buildBarChart();
      this.isChartReady = true;
    });
  }

  /** Bascule l'axe du graphique entre Montant (CFA) et Nombre de factures. */
  setChartMode(mode: 'montant' | 'nombre') {
    if (this.chartMode === mode) return;
    this.chartMode = mode;
    this.buildBarChart();
  }

  private buildBarChart() {
    const data = this.evolutionData;
    const isMontant = this.chartMode === 'montant';
    this.barChartData = {
      labels: data.map(d => this.getMonthName(d.mois).slice(0, 3)),
      datasets: [{
        data: data.map(d => isMontant ? d.montantTotal : d.nombreFactures),
        label: isMontant ? 'Montant (CFA)' : 'Nombre de factures',
        backgroundColor: isMontant ? 'rgba(5, 150, 105, 0.85)' : 'rgba(37, 99, 235, 0.85)',
        hoverBackgroundColor: isMontant ? '#047857' : '#1D4ED8',
        borderRadius: 8,
        maxBarThickness: 38
      }]
    };
  }

  /** Tendance du dernier mois (renseigné) vs le mois précédent. */
  private computeTrends() {
    const withData = this.evolutionData.filter(d => d.nombreFactures > 0 || d.montantTotal > 0);
    if (withData.length >= 2) {
      const cur = withData[withData.length - 1];
      const prev = withData[withData.length - 2];
      this.montantTrend = this.pctChange(prev.montantTotal, cur.montantTotal);
      this.countTrend = this.pctChange(prev.nombreFactures, cur.nombreFactures);
    } else {
      this.montantTrend = null;
      this.countTrend = null;
    }
  }

  private pctChange(prev: number, cur: number): number | null {
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }

  /** Formate les grands nombres pour l'axe Y : 1 200 000 → « 1,2 M ». */
  private shortNum(n: number): string {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
    if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + ' k';
    return String(n);
  }

  get scopeLabel(): string {
    if (this.authService.isServiceRegional()) return this.currentUser?.regionNom || 'Ma région';
    if (this.authService.isServiceCentral()) return 'Niveau national';
    return 'Administration';
  }

  get todayLabel(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // === Saisie Rapide Methods ===

  onMedicamentInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    if (query.length >= 2) {
      this.medicamentService.search(query).subscribe(res => {
        this.suggestions = res;
        const exactMatch = res.find(m => m.nom.toLowerCase() === query.trim().toLowerCase());
        if (exactMatch) {
          this.medicamentForm.patchValue({ codeProduit: exactMatch.code }, { emitEvent: false });
          this.applyMedicamentStatut(exactMatch);
        } else {
          this.excludedInfo = null;
        }
      });
    } else {
      this.suggestions = [];
      this.excludedInfo = null;
    }
  }

  onMedicamentSelected(event: any) {
    const nom = event.option.value;
    const med = this.suggestions.find(m => m.nom === nom);
    if (med) {
      this.medicamentForm.patchValue({ codeProduit: med.code });
      this.applyMedicamentStatut(med);
    }
  }

  /** Applique le statut du médicament : bloque + affiche motif/description si EXCLU. */
  private applyMedicamentStatut(med: Medicament) {
    if (med.statut === StatutMedicament.EXCLU) {
      this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
      this.excludedInfo = { nom: med.nom, motif: med.motif, description: med.description };
    } else {
      this.medicamentForm.get('medicament')?.setErrors(null);
      this.excludedInfo = null;
    }
  }

  ajouterMedicamentLigne() {
    if (this.medicamentForm.invalid) return;
    const val = this.medicamentForm.value;
    this.patientLignes.push({
      medicament: (val.medicament || '').toString().toUpperCase(),
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });
    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.suggestions = [];
    this.excludedInfo = null;
    this.snackBar.open('Médicament préparé', 'OK', { duration: 2000 });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
  }

  /** Wizard mobile : passe à l'étape « patient + dossier » (au moins un médicament requis). */
  goToPatientStep() {
    if (this.patientLignes.length === 0) return;
    this.wizardStep = 1;
    this.scrollToFormTop();
  }

  /** Wizard mobile : revient à l'étape « médicaments ». */
  goToMedicamentStep() {
    this.wizardStep = 0;
    this.scrollToFormTop();
  }

  private scrollToFormTop() {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onPhotoSelected(key: PhotoKey, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner une image', 'Fermer', { duration: 3000 });
      input.value = '';
      return;
    }
    // Compression côté client (≤ 50 Ko) avant envoi au serveur.
    compressImageToDataUrl(file, 50 * 1024)
      .then(dataUrl => { this.photos[key] = dataUrl; })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    input.value = '';
  }

  removePhoto(key: PhotoKey) {
    this.photos[key] = null;
  }

  openViewer(src: string) {
    this.viewerImage = src;
  }

  private resetPhotos() {
    this.photos = { ticketCaisse: null, bonCommande: null, ordonnance: null };
  }

  enregistrerPatientFacture() {
    if (this.patientForm.invalid || this.patientLignes.length === 0) return;

    this.isSubmitting = true;
    const patientVal = this.patientForm.value;
    const nouvellesLignes = this.patientLignes.map(pl => ({
      ...pl,
      patientNomPrenom: patientVal.patientNomPrenom,
      patientMatricule: patientVal.patientMatricule,
      ticketCaisse: this.photos.ticketCaisse || undefined,
      bonCommande: this.photos.bonCommande || undefined,
      ordonnance: this.photos.ordonnance || undefined
    }));

    this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
      next: (res) => {
        this.currentFacture = res;
        this.patientForm.reset();
        this.patientLignes = [];
        this.resetPhotos();
        this.wizardStep = 0; // retour à l'étape « médicaments » pour le patient suivant
        this.isSubmitting = false;
        this.snackBar.open('Patient et médicaments ajoutés à la facture', 'OK', { duration: 3000 });
        this.loadData(); // refresh KPIs and list
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      } 
    });
  }

  envoyerFacture() {
    if (!this.currentFacture) return;
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.',
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.envoyer(this.currentFacture!.id).subscribe({
        next: () => {
          this.snackBar.open('Facture envoyée avec succès', 'OK', { duration: 3000 });
          this.loadData();
          this.loadCurrentFacture();
        },
        error: (err) => {
          this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
        }
      });
    });
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }

  get currentMonthLabel(): string {
    const mois = this.currentFacture?.mois ?? (new Date().getMonth() + 1);
    const annee = this.currentFacture?.annee ?? new Date().getFullYear();
    return `${this.getMonthName(mois)} ${annee}`;
  }

  get tempTotal(): number {
    return this.patientLignes.reduce((sum, pl) => sum + (pl.quantite * pl.prixUnitaire), 0);
  }

  get currentStatut(): StatutFacture {
    return this.currentFacture?.statut ?? StatutFacture.BROUILLON;
  }

  get canSendFacture(): boolean {
    return (this.currentFacture?.lignes?.length || 0) > 0 && this.currentStatut === StatutFacture.BROUILLON;
  }
}
