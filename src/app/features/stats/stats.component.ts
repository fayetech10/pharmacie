import { Component, Input, OnInit, OnChanges, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
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
  imports: [CommonModule, MatIconModule, BaseChartDirective],
  template: `
    <div class="page-head" *ngIf="!embedded">
      <div>
        <h1>Statistiques et analytiques</h1>
        <p>Aide à la décision · {{ scopeLabel }}</p>
      </div>
      <span class="scope-chip"><mat-icon>{{ scopeIcon }}</mat-icon> {{ scopeLabel }}</span>
    </div>

    <ng-container *ngIf="s">
      <!-- ============ KPI PRINCIPAUX ============ -->
      <div class="kpi-grid">
        <div class="kpi-card accent-green">
          <div class="kpi-icon green"><mat-icon>payments</mat-icon></div>
          <div class="kpi-body">
            <span class="kpi-value">{{ s.montantTotal | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="kpi-label">
              Montant total
              <span class="trend" *ngIf="montantTrend !== null" [class.up]="montantTrend! >= 0" [class.down]="montantTrend! < 0">
                <mat-icon>{{ montantTrend! >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>{{ montantTrend! >= 0 ? '+' : '' }}{{ montantTrend }}%
              </span>
            </span>
            <span class="kpi-foot" *ngIf="montantTrend !== null">vs {{ prevYear }} (à date)</span>
          </div>
        </div>

        <div class="kpi-card accent-violet">
          <div class="kpi-icon violet"><mat-icon>volunteer_activism</mat-icon></div>
          <div class="kpi-body">
            <span class="kpi-value">{{ s.montantCsu | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="kpi-label">Part CSU prise en charge (50%)</span>
          </div>
        </div>

        <div class="kpi-card accent-blue">
          <div class="kpi-icon blue"><mat-icon>receipt_long</mat-icon></div>
          <div class="kpi-body">
            <span class="kpi-value">{{ s.nombreFactures | number:'1.0-0':'fr' }}</span>
            <span class="kpi-label">
              Total factures
              <span class="trend" *ngIf="countTrend !== null" [class.up]="countTrend! >= 0" [class.down]="countTrend! < 0">
                <mat-icon>{{ countTrend! >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>{{ countTrend! >= 0 ? '+' : '' }}{{ countTrend }}%
              </span>
            </span>
            <span class="kpi-foot" *ngIf="countTrend !== null">vs {{ prevYear }} (à date)</span>
          </div>
        </div>

        <div class="kpi-card accent-amber">
          <div class="kpi-icon amber"><mat-icon>functions</mat-icon></div>
          <div class="kpi-body">
            <span class="kpi-value">{{ s.montantMoyen | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="kpi-label">Montant moyen / facture</span>
          </div>
        </div>
      </div>

      <!-- ============ INDICATEURS DE PERFORMANCE ============ -->
      <div class="perf-grid">
        <div class="perf-card" *ngFor="let p of perfs" [ngClass]="p.cls">
          <div class="perf-head">
            <mat-icon>{{ p.icon }}</mat-icon>
            <span class="perf-label">{{ p.label }}</span>
            <span class="perf-status" *ngIf="p.status !== '—'">{{ p.status }}</span>
          </div>
          <span class="perf-value">{{ p.display }}</span>
          <div class="perf-bar"><span [style.width.%]="p.bar"></span></div>
          <span class="perf-hint">{{ p.hint }}</span>
        </div>
      </div>

      <!-- ============ ÉVOLUTION (N vs N-1) + RÉPARTITION STATUT ============ -->
      <div class="analytics-grid">
        <div class="section-card chart-card">
          <div class="section-header">
            <div class="section-title-group">
              <mat-icon class="section-icon">show_chart</mat-icon>
              <h2>Évolution {{ chartYear }} vs {{ prevYear }}</h2>
            </div>
            <div class="chart-toggle">
              <button type="button" [class.active]="chartMode === 'montant'" (click)="setChartMode('montant')">Montant</button>
              <button type="button" [class.active]="chartMode === 'nombre'" (click)="setChartMode('nombre')">Nombre</button>
            </div>
          </div>
          <div class="chart-pad line-body">
            <canvas baseChart *ngIf="isLineReady"
              [data]="lineChartData"
              [options]="lineChartOptions"
              [type]="'line'">
            </canvas>
            <div class="empty-state" *ngIf="!isLineReady"><mat-icon>show_chart</mat-icon><p>Chargement…</p></div>
          </div>
        </div>

        <div class="section-card chart-card">
          <div class="section-header">
            <div class="section-title-group">
              <mat-icon class="section-icon">donut_large</mat-icon>
              <h2>Répartition par statut</h2>
            </div>
          </div>
          <div class="chart-pad donut-body">
            <div class="donut-wrap" *ngIf="hasStatusData; else noStatus">
              <canvas baseChart [data]="pieChartData" [options]="pieChartOptions" [type]="'doughnut'"></canvas>
              <div class="donut-center">
                <span class="donut-total">{{ s.nombreFactures }}</span>
                <span class="donut-cap">factures</span>
              </div>
            </div>
            <ng-template #noStatus>
              <div class="empty-state"><mat-icon>donut_large</mat-icon><p>Aucune donnée</p></div>
            </ng-template>
            <ul class="legend" *ngIf="hasStatusData">
              <li *ngFor="let st of statusBreakdown">
                <span class="dot" [style.background]="st.color"></span>
                <span class="legend-label">{{ st.label }}</span>
                <b>{{ st.count }}</b>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- ============ FUNNEL DE TRAITEMENT + TOP MÉDICAMENTS ============ -->
      <div class="analytics-grid">
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-group">
              <mat-icon class="section-icon">filter_alt</mat-icon>
              <h2>Parcours de traitement</h2>
            </div>
          </div>
          <div class="funnel" *ngIf="funnel.length && funnel[0].count > 0; else noFunnel">
            <div class="funnel-row" *ngFor="let f of funnel">
              <div class="funnel-top">
                <span class="funnel-label">{{ f.label }}</span>
                <span class="funnel-count">{{ f.count | number:'1.0-0':'fr' }}
                  <small *ngIf="f.conv !== null" class="funnel-conv">({{ f.conv }}%)</small>
                </span>
              </div>
              <div class="funnel-bar"><span [style.width.%]="f.width" [style.background]="f.color"></span></div>
            </div>
          </div>
          <ng-template #noFunnel>
            <div class="empty-state"><mat-icon>filter_alt</mat-icon><p>Aucune facture soumise</p></div>
          </ng-template>
        </div>

        <div class="section-card">
          <div class="section-header">
            <div class="section-title-group">
              <mat-icon class="section-icon">medication</mat-icon>
              <h2>Top médicaments (montant)</h2>
            </div>
          </div>
          <div class="chart-pad bar-body" *ngIf="hasMedData; else noMed">
            <canvas baseChart [data]="medChartData" [options]="medChartOptions" [type]="'bar'"></canvas>
          </div>
          <ng-template #noMed>
            <div class="empty-state"><mat-icon>medication</mat-icon><p>Aucune ligne de médicament</p></div>
          </ng-template>
        </div>
      </div>

      <!-- ============ TOP PHARMACIES (région / national) ============ -->
      <div class="section-card" *ngIf="showPharmacies && topPharmacies.length">
        <div class="section-header">
          <div class="section-title-group">
            <mat-icon class="section-icon">leaderboard</mat-icon>
            <h2>Top pharmacies</h2>
          </div>
        </div>
        <div class="ranking">
          <div class="rank-row" *ngFor="let p of topPharmacies; let i = index">
            <span class="rank-pos" [class.gold]="i === 0">{{ i + 1 }}</span>
            <div class="rank-info">
              <div class="rank-top">
                <span class="rank-name">{{ p.nom || '—' }}</span>
                <span class="rank-amount">{{ p.montant | number:'1.0-0':'fr' }} CFA</span>
              </div>
              <div class="rank-bar"><span [style.width.%]="pharmaPct(p)"></span></div>
              <span class="rank-sub">{{ p.nombreFactures }} facture(s)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ============ ACTIVITÉ PAR RÉGION (national) ============ -->
      <div class="section-card" *ngIf="showRegions && parRegion.length > 1">
        <div class="section-header">
          <div class="section-title-group">
            <mat-icon class="section-icon">map</mat-icon>
            <h2>Activité par région</h2>
          </div>
        </div>
        <div class="ranking">
          <div class="rank-row" *ngFor="let r of parRegion; let i = index">
            <span class="rank-pos" [class.gold]="i === 0">{{ i + 1 }}</span>
            <div class="rank-info">
              <div class="rank-top">
                <span class="rank-name">{{ r.nom }}</span>
                <span class="rank-amount">{{ r.nombreFactures | number:'1.0-0':'fr' }} facture(s)</span>
              </div>
              <div class="rank-bar"><span [style.width.%]="regionPct(r)"></span></div>
              <span class="rank-sub">{{ r.montant | number:'1.0-0':'fr' }} CFA</span>
            </div>
          </div>
        </div>
      </div>
    </ng-container>

    <div class="empty-state big" *ngIf="!s">
      <mat-icon>analytics</mat-icon><p>Chargement des statistiques…</p>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .scope-chip {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--primary-light); color: var(--primary);
      border: 1px solid var(--primary-200); padding: 7px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 700; white-space: nowrap;
    }
    .scope-chip mat-icon { font-size: 17px; width: 17px; height: 17px; }

    /* KPI */
    .kpi-card { position: relative; overflow: hidden; }
    .kpi-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--border); }
    .kpi-card.accent-blue::before   { background: #2563EB; }
    .kpi-card.accent-green::before  { background: var(--primary); }
    .kpi-card.accent-violet::before { background: #7C3AED; }
    .kpi-card.accent-amber::before  { background: #D97706; }
    .kpi-icon.blue   { background: #DBEAFE; color: #2563EB; }
    .kpi-icon.green  { background: var(--primary-100); color: var(--primary); }
    .kpi-icon.violet { background: #EDE9FE; color: #7C3AED; }
    .kpi-icon.amber  { background: #FEF3C7; color: #D97706; }
    .kpi-foot { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
    .trend { display: inline-flex; align-items: center; gap: 1px; font-size: 11.5px; font-weight: 700; margin-left: 6px; padding: 1px 6px; border-radius: 999px; }
    .trend mat-icon { font-size: 13px; width: 13px; height: 13px; }
    .trend.up { color: var(--primary); background: var(--primary-100); }
    .trend.down { color: var(--warn); background: var(--warn-light); }

    /* Indicateurs de performance */
    .perf-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .perf-card {
      background: #fff; border: 1px solid var(--border); border-radius: var(--radius);
      padding: 16px; display: flex; flex-direction: column; gap: 8px; box-shadow: var(--shadow-sm);
    }
    .perf-head { display: flex; align-items: center; gap: 8px; }
    .perf-head mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--text-secondary); }
    .perf-label { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); line-height: 1.2; }
    .perf-value { font-size: 24px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
    .perf-bar { height: 6px; border-radius: 999px; background: var(--border-light); overflow: hidden; }
    .perf-bar span { display: block; height: 100%; border-radius: 999px; transition: width 0.5s ease; }
    .perf-hint { font-size: 11px; color: var(--text-muted); }
    .perf-card.ok   .perf-bar span { background: var(--primary); }
    .perf-card.warn .perf-bar span { background: #D97706; }
    .perf-card.bad  .perf-bar span { background: var(--warn); }
    .perf-card.ok   .perf-value { color: var(--primary-hover); }
    .perf-card.bad  .perf-value { color: var(--warn); }

    /* Grilles graphiques */
    .analytics-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; margin-bottom: 24px; }
    .chart-card { margin-bottom: 0; display: flex; flex-direction: column; }
    .chart-pad { padding: 16px 20px 20px; }
    .line-body { height: 300px; }
    .line-body canvas { max-height: 100%; }
    .bar-body { height: 300px; }
    .bar-body canvas { max-height: 100%; }

    .chart-toggle { display: inline-flex; gap: 3px; padding: 3px; background: var(--border-light); border-radius: 10px; }
    .chart-toggle button {
      border: none; background: transparent; padding: 6px 14px; border-radius: 8px;
      font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
      cursor: pointer; transition: all 0.2s ease;
    }
    .chart-toggle button.active { background: #fff; color: var(--primary); box-shadow: var(--shadow-sm); }

    /* Doughnut + légende */
    .donut-body { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .donut-wrap { position: relative; width: 200px; height: 200px; margin: 4px auto 8px; }
    .donut-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
    .donut-total { font-size: 30px; font-weight: 800; color: var(--text-primary); line-height: 1; }
    .donut-cap { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
    .legend { list-style: none; margin: 4px 0 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 2px; }
    .legend li { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 13px; border-bottom: 1px solid var(--border-light); }
    .legend li:last-child { border-bottom: none; }
    .legend .dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    .legend-label { color: var(--text-secondary); flex: 1; }
    .legend b { color: var(--text-primary); font-weight: 700; }

    /* Funnel */
    .funnel { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 16px; }
    .funnel-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
    .funnel-label { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
    .funnel-count { font-size: 14px; font-weight: 700; color: var(--text-primary); }
    .funnel-conv { font-size: 11.5px; font-weight: 600; color: var(--text-muted); }
    .funnel-bar { height: 22px; border-radius: 7px; background: var(--border-light); overflow: hidden; }
    .funnel-bar span { display: block; height: 100%; border-radius: 7px; transition: width 0.6s ease; }

    /* Classements */
    .ranking { padding: 12px 20px 20px; }
    .rank-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--border-light); }
    .rank-row:last-child { border-bottom: none; }
    .rank-pos { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--border-light); color: var(--text-secondary); font-size: 13px; font-weight: 700; }
    .rank-pos.gold { background: #FEF3C7; color: #B45309; }
    .rank-info { flex: 1; min-width: 0; }
    .rank-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .rank-name { font-weight: 600; font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rank-amount { font-weight: 700; font-size: 13.5px; color: var(--primary); white-space: nowrap; }
    .rank-bar { height: 6px; border-radius: 999px; background: var(--border-light); margin: 7px 0 0; overflow: hidden; }
    .rank-bar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--primary-200), var(--primary)); transition: width 0.5s ease; }
    .rank-sub { font-size: 12px; color: var(--text-muted); }

    .empty-state.big { padding: 60px 20px; }

    @media (max-width: 1100px) { .analytics-grid { grid-template-columns: 1fr; } }
    @media (max-width: 900px)  { .perf-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 480px)  { .perf-grid { grid-template-columns: 1fr; } }
  `]
})
export class StatsComponent implements OnInit, OnChanges {
  /** Mode intégré (dans un onglet d'espace) : masque l'en-tête de page. */
  @Input() embedded = false;
  /** Périmètre d'analyse ; si absent, déduit du rôle de l'utilisateur. */
  @Input() scope?: StatsScope;

  s: StatsData | null = null;
  chartYear = new Date().getFullYear();
  prevYear = new Date().getFullYear() - 1;

  /** Désactive les animations si l'utilisateur a demandé moins de mouvement. */
  readonly prefersReducedMotion = typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Tendances (à date, N vs N-1)
  montantTrend: number | null = null;
  countTrend: number | null = null;

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
    VALIDEE_SR: { label: 'Validée SR',  color: '#059669' },
    VALIDEE_NC: { label: 'Validée NC',  color: '#047857' },
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

  private load() {
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
    this.statsObs().subscribe((data: StatsData) => {
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
      { label: 'Validées (SR)', count: valSR, color: '#059669' },
      { label: 'Validées (Central)', count: valNC, color: '#047857' },
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
        backgroundColor: '#059669', hoverBackgroundColor: '#047857',
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
    }).subscribe(({ cur, prev }) => {
      this.evoCur = cur || [];
      this.evoPrev = prev || [];
      this.computeTrends();
      this.buildEvolutionChart();
      this.isLineReady = true;
    });
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
          borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.12)',
          pointBackgroundColor: '#059669', pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 2.5
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
