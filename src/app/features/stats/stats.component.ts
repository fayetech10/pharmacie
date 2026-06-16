import { Component, Input, OnInit, OnChanges, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { StatsService } from '../../core/services/stats.service';
import { FactureEventsService } from '../../core/services/facture-events.service';
import { AuthService } from '../../core/services/auth.service';
import { StatsData, MonthData, MedicamentStat, PharmacieStat, RegionStat } from '../../core/models/stats.model';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

/** Périmètre d'analyse du tableau de bord (pilote la source de données). */
export interface StatsScope {
  type: 'national' | 'region' | 'pharmacie';
  id?: string;
  label?: string;
}

interface PerfIndicator {
  icon: string;
  label: string;
  display: string;
  bar: number;        // largeur de la barre (0-100)
  cls: 'ok' | 'warn' | 'bad';
  status: string;     // libellé textuel (accessibilité : pas uniquement la couleur)
  hint: string;
}

interface FunnelStage {
  label: string;
  count: number;
  width: number;      // largeur relative à la 1ère étape
  conv: number | null; // taux de conversion depuis l'étape précédente
  color: string;
  bottleneck: boolean; // plus forte déperdition du parcours
}

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule, BaseChartDirective],
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.css']
})
export class StatsComponent implements OnInit, OnChanges {
  /** Mode intégré (dans un onglet d'espace) : masque l'en-tête de page. */
  @Input() embedded = false;
  /** Périmètre d'analyse ; si absent, déduit du rôle de l'utilisateur. */
  @Input() scope?: StatsScope;

  s: StatsData | null = null;
  loading = false;
  error = false;
  noPharmacie = false;
  chartYear = new Date().getFullYear();
  prevYear = new Date().getFullYear() - 1;

  /** Désactive les animations si l'utilisateur a demandé moins de mouvement. */
  readonly prefersReducedMotion = typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tendances (à date, N vs N-1)
  montantTrend: number | null = null;
  countTrend: number | null = null;

  // Mini-courbes (sparklines) de l'année en cours pour les cartes KPI
  montantSpark: { line: string; area: string } = { line: '', area: '' };
  countSpark: { line: string; area: string } = { line: '', area: '' };

  // Indicateurs de performance
  perfs: PerfIndicator[] = [];

  // Répartition par statut
  statusBreakdown: { statut: string; label: string; count: number; color: string }[] = [];
  hasStatusData = false;

  // Funnel
  funnel: FunnelStage[] = [];

  // Top médicaments / pharmacies / régions
  topPharmacies: PharmacieStat[] = [];
  parRegion: RegionStat[] = [];
  hasMedData = false;

  private activeScope: StatsScope = { type: 'national', label: 'National' };

  private readonly statusMeta: Record<string, { label: string; color: string }> = {
    BROUILLON:  { label: 'Non envoyée', color: '#64748B' },
    ENVOYEE:    { label: 'Envoyée',     color: '#2563EB' },
    VALIDEE_SR: { label: 'Validée SR',  color: '#2F6E54' },
    VALIDEE_NC: { label: 'Validée NC',  color: '#1F5038' },
    PAYEE:      { label: 'Payée',       color: '#A16207' },
    REJETEE_SR: { label: 'Rejetée SR',  color: '#EA580C' },
    REJETEE_NC: { label: 'Rejetée NC',  color: '#DC2626' }
  };
  private readonly statusOrder = ['ENVOYEE', 'VALIDEE_SR', 'VALIDEE_NC', 'PAYEE', 'REJETEE_SR', 'REJETEE_NC', 'BROUILLON'];

  // ----- Chart.js : doughnut statuts -----
  public pieChartOptions: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false, cutout: '68%',
    animation: this.prefersReducedMotion ? false : undefined,
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 10,
        callbacks: {
          label: (ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((a, n) => a + n, 0) || 1;
            return `  ${ctx.label} : ${ctx.parsed} (${Math.round((ctx.parsed / total) * 100)}%)`;
          }
        }
      }
    }
  };
  public pieChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };

  // ----- Chart.js : évolution N vs N-1 -----
  chartMode: 'montant' | 'nombre' = 'montant';
  private evoCur: MonthData[] = [];
  private evoPrev: MonthData[] = [];
  public lineChartOptions: ChartOptions<'line'> = {
    responsive: true, maintainAspectRatio: false,
    animation: this.prefersReducedMotion ? false : undefined,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
      tooltip: {
        padding: 10,
        callbacks: {
          label: (ctx: any) => this.chartMode === 'montant'
            ? `  ${ctx.dataset.label} : ${Number(ctx.parsed.y).toLocaleString('fr-FR')} CFA`
            : `  ${ctx.dataset.label} : ${ctx.parsed.y} facture(s)`
        }
      }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { callback: (v: any) => this.chartMode === 'montant' ? this.shortNum(+v) : v } },
      x: { grid: { display: false } }
    }
  };
  public lineChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  public isLineReady = false;

  // ----- Chart.js : top médicaments (barres horizontales) -----
  public medChartOptions: ChartOptions<'bar'> = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    animation: this.prefersReducedMotion ? false : undefined,
    plugins: {
      legend: { display: false },
      tooltip: { padding: 10, callbacks: { label: (ctx: any) => `  ${Number(ctx.parsed.x).toLocaleString('fr-FR')} CFA` } }
    },
    scales: {
      x: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { callback: (v: any) => this.shortNum(+v) } },
      y: { grid: { display: false }, ticks: { font: { size: 11 } } }
    }
  };
  public medChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };

  private destroyRef = inject(DestroyRef);
  private factureEvents = inject(FactureEventsService);

  constructor(private statsService: StatsService, private authService: AuthService) {}

  ngOnInit() {
    this.activeScope = this.resolveScope();
    this.load();
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }

  ngOnChanges() {
    // Permet au parent (drill-down) de changer le périmètre dynamiquement.
    const next = this.resolveScope();
    if (next.type !== this.activeScope.type || next.id !== this.activeScope.id) {
      this.activeScope = next;
      if (this.s) this.load();
    } else {
      this.activeScope = next;
    }
  }

  get scopeLabel(): string {
    return this.activeScope.label
      || (this.activeScope.type === 'national' ? 'National'
        : this.activeScope.type === 'region' ? 'Région' : 'Pharmacie');
  }
  get scopeIcon(): string {
    return this.activeScope.type === 'national' ? 'public'
      : this.activeScope.type === 'region' ? 'place' : 'local_pharmacy';
  }
  get showPharmacies(): boolean { return this.activeScope.type !== 'pharmacie'; }
  get showRegions(): boolean { return this.activeScope.type === 'national'; }

  // Résumés textuels des graphiques pour les lecteurs d'écran (canvas non accessibles)
  get lineAria(): string {
    const unit = this.chartMode === 'montant' ? 'du montant' : 'du nombre de factures';
    return `Graphique d'évolution mensuelle ${unit} pour ${this.chartYear} comparé à ${this.prevYear}.`;
  }
  get donutAria(): string {
    const parts = this.statusBreakdown.map(s => `${s.label} : ${s.count}`).join(', ');
    return `Répartition des factures par statut. ${parts || 'Aucune donnée'}.`;
  }
  get medAria(): string {
    const labels = (this.medChartData.labels as string[]) || [];
    return `Top médicaments par montant facturé : ${labels.length ? labels.join(', ') : 'aucune donnée'}.`;
  }

  private resolveScope(): StatsScope {
    if (this.scope) return this.scope;
    const u = this.authService.getCurrentUser();
    if (this.authService.isServiceCentral() || this.authService.isAdmin()) return { type: 'national', label: 'National' };
    if (this.authService.isServiceRegional()) return { type: 'region', id: u?.regionId, label: 'Votre région' };
    if (this.authService.isPharmacien()) return { type: 'pharmacie', id: u?.pharmacieId, label: 'Votre pharmacie' };
    return { type: 'national', label: 'National' };
  }

  load() {
    this.noPharmacie = false;
    if (this.activeScope.type === 'pharmacie' && !this.activeScope.id) {
      this.noPharmacie = true;
      this.loading = false;
      this.s = null;
      return;
    }

    this.loading = true;
    this.error = false;
    this.loadStats();
    this.loadEvolution();
  }

  private statsObs() {
    const sc = this.activeScope;
    if (sc.type === 'region') return this.statsService.getStatsRegional(sc.id || '');
    if (sc.type === 'pharmacie') return this.statsService.getStatsPharmacie(sc.id || '');
    return this.statsService.getStatsNational();
  }

  private loadStats() {
    this.statsObs().subscribe({
      next: (data: StatsData) => {
        this.s = data;
        const parStatut = data.facturesParStatut || {};

        // Répartition par statut (doughnut + légende)
        this.statusBreakdown = this.statusOrder
          .filter(s => parStatut[s])
          .map(s => ({ statut: s, label: this.statusMeta[s].label, count: parStatut[s], color: this.statusMeta[s].color }));
        this.hasStatusData = this.statusBreakdown.length > 0;
        this.pieChartData = {
          labels: this.statusBreakdown.map(s => s.label),
          datasets: [{
            data: this.statusBreakdown.map(s => s.count),
            backgroundColor: this.statusBreakdown.map(s => s.color),
            borderColor: '#fff', borderWidth: 2, hoverOffset: 6
          }]
        };

        this.buildPerformance(data);
        this.buildFunnel(parStatut);
        this.buildTopMedicaments(data.topMedicaments || []);

        this.topPharmacies = (data.topPharmacies || []).filter(p => p.montant > 0);
        this.parRegion = data.parRegion || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement statistiques:', err);
        this.error = true;
        this.loading = false;
      }
    });
  }

  private buildPerformance(d: StatsData) {
    const lignesTotal = (d.lignesAcceptees || 0) + (d.lignesRejetees || 0);
    const tauxAccept = lignesTotal ? Math.round((d.lignesAcceptees / lignesTotal) * 100) : null;
    const delai = d.delaiMoyenTraitementJours || 0;

    const valCls = this.high(d.tauxValidation ?? 0, 80, 50);
    const rejCls = this.low(d.tauxRejet ?? 0, 10, 25);
    const delaiCls: 'ok' | 'warn' | 'bad' = delai === 0 ? 'ok' : this.low(delai, 3, 7);
    const accCls: 'ok' | 'warn' | 'bad' = tauxAccept === null ? 'ok' : this.high(tauxAccept, 90, 70);

    this.perfs = [
      {
        icon: 'verified', label: 'Taux de validation',
        display: `${d.tauxValidation ?? 0}%`, bar: Math.min(d.tauxValidation ?? 0, 100),
        cls: valCls, status: this.clsLabel(valCls),
        hint: 'des factures traitées sont validées'
      },
      {
        icon: 'block', label: 'Taux de rejet',
        display: `${d.tauxRejet ?? 0}%`, bar: Math.min(d.tauxRejet ?? 0, 100),
        cls: rejCls, status: this.clsLabel(rejCls),
        hint: 'des factures traitées sont rejetées'
      },
      {
        icon: 'schedule', label: 'Délai moyen de traitement',
        display: delai > 0 ? `${delai} j` : '—', bar: Math.min((delai / 14) * 100, 100),
        cls: delaiCls, status: delai === 0 ? '—' : this.clsLabel(delaiCls),
        hint: 'de l\'envoi à la 1ère décision'
      },
      {
        icon: 'fact_check', label: 'Acceptation des lignes',
        display: tauxAccept !== null ? `${tauxAccept}%` : '—', bar: tauxAccept ?? 0,
        cls: accCls, status: tauxAccept === null ? '—' : this.clsLabel(accCls),
        hint: tauxAccept !== null ? `${d.lignesAcceptees} acceptée(s) / ${d.lignesRejetees} rejetée(s)` : 'pas encore de décision'
      }
    ];
  }

  private clsLabel(cls: 'ok' | 'warn' | 'bad'): string {
    return cls === 'ok' ? 'Bon' : cls === 'warn' ? 'À surveiller' : 'Critique';
  }

  private buildFunnel(parStatut: Record<string, number>) {
    const n = (k: string) => parStatut[k] || 0;
    const soumises = n('ENVOYEE') + n('VALIDEE_SR') + n('REJETEE_SR') + n('VALIDEE_NC') + n('REJETEE_NC') + n('PAYEE');
    const valSR = n('VALIDEE_SR') + n('VALIDEE_NC') + n('REJETEE_NC') + n('PAYEE');
    const valNC = n('VALIDEE_NC') + n('PAYEE');
    const payees = n('PAYEE');

    const stages = [
      { label: 'Soumises', count: soumises, color: '#2563EB' },
      { label: 'Validées (SR)', count: valSR, color: '#2F6E54' },
      { label: 'Validées (Central)', count: valNC, color: '#1F5038' },
      { label: 'Payées', count: payees, color: '#A16207' }
    ];
    const base = soumises || 1;
    this.funnel = stages.map((st, i) => ({
      label: st.label,
      count: st.count,
      width: Math.round((st.count / base) * 100),
      conv: i === 0 ? null : (stages[i - 1].count ? Math.round((st.count / stages[i - 1].count) * 100) : 0),
      color: st.color,
      bottleneck: false
    }));

    // Goulot d'étranglement : l'étape (hors 1ère) avec la plus faible conversion.
    let worst = -1, worstConv = 101;
    this.funnel.forEach((f, i) => {
      if (i > 0 && f.conv !== null && f.conv < worstConv) { worstConv = f.conv; worst = i; }
    });
    if (worst >= 0 && worstConv < 100) this.funnel[worst].bottleneck = true;
  }

  private buildTopMedicaments(meds: MedicamentStat[]) {
    const top = meds.slice(0, 8);
    this.hasMedData = top.length > 0;
    this.medChartData = {
      labels: top.map(m => this.truncate(m.nom, 22)),
      datasets: [{
        data: top.map(m => Math.round(m.montant)),
        backgroundColor: '#2F6E54', hoverBackgroundColor: '#1F5038',
        borderRadius: 5, barThickness: 'flex', maxBarThickness: 26
      }]
    };
  }

  private loadEvolution() {
    const sc = this.activeScope;
    const regionId = sc.type === 'region' ? sc.id : undefined;
    const pharmacieId = sc.type === 'pharmacie' ? sc.id : undefined;
    forkJoin({
      cur: this.statsService.getEvolutionMensuelle(this.chartYear, regionId, pharmacieId),
      prev: this.statsService.getEvolutionMensuelle(this.prevYear, regionId, pharmacieId)
    }).subscribe({
      next: ({ cur, prev }) => {
        this.evoCur = cur || [];
        this.evoPrev = prev || [];
        this.computeTrends();
        this.montantSpark = this.sparkPath(this.evoCur.map(d => d.montantTotal));
        this.countSpark = this.sparkPath(this.evoCur.map(d => d.nombreFactures));
        this.buildEvolutionChart();
        this.isLineReady = true;
      },
      error: (err) => {
        console.error('Erreur chargement évolution:', err);
        this.error = true;
      }
    });
  }

  /** Construit un tracé SVG (ligne + aire) de sparkline à partir de valeurs mensuelles. */
  private sparkPath(values: number[]): { line: string; area: string } {
    const w = 120, h = 32, pad = 2;
    if (!values.length) return { line: '', area: '' };
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const stepX = (w - pad * 2) / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => [
      pad + i * stepX,
      pad + (h - pad * 2) * (1 - (v - min) / range)
    ]);
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
    return { line, area };
  }

  /** Tendances à date : cumul jan→mois courant, N vs N-1. */
  private computeTrends() {
    const m = new Date().getMonth() + 1;
    const sum = (arr: MonthData[], key: 'montantTotal' | 'nombreFactures') =>
      arr.filter(d => d.mois <= m).reduce((acc, d) => acc + (d[key] || 0), 0);
    this.montantTrend = this.pct(sum(this.evoPrev, 'montantTotal'), sum(this.evoCur, 'montantTotal'));
    this.countTrend = this.pct(sum(this.evoPrev, 'nombreFactures'), sum(this.evoCur, 'nombreFactures'));
  }

  setChartMode(mode: 'montant' | 'nombre') {
    if (this.chartMode === mode) return;
    this.chartMode = mode;
    this.buildEvolutionChart();
  }

  private buildEvolutionChart() {
    const isMontant = this.chartMode === 'montant';
    const pick = (d: MonthData) => isMontant ? d.montantTotal : d.nombreFactures;
    this.lineChartData = {
      labels: this.evoCur.map(d => this.getMonthShort(d.mois)),
      datasets: [
        {
          data: this.evoCur.map(pick), label: `${this.chartYear}`,
          fill: true, tension: 0.4,
          borderColor: '#2F6E54', backgroundColor: 'rgba(47,110,84,0.12)',
          pointBackgroundColor: '#2F6E54', pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 2.5
        },
        {
          data: this.evoPrev.map(pick), label: `${this.prevYear}`,
          fill: false, tension: 0.4,
          borderColor: '#94A3B8', backgroundColor: 'transparent',
          borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 4, borderWidth: 2
        }
      ]
    };
  }

  pharmaPct(p: PharmacieStat): number {
    const max = this.topPharmacies.reduce((mx, x) => Math.max(mx, x.montant), 0) || 1;
    return Math.round((p.montant / max) * 100);
  }
  regionPct(r: RegionStat): number {
    const max = this.parRegion.reduce((mx, x) => Math.max(mx, x.nombreFactures), 0) || 1;
    return Math.round((r.nombreFactures / max) * 100);
  }

  private high(v: number, good: number, warn: number): 'ok' | 'warn' | 'bad' {
    return v >= good ? 'ok' : v >= warn ? 'warn' : 'bad';
  }
  private low(v: number, good: number, warn: number): 'ok' | 'warn' | 'bad' {
    return v <= good ? 'ok' : v <= warn ? 'warn' : 'bad';
  }
  private pct(prev: number, cur: number): number | null {
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }
  private getMonthShort(mois: number): string {
    return ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][mois] || '';
  }
  private truncate(s: string, n: number): string {
    return s && s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  private shortNum(n: number): string {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
    if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + ' k';
    return String(n);
  }
}
