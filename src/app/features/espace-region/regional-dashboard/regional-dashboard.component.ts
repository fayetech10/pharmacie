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
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MontantMensuelSR, SrGestionService, StructureEnregistrementRow, FactureAssigneeResume, StatsRegimeSR } from '../services/sr-gestion.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';
import { AuthService } from '../../../core/services/auth.service';
import { RegionService } from '../../../core/services/region.service';

interface SaisieStructureTypeStats {
  type: 'PS' | 'CS' | 'EPS';
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
  templateUrl: './regional-dashboard.component.html',
  styleUrls: ['./regional-dashboard.component.css']
})
export class RegionalDashboardComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private srService = inject(SrGestionService);
  private factureEvents = inject(FactureEventsService);
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
  toutesFactures: FactureAssigneeResume[] = [];
  facturesFiltrees: FactureAssigneeResume[] = [];
  selectedFacture: FactureAssigneeResume | null = null;
  regionNom = 'Région Médicale de Thiès';

  // États de chargement
  loading = false;
  loadingStructures = false;
  messageErreur = '';

  // Totaux globaux
  totalFacture = 0;
  totalSencsu = 0;
  totalSencsuTraite = 0;
  totalSencsuEnAttente = 0;
  totalBeneficiaires = 0;
  nombreFactures = 0;
  tauxTraitementSencsu = 0;

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

  // Éléments visuels des mini-graphiques des KPI Cards
  miniBars: MiniBarItem[] = [];
  sparklinePoints = '0,25 30,22 60,18 90,15 120,8 150,2';
  sparklineDots: SparklinePoint[] = [];

  // Graphiques analytiques Chart.js
  montantMensuelChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  participationChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  regimeChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };

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
    const types: Array<Pick<SaisieStructureTypeStats, 'type' | 'libelle' | 'icone'>> = [
      { type: 'PS', libelle: 'Postes de santé', icone: 'medical_services' },
      { type: 'CS', libelle: 'Centres de santé', icone: 'local_hospital' },
      { type: 'EPS', libelle: 'Hôpitaux (EPS)', icone: 'domain' }
    ];

    return types.map(type => {
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

    this.chargerDonnees();
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.chargerDonnees(false));
  }

  chargerDonnees(showLoader = true): void {
    if (showLoader) this.loading = true;
    this.messageErreur = '';

    forkJoin({
      dashboard: this.srService.calculerTableauDeBord({
        annee: this.annee,
        trimestre: this.trimestre ?? undefined,
        mois: this.mois ?? undefined
      }).pipe(catchError(() => of({ statsRegimes: [], montantsMensuels: [] }))),
      suivi: this.srService.getSuiviEnregistrement(this.annee, this.mois ?? undefined, this.trimestre ?? undefined)
        .pipe(catchError(() => of({ districts: [], structures: [], pharmacies: [] }))),
      toutesFactures: this.srService.getToutesFacturesResumes(true, false)
        .pipe(catchError(() => of([])))
    }).subscribe({
      next: ({ dashboard, suivi, toutesFactures }) => {
        // 1. Synthèse analytique et régimes
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

        const montants = dashboard.montantsMensuels || [];
        this.mettreAJourGraphiqueMensuel(montants);
        this.genererSparklines(montants);

        // 2. Structures suivies
        this.structuresSuivies = suivi.structures || [];
        this.mettreAJourGraphiquesStructures();

        // 3. Factures et calculs par statut
        this.toutesFactures = toutesFactures || [];
        this.calculerAttenteParNiveau(this.toutesFactures);
        this.calculerStatutsFactures(this.toutesFactures);
        this.appliquerFiltres();

        this.loading = false;
      },
      error: (err) => {
        this.messageErreur = err?.error?.message || 'Les données du tableau de bord sont indisponibles.';
        this.loading = false;
      }
    });
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
    switch (code) {
      case 'CONTRIBUTIF':
        return {
          labelCourt: 'Contributif',
          description: 'Mutuelles & BSF',
          icone: 'groups',
          colorHex: '#047857',
          bgClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          textClass: 'text-emerald-700',
          borderClass: 'border-emerald-200'
        };
      case 'ENFANTS_MOINS_5_ANS':
        return {
          labelCourt: '0 à 5 ans',
          description: 'Gratuité Enfants',
          icone: 'child_care',
          colorHex: '#2563eb',
          bgClass: 'bg-blue-50 text-blue-800 border-blue-200',
          textClass: 'text-blue-700',
          borderClass: 'border-blue-200'
        };
      case 'PLAN_SESAME':
        return {
          labelCourt: 'Plan Sésame',
          description: '60 ans et plus',
          icone: 'elderly',
          colorHex: '#d97706',
          bgClass: 'bg-amber-50 text-amber-800 border-amber-200',
          textClass: 'text-amber-700',
          borderClass: 'border-amber-200'
        };
      case 'CESARIENNE':
        return {
          labelCourt: 'Césarienne',
          description: 'Maternité & gratuité',
          icone: 'pregnant_woman',
          colorHex: '#7c3aed',
          bgClass: 'bg-purple-50 text-purple-800 border-purple-200',
          textClass: 'text-purple-700',
          borderClass: 'border-purple-200'
        };
      case 'DIALYSE':
        return {
          labelCourt: 'Dialyse',
          description: 'Prise en charge hémodialyse',
          icone: 'water_drop',
          colorHex: '#e11d48',
          bgClass: 'bg-rose-50 text-rose-800 border-rose-200',
          textClass: 'text-rose-700',
          borderClass: 'border-rose-200'
        };
      default:
        return {
          labelCourt: code,
          description: 'Régime CSU',
          icone: 'health_and_safety',
          colorHex: '#64748b',
          bgClass: 'bg-slate-50 text-slate-800 border-slate-200',
          textClass: 'text-slate-700',
          borderClass: 'border-slate-200'
        };
    }
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

  afficherMessageEnDeveloppement(nom?: string): void {
    const msg = nom
      ? `La fonctionnalité « ${nom} » est actuellement en cours de développement.`
      : 'Cette fonctionnalité est actuellement en cours de développement.';
    this.snackBar.open(msg, 'Compris', {
      duration: 3500,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  naviguerVersControle(): void {
    this.afficherMessageEnDeveloppement('Contrôle et validation des factures');
  }

  naviguerVersRegime(regimeCode: string): void {
    const info = this.getRegimeInfo(regimeCode);
    this.afficherMessageEnDeveloppement('Facturation du régime ' + info.labelCourt);
  }

  naviguerVersStatut(statut: string): void {
    this.afficherMessageEnDeveloppement('Filtrage des factures par statut');
  }

  naviguerVersPrestataires(type?: string): void {
    this.router.navigate(['/dashboard/espace-region'], {
      queryParams: { tab: 1, ...(type ? { type } : {}) }
    });
  }

  naviguerVersFactures(typeStructure?: string): void {
    this.afficherMessageEnDeveloppement('Validation des factures ' + (typeStructure || ''));
  }

  naviguerVersStructure(s: StructureEnregistrementRow): void {
    this.afficherMessageEnDeveloppement('Factures de ' + s.nom);
  }

  ouvrirFacture(f: FactureAssigneeResume | null): void {
    this.afficherMessageEnDeveloppement('Détail de la facture');
  }

  tauxSencsuFacture(f: FactureAssigneeResume | null): number {
    if (!f || !f.montantTotal) return 80;
    return Math.round((f.montantSencsu / f.montantTotal) * 100);
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
    const participation = this.saisiesParTypeStructure;
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
}
