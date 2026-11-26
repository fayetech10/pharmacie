import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { CHARTS_PROVIDER } from '../../../core/chart/chart.providers';
import { forkJoin, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import {
  ControleurSR,
  DistrictEnregistrementRow,
  FactureAssigneeResume,
  MontantMensuelSR,
  PharmacieEnregistrementRow,
  SrGestionService,
  StatsRegimeSR,
  StructureEnregistrementRow,
  SuiviBcsuRow
} from '../services/sr-gestion.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';
import { FactureCountService } from '../../../core/services/facture-count.service';
import { AuthService } from '../../../core/services/auth.service';
import { RegionService } from '../../../core/services/region.service';

interface SaisieStructureTypeStats {
  type: 'PS' | 'CS' | 'EPS' | 'PHARMACIE';
  libelle: string;
  icone: string;
  nombreActif: number;
  nombreAvecSaisie: number;
  montantSaisi: number;
  tauxSaisie: number;
}

export interface MiniBarItem {
  label: string;
  height: number;
  active: boolean;
  montant: number;
}

export interface SparklinePoint {
  x: number;
  y: number;
}

@Component({
  selector: 'app-regional-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatSnackBarModule,
    BaseChartDirective
  ],
  providers: [CHARTS_PROVIDER],
  templateUrl: './regional-dashboard.component.html',
  styleUrls: ['./regional-dashboard.component.css']
})
export class RegionalDashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private srService = inject(SrGestionService);
  private factureEvents = inject(FactureEventsService);
  private factureCount = inject(FactureCountService);
  private auth = inject(AuthService);
  private regionService = inject(RegionService);
  private snackBar = inject(MatSnackBar);

  // Filtres temporels
  annee = new Date().getFullYear();
  trimestre: number | null = null;
  mois: number | null = null;

  anneesDispo: number[] = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);
  trimestres = [
    { valeur: null, label: 'Toute l’année' },
    { valeur: 1, label: 'Trimestre 1 (Jan - Mar)' },
    { valeur: 2, label: 'Trimestre 2 (Avr - Juin)' },
    { valeur: 3, label: 'Trimestre 3 (Juil - Sep)' },
    { valeur: 4, label: 'Trimestre 4 (Oct - Déc)' }
  ];

  moisListe = [
    { num: null, nom: 'Tous les mois' },
    { num: 1, nom: 'Janvier' },
    { num: 2, nom: 'Février' },
    { num: 3, nom: 'Mars' },
    { num: 4, nom: 'Avril' },
    { num: 5, nom: 'Mai' },
    { num: 6, nom: 'Juin' },
    { num: 7, nom: 'Juillet' },
    { num: 8, nom: 'Août' },
    { num: 9, nom: 'Septembre' },
    { num: 10, nom: 'Octobre' },
    { num: 11, nom: 'Novembre' },
    { num: 12, nom: 'Décembre' }
  ];

  // Filtres métier
  searchQuery = '';
  selectedType = 'TOUS'; // TOUS, EPS, CS, PS, PHARMACIE
  selectedRegime = 'TOUS';
  selectedStatutOnglet = 'TOUS'; // TOUS, A_TRAITER, EN_COURS, VALIDEE

  // Données
  structuresSuivies: StructureEnregistrementRow[] = [];
  pharmaciesSuivies: PharmacieEnregistrementRow[] = [];
  districtsSuivis: DistrictEnregistrementRow[] = [];
  bcsuRows: SuiviBcsuRow[] = [];
  controleursList: ControleurSR[] = [];
  toutesFactures: FactureAssigneeResume[] = [];
  facturesFiltrees: FactureAssigneeResume[] = [];
  selectedFacture: FactureAssigneeResume | null = null;
  regionNom = 'Région Médicale de Thiès';

  // États de chargement
  loading = false;
  loadingStructures = false;
  messageErreur = '';

  // Totaux globaux & indicateurs complémentaires
  totalFacture = 0;
  totalSencsu = 0;
  totalSencsuTraite = 0;
  totalSencsuEnAttente = 0;
  totalBeneficiaires = 0;
  nombreFactures = 0;
  tauxTraitementSencsu = 0;
  deltaMontantAnneePct: number | null = null;

  nbNouvellesFactures = 0;
  nbFacturesPretsNC = 0;
  nbFacturesNonAssignees = 0;

  bcsuTotalFacture = 0;
  bcsuTotalPaye = 0;
  bcsuTotalReste = 0;
  bcsuTauxRegle = 0;

  // Régimes et paiements
  statsRegimes: StatsRegimeSR[] = [];

  // Répartition des factures par statut (Diagramme)
  nbFacturesPayees = 0;
  montantFacturesPayees = 0;
  pctFacturesPayees = 0;

  nbFacturesEnCours = 0;
  montantFacturesEnCours = 0;
  pctFacturesEnCours = 0;

  nbFacturesEnAttente = 0;
  montantFacturesEnAttente = 0;
  pctFacturesEnAttente = 0;

  nbFacturesRejetees = 0;
  montantFacturesRejetees = 0;
  pctFacturesRejetees = 0;

  totalFacturesPeriodeCount = 0;
  totalFacturesPeriodeMontant = 0;

  // Répartition du reste en attente par niveau
  attenteEps = 0;
  attenteCs = 0;
  attentePs = 0;

  // Régimes par défaut garantissant l'affichage complet
  private readonly REGIMES_DEFAUT: StatsRegimeSR[] = [
    { regime: 'CONTRIBUTIF', codeRegime: 'CONTRIBUTIF', libelle: 'Contributif (Mutuelles & BSF)', couleur: '#047857', montantFacture: 0, montantSencsuTotal: 0, montantSencsuTraite: 0, montantSencsuEnAttente: 0, nombreBeneficiaires: 0, nombreFactures: 0 },
    { regime: 'ENFANTS_MOINS_5_ANS', codeRegime: 'ENFANTS_MOINS_5_ANS', libelle: '0 à 5 ans (Gratuité enfants)', couleur: '#2563eb', montantFacture: 0, montantSencsuTotal: 0, montantSencsuTraite: 0, montantSencsuEnAttente: 0, nombreBeneficiaires: 0, nombreFactures: 0 },
    { regime: 'PLAN_SESAME', codeRegime: 'PLAN_SESAME', libelle: 'Plan Sésame (60 ans et +)', couleur: '#d97706', montantFacture: 0, montantSencsuTotal: 0, montantSencsuTraite: 0, montantSencsuEnAttente: 0, nombreBeneficiaires: 0, nombreFactures: 0 },
    { regime: 'CESARIENNE', codeRegime: 'CESARIENNE', libelle: 'Césarienne & Maternité', couleur: '#7c3aed', montantFacture: 0, montantSencsuTotal: 0, montantSencsuTraite: 0, montantSencsuEnAttente: 0, nombreBeneficiaires: 0, nombreFactures: 0 },
    { regime: 'DIALYSE', codeRegime: 'DIALYSE', libelle: 'Prise en charge Dialyse', couleur: '#e11d48', montantFacture: 0, montantSencsuTotal: 0, montantSencsuTraite: 0, montantSencsuEnAttente: 0, nombreBeneficiaires: 0, nombreFactures: 0 }
  ];

  // Propriété pré-calculée au lieu du getter (évite les recalculs à chaque cycle de change detection)
  saisiesParTypeStructureCache: SaisieStructureTypeStats[] = [];

  // Cache des infos de régime (évite ~35 appels switch/case par cycle de CD)
  private regimeInfoCache = new Map<string, ReturnType<RegionalDashboardComponent['getRegimeInfo']>>();

  // Éléments visuels des mini-graphiques des KPI Cards
  miniBars: MiniBarItem[] = [];
  sparklinePoints = '0,25 30,22 60,18 90,15 120,8 150,2';
  sparklineDots: SparklinePoint[] = [];

  // Graphiques analytiques Chart.js
  montantMensuelChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  participationChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  regimeChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  controleursChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };

  readonly controleursChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'start',
        labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle', color: '#475569', font: { size: 11 } }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: context => ` ${context.dataset.label} : ${context.parsed.x ?? 0} facture(s)`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        beginAtZero: true,
        border: { display: false },
        grid: { color: '#edf0f2' },
        ticks: { color: '#64748b', precision: 0, stepSize: 1 }
      },
      y: {
        stacked: true,
        border: { display: false },
        grid: { display: false },
        ticks: { color: '#334155', font: { size: 11.5, weight: 600 } }
      }
    }
  };

  // Diagramme Statut des factures (Doughnut)
  statutsFacturesChartData: ChartConfiguration<'doughnut'>['data'] = {
    labels: ['Payées / Validées', 'En cours de contrôle', 'En attente', 'Rejetées'],
    datasets: [{
      data: [0, 0, 0, 0],
      backgroundColor: ['#047857', '#3b82f6', '#f59e0b', '#ef4444'],
      hoverBackgroundColor: ['#065f46', '#2563eb', '#d97706', '#dc2626'],
      borderWidth: 2,
      borderColor: '#ffffff',
      hoverOffset: 3
    }]
  };

  readonly statutsFacturesChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => {
            if (this.totalFacturesPeriodeCount === 0) return ' Aucune facture sur cette période';
            return ` ${context.label} : ${context.parsed} facture(s)`;
          }
        }
      }
    }
  };

  readonly montantMensuelChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        callbacks: { label: context => this.formatMontant(context.parsed.y ?? 0) }
      }
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', maxRotation: 0 } },
      y: {
        beginAtZero: true,
        border: { display: false, dash: [3, 4] },
        grid: { color: '#edf0f2' },
        ticks: {
          color: '#64748b',
          maxTicksLimit: 5,
          callback: value => `${new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))}`
        }
      }
    }
  };

  readonly participationChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: context => `${context.dataset.label}: ${context.parsed.x} structure(s)` } }
    },
    scales: {
      x: {
        beginAtZero: true,
        stacked: true,
        border: { display: false },
        grid: { color: '#edf0f2' },
        ticks: { color: '#64748b', precision: 0, stepSize: 1 }
      },
      y: { stacked: true, border: { display: false }, grid: { display: false }, ticks: { color: '#334155', font: { size: 12 } } }
    }
  };

  readonly regimeChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: context => `${context.dataset.label}: ${this.formatMontant(context.parsed.x ?? 0)}`
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: '#edf0f2' },
        ticks: {
          color: '#64748b',
          maxTicksLimit: 5,
          callback: value => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))
        }
      },
      y: { border: { display: false }, grid: { display: false }, ticks: { color: '#334155', font: { size: 12 } } }
    }
  };

  get saisiesParTypeStructure(): SaisieStructureTypeStats[] {
    return this.saisiesParTypeStructureCache;
  }

  private recalculerSaisiesParType(): void {
    const types: Array<Pick<SaisieStructureTypeStats, 'type' | 'libelle' | 'icone'>> = [
      { type: 'PS', libelle: 'Postes de santé', icone: 'medical_services' },
      { type: 'CS', libelle: 'Centres de santé', icone: 'local_hospital' },
      { type: 'EPS', libelle: 'Hôpitaux (EPS)', icone: 'domain' }
    ];

    const statsStructures = types.map(type => {
      const structures = (this.structuresSuivies || []).filter(s => s?.actif && (s?.type || '').toUpperCase() === type.type);
      const saisissantes = structures.filter(s => s.saisieActive);
      return {
        ...type,
        nombreActif: structures.length,
        nombreAvecSaisie: saisissantes.length,
        montantSaisi: saisissantes.reduce((total, structure) => total + (structure.montantTotal || 0), 0),
        tauxSaisie: this.calculerPourcentage(saisissantes.length, structures.length)
      };
    });

    const pharmaciesActives = (this.pharmaciesSuivies || []).filter(p => p?.actif !== false);
    const pharmaciesSaisissantes = pharmaciesActives.filter(p => p.saisieActive);
    const statsPharmacies: SaisieStructureTypeStats = {
      type: 'PHARMACIE',
      libelle: "Pharmacies d'officine",
      icone: 'local_pharmacy',
      nombreActif: pharmaciesActives.length,
      nombreAvecSaisie: pharmaciesSaisissantes.length,
      montantSaisi: pharmaciesSaisissantes.reduce((total, p) => total + (p.montantTotal || 0), 0),
      tauxSaisie: this.calculerPourcentage(pharmaciesSaisissantes.length, pharmaciesActives.length)
    };

    this.saisiesParTypeStructureCache = [...statsStructures, statsPharmacies];
  }

  get totalStructuresAvecSaisie(): number {
    return this.saisiesParTypeStructure.reduce((total, type) => total + type.nombreAvecSaisie, 0);
  }

  get nombreStructuresActives(): number {
    return this.structuresSuivies.filter(structure => structure.actif).length;
  }

  get filtresActifsCount(): number {
    let count = 0;
    if (this.selectedType !== 'TOUS') count++;
    if (this.selectedRegime !== 'TOUS') count++;
    if (this.selectedStatutOnglet !== 'TOUS') count++;
    if (this.searchQuery && this.searchQuery.trim().length > 0) count++;
    if (this.trimestre !== null) count++;
    if (this.mois !== null) count++;
    return count;
  }

  ngOnInit(): void {
    const currentUser = this.auth.getCurrentUser();
    if (currentUser?.regionId) {
      this.regionService.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(regions => {
        const r = regions.find(reg => reg.id === currentUser?.regionId);
        if (r) this.regionNom = r.nom;
      });
    }

    this.srService.controleursObservable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(controleurs => {
        this.controleursList = controleurs || [];
        this.mettreAJourGraphiqueControleurs();
      });

    this.chargerDonnees();
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.chargerDonnees(false));
  }

  chargerDonnees(showLoader = true): void {
    if (showLoader) {
      this.loading = true;
      this.loadingStructures = true;
    }
    this.messageErreur = '';

    const factures$ = this.srService.getToutesFacturesResumes(true, false).pipe(
      catchError(() => of([] as FactureAssigneeResume[])),
      shareReplay(1)
    );

    forkJoin({
      factures: factures$,
      suivi: this.srService.getSuiviEnregistrement(
        this.annee,
        this.mois ?? undefined,
        this.trimestre ?? undefined,
        factures$
      ).pipe(catchError(() => of({ districts: [], structures: [], pharmacies: [] }))),
      bcsu: this.srService.getSuiviBcsu({
        annee: this.annee,
        trimestre: this.trimestre ?? undefined,
        mois: this.mois ?? undefined
      }).pipe(catchError(() => of([] as SuiviBcsuRow[])))
    }).subscribe({
      next: ({ factures, suivi, bcsu }) => {
        // ── 1. Calculer le tableau de bord à partir des factures déjà chargées ──
        const dashboard = this.calculerTableauDeBordLocal(factures);

        let stats = (dashboard.statsRegimes && dashboard.statsRegimes.length > 0)
          ? [...dashboard.statsRegimes]
          : this.REGIMES_DEFAUT.map(r => ({ ...r }));

        // S'assurer que tous les 5 régimes sont présents
        for (const def of this.REGIMES_DEFAUT) {
          if (!stats.some(s => (s.codeRegime || s.regime) === def.codeRegime)) {
            stats.push({ ...def });
          }
        }
        this.statsRegimes = stats;
        this.mettreAJourGraphiqueRegimes(stats);

        this.totalFacture = stats.reduce((s, r) => s + r.montantFacture, 0);
        this.totalSencsu = stats.reduce((s, r) => s + r.montantSencsuTotal, 0);
        this.totalSencsuTraite = stats.reduce((s, r) => s + r.montantSencsuTraite, 0);
        this.totalSencsuEnAttente = stats.reduce((s, r) => s + r.montantSencsuEnAttente, 0);
        this.totalBeneficiaires = stats.reduce((s, r) => s + r.nombreBeneficiaires, 0);
        this.nombreFactures = stats.reduce((s, r) => s + r.nombreFactures, 0);
        this.tauxTraitementSencsu = this.totalSencsu > 0 ? Math.round((this.totalSencsuTraite / this.totalSencsu) * 100) : 0;

        // Comparaison N vs N-1 sur la même période
        const facturesN1 = this.filtrerFacturesPeriode(factures, this.annee - 1, this.trimestre ?? undefined, this.mois ?? undefined);
        const totalN1 = facturesN1.reduce((s, f) => s + (f.montantTotal || 0), 0);
        this.deltaMontantAnneePct = totalN1 > 0 ? Math.round(((this.totalFacture - totalN1) / totalN1) * 100) : null;

        const montants = dashboard.montantsMensuels || [];
        this.mettreAJourGraphiqueMensuel(montants);
        this.genererSparklines(montants);

        // ── 2. Structures, pharmacies et districts suivis ──
        this.structuresSuivies = suivi.structures || [];
        this.pharmaciesSuivies = suivi.pharmacies || [];
        this.districtsSuivis = [...(suivi.districts || [])].sort((a, b) =>
          (b.nombrePostes ? b.nombrePostesAvecSaisie / b.nombrePostes : 0) - (a.nombrePostes ? a.nombrePostesAvecSaisie / a.nombrePostes : 0)
          || a.nom.localeCompare(b.nom, 'fr')
        );
        this.mettreAJourGraphiquesStructures();

        // ── 3. Synthèse BCSU ──
        this.bcsuRows = bcsu || [];
        this.bcsuTotalFacture = this.bcsuRows.reduce((s, r) => s + (r.montantFacture || 0), 0);
        this.bcsuTotalPaye = this.bcsuRows.reduce((s, r) => s + (r.montantPaye || 0), 0);
        this.bcsuTotalReste = this.bcsuRows.reduce((s, r) => s + (r.resteAPayer || 0), 0);
        this.bcsuTauxRegle = this.bcsuTotalFacture > 0 ? Math.round((this.bcsuTotalPaye / this.bcsuTotalFacture) * 100) : 0;

        // ── 4. Factures, statuts, alertes et graphique contrôleurs ──
        this.toutesFactures = factures;
        const facturesPeriode = this.filtrerFacturesPeriode(factures, this.annee, this.trimestre ?? undefined, this.mois ?? undefined);
        this.nbNouvellesFactures = facturesPeriode.filter(f => this.factureCount.isNewStructureInvoice(f.id)).length;
        this.nbFacturesPretsNC = facturesPeriode.filter(f => f.statut === 'VALIDEE_SR').length;
        this.nbFacturesNonAssignees = facturesPeriode.filter(f => (f.statut === 'A_TRAITER' || f.statut === 'ENVOYEE') && !f.controleurId).length;

        this.calculerAttenteParNiveau(facturesPeriode);
        this.calculerStatutsFactures(factures);
        this.mettreAJourGraphiqueControleurs();
        this.appliquerFiltres();

        this.loading = false;
        this.loadingStructures = false;
      },
      error: (err) => {
        this.messageErreur = err?.error?.message || 'Les données du tableau de bord sont indisponibles.';
        this.loading = false;
        this.loadingStructures = false;
      }
    });
  }

  private normaliserCodeRegimeDashboard(code?: string): string {
    const c = (code || '').trim().toUpperCase();
    switch (c) {
      case 'ZERO_CINQ_ANS':
      case 'ENFANTS_MOINS_5_ANS':
        return 'ENFANTS_MOINS_5_ANS';
      case 'SESAME':
      case 'PLAN_SESAME':
        return 'PLAN_SESAME';
      case 'CESARIENNE':
        return 'CESARIENNE';
      case 'DIALYSE':
      case 'DIALYSE_PERITONEALE':
      case 'HEMODIALYSE':
        return 'DIALYSE';
      case 'CONTRIBUTIF':
      case 'BSF':
      case 'CEC':
      case 'BSF_CEC':
      case 'NDONGO_DARA':
      case 'ELEVES':
      default:
        return 'CONTRIBUTIF';
    }
  }

  private filtrerFacturesPeriode(
    factures: FactureAssigneeResume[],
    annee: number,
    trimestre?: number,
    mois?: number
  ): FactureAssigneeResume[] {
    return (factures || []).filter(f => {
      if (f.annee !== annee) return false;
      if (mois && f.mois !== mois) return false;
      if (trimestre) {
        const m = f.mois;
        if (trimestre === 1 && (m < 1 || m > 3)) return false;
        if (trimestre === 2 && (m < 4 || m > 6)) return false;
        if (trimestre === 3 && (m < 7 || m > 9)) return false;
        if (trimestre === 4 && (m < 10 || m > 12)) return false;
      }
      return true;
    });
  }

  /**
   * Calcule les agrégats du tableau de bord directement côté client à partir
   * des factures déjà récupérées, éliminant un second appel réseau coûteux.
   */
  private calculerTableauDeBordLocal(factures: FactureAssigneeResume[]): {
    statsRegimes: StatsRegimeSR[];
    montantsMensuels: MontantMensuelSR[];
  } {
    const filtres = {
      annee: this.annee,
      trimestre: this.trimestre ?? undefined,
      mois: this.mois ?? undefined
    };

    const filtrees = this.filtrerFacturesPeriode(factures, filtres.annee, filtres.trimestre, filtres.mois);

    const REGIMES_LIST = [
      { code: 'CONTRIBUTIF', libelle: 'Classique / Contributif (BSF, Mutuelles)', couleur: 'emerald' },
      { code: 'ENFANTS_MOINS_5_ANS', libelle: 'Gratuité Enfants < 5 ans', couleur: 'blue' },
      { code: 'PLAN_SESAME', libelle: 'Plan Sésame (60 ans et plus)', couleur: 'amber' },
      { code: 'CESARIENNE', libelle: 'Maternité sans risque / Césarienne', couleur: 'purple' },
      { code: 'DIALYSE', libelle: 'Prise en charge Dialyse', couleur: 'rose' }
    ];

    const statsRegimes = REGIMES_LIST.map(r => {
      const fDuRegime = filtrees.filter(f => this.normaliserCodeRegimeDashboard(f.regime) === r.code);
      const montantFacture = fDuRegime.reduce((s, f) => s + f.montantTotal, 0);
      const montantSencsuTotal = fDuRegime.reduce((s, f) => s + f.montantSencsu, 0);
      const montantSencsuTraite = fDuRegime
        .filter(f => f.statut === 'VALIDEE_SR' || f.statut === 'VALIDEE_NC' || f.statut === 'ENVOYEE_NC' || f.statut === 'PAYEE')
        .reduce((s, f) => s + f.montantSencsu, 0);
      const nombreBeneficiaires = fDuRegime.reduce((s, f) => s + f.nombreBeneficiaires, 0);

      return {
        regime: r.code,
        codeRegime: r.code,
        libelle: r.libelle,
        couleur: r.couleur,
        montantFacture,
        montantSencsuTotal,
        montantSencsuTraite,
        montantSencsuEnAttente: Math.max(0, montantSencsuTotal - montantSencsuTraite),
        nombreBeneficiaires,
        nombreFactures: fDuRegime.length
      };
    });

    const moisAffiches = filtres.mois
      ? [filtres.mois]
      : filtres.trimestre
        ? Array.from({ length: 3 }, (_, index) => (filtres.trimestre! - 1) * 3 + index + 1)
        : Array.from({ length: 12 }, (_, index) => index + 1);
    const montantsMensuels = moisAffiches.map(mois => {
      const facturesDuMois = filtrees.filter(f => f.mois === mois);
      return {
        mois,
        montantFacture: facturesDuMois.reduce((total, facture) => total + facture.montantTotal, 0),
        nombreFactures: facturesDuMois.length
      };
    });

    return { statsRegimes, montantsMensuels };
  }

  private calculerAttenteParNiveau(factures: FactureAssigneeResume[]): void {
    const enAttente = factures.filter(f => f.statut === 'A_TRAITER' || f.statut === 'ENVOYEE');
    this.attenteEps = enAttente.filter(f => f.typeStructure === 'EPS').reduce((s, f) => s + f.montantSencsu, 0);
    this.attenteCs = enAttente.filter(f => f.typeStructure === 'CS').reduce((s, f) => s + f.montantSencsu, 0);
    this.attentePs = enAttente.filter(f => f.typeStructure === 'PS' || f.typeEtablissement === 'PHARMACIE').reduce((s, f) => s + f.montantSencsu, 0);
  }

  private calculerStatutsFactures(factures: FactureAssigneeResume[]): void {
    const filtrees = (factures || []).filter(f => {
      if (f.annee !== this.annee) return false;
      if (this.mois !== null && f.mois !== this.mois) return false;
      if (this.trimestre !== null) {
        const m = f.mois;
        const t = this.trimestre;
        if (t === 1 && (m < 1 || m > 3)) return false;
        if (t === 2 && (m < 4 || m > 6)) return false;
        if (t === 3 && (m < 7 || m > 9)) return false;
        if (t === 4 && (m < 10 || m > 12)) return false;
      }
      return true;
    });

    const payees = filtrees.filter(f => f.statut === 'VALIDEE_SR' || f.statut === 'VALIDEE_NC' || f.statut === 'PAYEE');
    const enCours = filtrees.filter(f => f.statut === 'EN_COURS_SR' || f.statut === 'EN_COURS');
    const enAttente = filtrees.filter(f => f.statut === 'A_TRAITER' || f.statut === 'ENVOYEE' || f.statut === 'BROUILLON');
    const rejetees = filtrees.filter(f => f.statut === 'REJETEE_SR' || f.statut === 'REJETEE_NC');

    this.nbFacturesPayees = payees.length;
    this.montantFacturesPayees = payees.reduce((s, f) => s + (f.montantTotal || 0), 0);

    this.nbFacturesEnCours = enCours.length;
    this.montantFacturesEnCours = enCours.reduce((s, f) => s + (f.montantTotal || 0), 0);

    this.nbFacturesEnAttente = enAttente.length;
    this.montantFacturesEnAttente = enAttente.reduce((s, f) => s + (f.montantTotal || 0), 0);

    this.nbFacturesRejetees = rejetees.length;
    this.montantFacturesRejetees = rejetees.reduce((s, f) => s + (f.montantTotal || 0), 0);

    this.totalFacturesPeriodeCount = filtrees.length;
    this.totalFacturesPeriodeMontant = filtrees.reduce((s, f) => s + (f.montantTotal || 0), 0);

    this.pctFacturesPayees = this.calculerPourcentage(this.nbFacturesPayees, this.totalFacturesPeriodeCount);
    this.pctFacturesEnCours = this.calculerPourcentage(this.nbFacturesEnCours, this.totalFacturesPeriodeCount);
    this.pctFacturesEnAttente = this.calculerPourcentage(this.nbFacturesEnAttente, this.totalFacturesPeriodeCount);
    this.pctFacturesRejetees = this.calculerPourcentage(this.nbFacturesRejetees, this.totalFacturesPeriodeCount);

    if (this.totalFacturesPeriodeCount > 0) {
      this.statutsFacturesChartData = {
        labels: ['Payées / Validées', 'En cours de contrôle', 'En attente', 'Rejetées'],
        datasets: [{
          data: [
            this.nbFacturesPayees,
            this.nbFacturesEnCours,
            this.nbFacturesEnAttente,
            this.nbFacturesRejetees
          ],
          backgroundColor: ['#047857', '#3b82f6', '#f59e0b', '#ef4444'],
          hoverBackgroundColor: ['#065f46', '#2563eb', '#d97706', '#dc2626'],
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 3
        }]
      };
    } else {
      this.statutsFacturesChartData = {
        labels: ['Aucune facture'],
        datasets: [{
          data: [1],
          backgroundColor: ['#f1f5f9'],
          hoverBackgroundColor: ['#f1f5f9'],
          borderWidth: 0
        }]
      };
    }
  }

  getRegimeInfo(code: string): {
    labelCourt: string;
    description: string;
    icone: string;
    colorHex: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
  } {
    const cached = this.regimeInfoCache.get(code);
    if (cached) return cached;

    let result: ReturnType<RegionalDashboardComponent['getRegimeInfo']>;
    switch (code) {
      case 'CONTRIBUTIF':
        result = {
          labelCourt: 'Contributif',
          description: 'Mutuelles & BSF',
          icone: 'groups',
          colorHex: '#047857',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          textClass: 'text-emerald-700',
          borderClass: 'border-emerald-200'
        };
        break;
      case 'ENFANTS_MOINS_5_ANS':
        result = {
          labelCourt: '0 à 5 ans',
          description: 'Gratuité Enfants',
          icone: 'child_care',
          colorHex: '#2563eb',
          bgClass: 'bg-blue-50 text-blue-800 border-blue-200',
          textClass: 'text-blue-700',
          borderClass: 'border-blue-200'
        };
        break;
      case 'PLAN_SESAME':
        result = {
          labelCourt: 'Plan Sésame',
          description: '60 ans et plus',
          icone: 'elderly',
          colorHex: '#d97706',
          bgClass: 'bg-amber-50 text-amber-800 border-amber-200',
          textClass: 'text-amber-700',
          borderClass: 'border-amber-200'
        };
        break;
      case 'CESARIENNE':
        result = {
          labelCourt: 'Césarienne',
          description: 'Maternité & gratuité',
          icone: 'pregnant_woman',
          colorHex: '#7c3aed',
          bgClass: 'bg-purple-50 text-purple-800 border-purple-200',
          textClass: 'text-purple-700',
          borderClass: 'border-purple-200'
        };
        break;
      case 'DIALYSE':
        result = {
          labelCourt: 'Dialyse',
          description: 'Prise en charge hémodialyse',
          icone: 'water_drop',
          colorHex: '#e11d48',
          bgClass: 'bg-rose-50 text-rose-800 border-rose-200',
          textClass: 'text-rose-700',
          borderClass: 'border-rose-200'
        };
        break;
      default:
        result = {
          labelCourt: code,
          description: 'Régime CSU',
          icone: 'health_and_safety',
          colorHex: '#64748b',
          bgClass: 'bg-slate-50 text-slate-800 border-slate-200',
          textClass: 'text-slate-700',
          borderClass: 'border-slate-200'
        };
    }
    this.regimeInfoCache.set(code, result);
    return result;
  }

  private genererSparklines(montants: MontantMensuelSR[]): void {
    const libellesMois = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const sixDerniers = montants && montants.length > 0 ? montants.slice(-6) : [];
    const maxM = Math.max(...sixDerniers.map(m => m.montantFacture), 1);

    // Mini bar chart pour Carte 2 (Part SEN-CSU)
    this.miniBars = sixDerniers.map(m => ({
      label: libellesMois[m.mois] || `M${m.mois}`,
      height: Math.max(16, Math.round((m.montantFacture / maxM) * 100)),
      active: m.mois === (this.mois || new Date().getMonth() + 1),
      montant: m.montantFacture
    }));

    // Sparkline avec points pour Carte 3 (Rythme de validation)
    if (sixDerniers.length > 0) {
      const minM = Math.min(...sixDerniers.map(m => m.montantFacture), 0);
      const range = maxM - minM || 1;
      const width = 150;
      const height = 40;
      const step = sixDerniers.length > 1 ? width / (sixDerniers.length - 1) : width;

      this.sparklineDots = sixDerniers.map((m, i) => ({
        x: Math.round(i * step),
        y: Math.round(height - ((m.montantFacture - minM) / range) * (height - 12) - 6)
      }));
      this.sparklinePoints = this.sparklineDots.map(d => `${d.x},${d.y}`).join(' ');
    }
  }

  appliquerFiltres(): void {
    let result = [...this.toutesFactures];

    // Année
    result = result.filter(f => f.annee === this.annee);

    // Mois
    if (this.mois !== null) {
      result = result.filter(f => f.mois === this.mois);
    }

    // Trimestre
    if (this.trimestre !== null) {
      const t = this.trimestre;
      result = result.filter(f => {
        const m = f.mois;
        if (t === 1) return m >= 1 && m <= 3;
        if (t === 2) return m >= 4 && m <= 6;
        if (t === 3) return m >= 7 && m <= 9;
        if (t === 4) return m >= 10 && m <= 12;
        return true;
      });
    }

    // Type d'établissement
    if (this.selectedType !== 'TOUS') {
      if (this.selectedType === 'PHARMACIE') {
        result = result.filter(f => f.typeEtablissement === 'PHARMACIE');
      } else {
        result = result.filter(f => f.typeStructure === this.selectedType);
      }
    }

    // Régime
    if (this.selectedRegime !== 'TOUS') {
      result = result.filter(f => f.regime === this.selectedRegime);
    }

    // Statut onglet du Work Center
    if (this.selectedStatutOnglet !== 'TOUS') {
      switch (this.selectedStatutOnglet) {
        case 'A_TRAITER':
          result = result.filter(f => f.statut === 'A_TRAITER' || f.statut === 'ENVOYEE');
          break;
        case 'EN_COURS':
          result = result.filter(f => f.statut === 'EN_COURS_SR' || f.statut === 'EN_COURS');
          break;
        case 'VALIDEE':
          result = result.filter(f => f.statut === 'VALIDEE_SR' || f.statut === 'VALIDEE_NC' || f.statut === 'PAYEE');
          break;
      }
    }

    // Recherche textuelle
    if (this.searchQuery && this.searchQuery.trim().length > 0) {
      const q = this.searchQuery.toLowerCase().trim();
      result = result.filter(f =>
        (f.numero && f.numero.toLowerCase().includes(q)) ||
        (f.etablissementNom && f.etablissementNom.toLowerCase().includes(q)) ||
        (f.etablissementCode && f.etablissementCode.toLowerCase().includes(q)) ||
        (f.districtNom && f.districtNom.toLowerCase().includes(q))
      );
    }

    this.facturesFiltrees = result;

    // Sélectionner automatiquement le premier élément s'il n'y en a pas d'actif
    if (this.facturesFiltrees.length > 0) {
      if (!this.selectedFacture || !this.facturesFiltrees.some(f => f.id === this.selectedFacture!.id)) {
        this.selectedFacture = this.facturesFiltrees[0];
      }
    } else {
      this.selectedFacture = null;
    }
  }

  selectFacture(f: FactureAssigneeResume): void {
    this.selectedFacture = f;
  }

  changerStatutOnglet(statut: string): void {
    this.selectedStatutOnglet = statut;
    this.appliquerFiltres();
  }

  resetFiltres(): void {
    this.searchQuery = '';
    this.selectedType = 'TOUS';
    this.selectedRegime = 'TOUS';
    this.selectedStatutOnglet = 'TOUS';
    this.trimestre = null;
    this.mois = null;
    this.onFiltreChange();
  }

  countParStatut(statut: string): number {
    const base = this.toutesFactures.filter(f => f.annee === this.annee);
    switch (statut) {
      case 'TOUS':
        return base.length;
      case 'A_TRAITER':
        return base.filter(f => f.statut === 'A_TRAITER' || f.statut === 'ENVOYEE').length;
      case 'EN_COURS':
        return base.filter(f => f.statut === 'EN_COURS_SR' || f.statut === 'EN_COURS').length;
      case 'VALIDEE':
        return base.filter(f => f.statut === 'VALIDEE_SR' || f.statut === 'VALIDEE_NC' || f.statut === 'PAYEE').length;
      default:
        return 0;
    }
  }

  onFiltreChange(): void {
    this.chargerDonnees();
  }

  naviguerVersControle(): void {
    this.router.navigate(['/dashboard/espace-region/suivi-traitement']);
  }

  naviguerVersRegime(_regimeCode: string): void {
    this.router.navigate(['/dashboard/espace-region/factures-structures']);
  }

  naviguerVersStatut(_statut: string): void {
    this.router.navigate(['/dashboard/espace-region/factures-structures']);
  }

  naviguerVersPrestataires(type?: string): void {
    if (type === 'PHARMACIE') {
      this.router.navigate(['/dashboard/espace-region/factures-pharmacies']);
      return;
    }
    this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires'], {
      queryParams: type ? { type } : undefined
    });
  }

  naviguerVersFactures(typeStructure?: string): void {
    if (typeStructure === 'PHARMACIE') {
      this.router.navigate(['/dashboard/espace-region/factures-pharmacies']);
      return;
    }
    this.router.navigate(['/dashboard/espace-region/factures-structures']);
  }

  naviguerVersStructure(s: StructureEnregistrementRow): void {
    if (s.type === 'PHARMACIE') {
      this.router.navigate(['/dashboard/espace-region/factures-pharmacies']);
      return;
    }
    this.router.navigate(['/dashboard/espace-region/factures-structures']);
  }

  naviguerVersBcsu(): void {
    this.router.navigate(['/dashboard/espace-region/suivi-bcsu']);
  }

  trackByDistrict(_index: number, item: DistrictEnregistrementRow): string {
    return item.id;
  }

  ouvrirFacture(f: FactureAssigneeResume | null): void {
    if (f?.typeEtablissement === 'PHARMACIE') {
      this.router.navigate(['/dashboard/espace-region/factures-pharmacies']);
      return;
    }
    this.router.navigate(['/dashboard/espace-region/factures-structures']);
  }

  tauxSencsuFacture(f: FactureAssigneeResume | null): number {
    if (!f || !f.montantTotal) return 80;
    return Math.round((f.montantSencsu / f.montantTotal) * 100);
  }

  // ── TrackBy optimisés pour éviter les re-renders inutiles du DOM ──
  trackByRegime(_index: number, item: StatsRegimeSR): string {
    return item.codeRegime || item.regime;
  }

  trackByStructure(_index: number, item: StructureEnregistrementRow): string {
    return item.id;
  }

  trackByTypeStructure(_index: number, item: SaisieStructureTypeStats): string {
    return item.type;
  }

  trackByMiniBar(index: number, item: MiniBarItem): string {
    return `${item.label}-${index}`;
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }

  calculerPourcentage(part: number, total: number): number {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round(((part || 0) / total) * 100)));
  }

  arrondir(n: number | null | undefined): number {
    return Math.round(n || 0);
  }

  libelleRegime(code?: string): string {
    if (!code) return 'Tous régimes';
    const r: Record<string, string> = {
      CONTRIBUTIF: 'Contributif (Mutuelles)',
      ENFANTS_MOINS_5_ANS: 'Gratuité Enfants < 5 ans',
      PLAN_SESAME: 'Plan Sésame (60 ans +)',
      CESARIENNE: 'Césarienne & Maternité',
      DIALYSE: 'Dialyse'
    };
    return r[code] || code;
  }

  libelleType(type?: string): string {
    if (!type) return 'Structure';
    const t: Record<string, string> = {
      EPS: 'Hôpital (EPS)',
      CS: 'Centre de santé (CS)',
      PS: 'Poste de santé (PS)',
      PHARMACIE: 'Pharmacie',
      STRUCTURE: 'Structure sanitaire'
    };
    return t[type] || type;
  }

  libelleStatutBadge(statut?: string): string {
    if (!statut) return 'En cours';
    const s: Record<string, string> = {
      A_TRAITER: 'À traiter',
      ENVOYEE: 'À traiter',
      EN_COURS_SR: 'En contrôle',
      EN_COURS: 'En cours',
      VALIDEE_SR: 'Validée SR',
      VALIDEE_NC: 'Approuvée',
      REJETEE_SR: 'Rejetée',
      REJETEE_NC: 'Rejetée',
      PAYEE: 'Payée'
    };
    return s[statut] || statut;
  }

  classeBadgeStatut(statut?: string): string {
    if (!statut) return 'bg-slate-700 text-slate-200 border-slate-600';
    switch (statut) {
      case 'A_TRAITER':
      case 'ENVOYEE':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'EN_COURS_SR':
      case 'EN_COURS':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'VALIDEE_SR':
      case 'VALIDEE_NC':
      case 'PAYEE':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'REJETEE_SR':
      case 'REJETEE_NC':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-700 text-slate-200 border-slate-600';
    }
  }

  private mettreAJourGraphiqueMensuel(montants: MontantMensuelSR[]): void {
    const libellesMois = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    this.montantMensuelChartData = {
      labels: montants.map(ligne => libellesMois[ligne.mois]),
      datasets: [{
        label: 'Montant facturé',
        data: montants.map(ligne => ligne.montantFacture),
        borderColor: '#047857',
        backgroundColor: 'rgba(4, 120, 87, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: montants.length > 6 ? 2 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: '#047857',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2
      }]
    };
  }

  private mettreAJourGraphiqueRegimes(stats: StatsRegimeSR[]): void {
    this.regimeChartData = {
      labels: stats.map(regime => regime.libelle),
      datasets: [
        {
          label: 'Montant facturé',
          data: stats.map(regime => regime.montantFacture),
          backgroundColor: '#94a3b8',
          hoverBackgroundColor: '#64748b',
          borderRadius: 4,
          barThickness: 14
        },
        {
          label: 'Part SEN-CSU totale',
          data: stats.map(regime => regime.montantSencsuTotal),
          backgroundColor: '#3b82f6',
          hoverBackgroundColor: '#2563eb',
          borderRadius: 4,
          barThickness: 14
        },
        {
          label: 'SEN-CSU traité / payé',
          data: stats.map(regime => regime.montantSencsuTraite),
          backgroundColor: '#047857',
          hoverBackgroundColor: '#065f46',
          borderRadius: 4,
          barThickness: 14
        }
      ]
    };
  }

  private mettreAJourGraphiquesStructures(): void {
    this.recalculerSaisiesParType();
    const participation = this.saisiesParTypeStructureCache;
    this.participationChartData = {
      labels: participation.map(ligne => ligne.libelle),
      datasets: [
        {
          label: 'Avec saisie',
          data: participation.map(ligne => ligne.nombreAvecSaisie),
          backgroundColor: '#047857',
          borderRadius: 4,
          barThickness: 18
        },
        {
          label: 'Sans saisie',
          data: participation.map(ligne => Math.max(0, ligne.nombreActif - ligne.nombreAvecSaisie)),
          backgroundColor: '#e2e8f0',
          borderRadius: 4,
          barThickness: 18
        }
      ]
    };
  }

  private mettreAJourGraphiqueControleurs(): void {
    const facturesPeriode = this.filtrerFacturesPeriode(
      this.toutesFactures,
      this.annee,
      this.trimestre ?? undefined,
      this.mois ?? undefined
    );
    const controleurs = this.controleursList || [];
    if (controleurs.length === 0) {
      this.controleursChartData = { labels: [], datasets: [] };
      return;
    }

    const lignes = controleurs
      .map(c => {
        const nom = `${c.prenom} ${c.nom}`.trim();
        const nomLower = nom.toLowerCase();
        const fSiennes = facturesPeriode.filter(f =>
          f.controleurId === c.id || (!!f.controleurNom && f.controleurNom.trim().toLowerCase() === nomLower)
        );
        return {
          nom,
          aTraiter: fSiennes.filter(f => f.statut === 'A_TRAITER' || f.statut === 'ENVOYEE').length,
          enCours: fSiennes.filter(f => f.statut === 'EN_COURS_SR' || f.statut === 'EN_COURS').length,
          validees: fSiennes.filter(f => f.statut === 'VALIDEE_SR').length,
          rejetees: fSiennes.filter(f => f.statut === 'REJETEE_SR').length,
          envoyeesNc: fSiennes.filter(f => f.statut === 'ENVOYEE_NC' || f.statut === 'VALIDEE_NC' || f.statut === 'PAYEE').length,
          total: fSiennes.length
        };
      })
      .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'));

    this.controleursChartData = {
      labels: lignes.map(l => l.nom),
      datasets: [
        { label: 'À traiter', data: lignes.map(l => l.aTraiter), backgroundColor: '#f59e0b', borderRadius: 3, barThickness: 16 },
        { label: 'En cours SR', data: lignes.map(l => l.enCours), backgroundColor: '#3b82f6', borderRadius: 3, barThickness: 16 },
        { label: 'Validées SR', data: lignes.map(l => l.validees), backgroundColor: '#047857', borderRadius: 3, barThickness: 16 },
        { label: 'Rejetées SR', data: lignes.map(l => l.rejetees), backgroundColor: '#ef4444', borderRadius: 3, barThickness: 16 },
        { label: 'Envoyées NC', data: lignes.map(l => l.envoyeesNc), backgroundColor: '#6366f1', borderRadius: 3, barThickness: 16 }
      ]
    };
  }
}
