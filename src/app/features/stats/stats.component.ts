import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { StatsService } from '../../core/services/stats.service';
import { AuthService } from '../../core/services/auth.service';
import { MonthData } from '../../core/models/stats.model';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatSelectModule, MatIconModule, BaseChartDirective],
  template: `
    <div class="page-head" *ngIf="!embedded">
      <div>
        <h1>Statistiques et analytiques</h1>
        <p>Aperçu global des performances de la CSU</p>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid" *ngIf="stats">
      <div class="kpi-card accent-blue">
        <div class="kpi-icon blue"><mat-icon>receipt_long</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ stats.nombreFactures | number:'1.0-0':'fr' }}</span>
          <span class="kpi-label">Total factures</span>
        </div>
      </div>

      <div class="kpi-card accent-green">
        <div class="kpi-icon green"><mat-icon>payments</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ stats.montantTotal | number:'1.0-0':'fr' }} <small>CFA</small></span>
          <span class="kpi-label">Montant global</span>
        </div>
      </div>

      <div class="kpi-card accent-violet">
        <div class="kpi-icon violet"><mat-icon>volunteer_activism</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ montantCsu | number:'1.0-0':'fr' }} <small>CFA</small></span>
          <span class="kpi-label">Part CSU prise en charge (50%)</span>
        </div>
      </div>

      <div class="kpi-card accent-emerald">
        <div class="kpi-icon emerald"><mat-icon>verified</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ tauxValidation }}%</span>
          <span class="kpi-label">Taux de validation</span>
          <div class="rate-bar"><span [style.width.%]="tauxValidation"></span></div>
        </div>
      </div>
    </div>

    <!-- Graphiques -->
    <div class="analytics-grid">
      <!-- Évolution -->
      <div class="section-card chart-card">
        <div class="section-header">
          <div class="section-title-group">
            <mat-icon class="section-icon">show_chart</mat-icon>
            <h2>Évolution mensuelle {{ chartYear }}</h2>
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

      <!-- Répartition par statut -->
      <div class="section-card chart-card">
        <div class="section-header">
          <div class="section-title-group">
            <mat-icon class="section-icon">donut_large</mat-icon>
            <h2>Répartition par statut</h2>
          </div>
        </div>
        <div class="chart-pad donut-body">
          <div class="donut-wrap" *ngIf="hasStatusData; else noStatus">
            <canvas baseChart
              [data]="pieChartData"
              [options]="pieChartOptions"
              [type]="'doughnut'">
            </canvas>
            <div class="donut-center">
              <span class="donut-total">{{ stats?.nombreFactures || 0 }}</span>
              <span class="donut-cap">factures</span>
            </div>
          </div>
          <ng-template #noStatus>
            <div class="empty-state"><mat-icon>donut_large</mat-icon><p>Aucune donnée</p></div>
          </ng-template>
          <ul class="legend" *ngIf="hasStatusData">
            <li *ngFor="let s of statusBreakdown">
              <span class="dot" [style.background]="s.color"></span>
              <span class="legend-label">{{ s.label }}</span>
              <b>{{ s.count }}</b>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Répartition par région (niveau national) -->
    <div class="section-card" *ngIf="regionBreakdown.length > 1">
      <div class="section-header">
        <div class="section-title-group">
          <mat-icon class="section-icon">map</mat-icon>
          <h2>Activité par région</h2>
        </div>
      </div>
      <div class="ranking">
        <div class="rank-row" *ngFor="let r of regionBreakdown; let i = index">
          <span class="rank-pos" [class.gold]="i === 0">{{ i + 1 }}</span>
          <div class="rank-info">
            <div class="rank-top">
              <span class="rank-name">{{ r.nom }}</span>
              <span class="rank-amount">{{ r.count | number:'1.0-0':'fr' }} facture(s)</span>
            </div>
            <div class="rank-bar"><span [style.width.%]="r.pct"></span></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* Accent coloré KPI */
    .kpi-card { position: relative; overflow: hidden; }
    .kpi-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--border); }
    .kpi-card.accent-blue::before    { background: #2563EB; }
    .kpi-card.accent-green::before   { background: var(--primary); }
    .kpi-card.accent-violet::before  { background: #7C3AED; }
    .kpi-card.accent-emerald::before { background: var(--primary-hover); }
    .kpi-icon.blue    { background: #DBEAFE; color: #2563EB; }
    .kpi-icon.green   { background: var(--primary-100); color: var(--primary); }
    .kpi-icon.violet  { background: #EDE9FE; color: #7C3AED; }
    .kpi-icon.emerald { background: var(--primary-100); color: var(--primary-hover); }
    .rate-bar { height: 6px; border-radius: 999px; background: var(--border-light); margin-top: 8px; overflow: hidden; }
    .rate-bar span { display: block; height: 100%; border-radius: 999px; background: var(--primary); transition: width 0.5s ease; }

    /* Grille graphiques */
    .analytics-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; margin-bottom: 24px; }
    .chart-card { margin-bottom: 0; display: flex; flex-direction: column; }
    .chart-pad { padding: 16px 20px 20px; }
    .line-body { height: 300px; }
    .line-body canvas { max-height: 100%; }

    /* Bascule Montant / Nombre */
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

    /* Classement par région */
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

    @media (max-width: 1100px) { .analytics-grid { grid-template-columns: 1fr; } }
  `]
})
export class StatsComponent implements OnInit {
  /** Mode intégré (dans un onglet d'espace) : masque l'en-tête de page. */
  @Input() embedded = false;

  stats: any;
  montantCsu = 0;
  tauxValidation = 0;
  chartYear = new Date().getFullYear();

  statusBreakdown: { statut: string; label: string; count: number; color: string }[] = [];
  hasStatusData = false;
  regionBreakdown: { nom: string; count: number; pct: number }[] = [];

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

  // Doughnut (répartition par statut)
  public pieChartOptions: ChartOptions<'doughnut'> = {
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
            return `  ${ctx.label} : ${ctx.parsed} (${Math.round((ctx.parsed / total) * 100)}%)`;
          }
        }
      }
    }
  };
  public pieChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };

  // Courbe (évolution)
  chartMode: 'montant' | 'nombre' = 'montant';
  private evolutionData: MonthData[] = [];
  public lineChartOptions: ChartOptions<'line'> = {
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
      y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { callback: (v: any) => this.chartMode === 'montant' ? this.shortNum(+v) : v } },
      x: { grid: { display: false } }
    }
  };
  public lineChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  public isLineReady = false;

  constructor(private statsService: StatsService, private authService: AuthService) {}

  ngOnInit() {
    this.loadStats();
    this.loadEvolution();
  }

  loadStats() {
    const obs$ = this.authService.isServiceCentral()
      ? this.statsService.getStatsNational()
      : this.statsService.getStatsRegional(this.authService.getCurrentUser()?.regionId || '');

    obs$.subscribe((data: any) => {
      this.stats = data;
      const parStatut: Record<string, number> = data.facturesParStatut || {};

      this.montantCsu = Math.round((data.montantTotal || 0) / 2);

      // Taux de validation = validées / factures traitées (hors non envoyées)
      const validees = (parStatut['VALIDEE_SR'] || 0) + (parStatut['VALIDEE_NC'] || 0) + (parStatut['PAYEE'] || 0);
      const traitees = Object.entries(parStatut)
        .filter(([k]) => k !== 'BROUILLON')
        .reduce((s, [, n]) => s + (n as number), 0);
      this.tauxValidation = traitees ? Math.round((validees / traitees) * 100) : 0;

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
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      };

      // Répartition par région (niveau national)
      const parRegion: Record<string, number> = data.facturesParRegion || {};
      const regions = Object.entries(parRegion)
        .map(([nom, count]) => ({ nom, count: count as number }))
        .sort((a, b) => b.count - a.count);
      const max = regions.length ? regions[0].count : 0;
      this.regionBreakdown = regions.map(r => ({ ...r, pct: max ? Math.round((r.count / max) * 100) : 0 }));
    });
  }

  loadEvolution() {
    const regionId = this.authService.isServiceCentral() ? undefined : this.authService.getCurrentUser()?.regionId;
    this.statsService.getEvolutionMensuelle(this.chartYear, regionId).subscribe((data: MonthData[]) => {
      this.evolutionData = data || [];
      this.buildEvolutionChart();
      this.isLineReady = true;
    });
  }

  setChartMode(mode: 'montant' | 'nombre') {
    if (this.chartMode === mode) return;
    this.chartMode = mode;
    this.buildEvolutionChart();
  }

  private buildEvolutionChart() {
    const isMontant = this.chartMode === 'montant';
    const color = isMontant ? '#059669' : '#2563EB';
    const fill = isMontant ? 'rgba(5, 150, 105, 0.12)' : 'rgba(37, 99, 235, 0.12)';
    this.lineChartData = {
      labels: this.evolutionData.map(d => this.getMonthShort(d.mois)),
      datasets: [{
        data: this.evolutionData.map(d => isMontant ? d.montantTotal : d.nombreFactures),
        label: isMontant ? 'Montant (CFA)' : 'Nombre de factures',
        fill: true,
        tension: 0.4,
        borderColor: color,
        backgroundColor: fill,
        pointBackgroundColor: color,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 2.5
      }]
    };
  }

  private getMonthShort(mois: number): string {
    return ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'][mois] || '';
  }

  private shortNum(n: number): string {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
    if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + ' k';
    return String(n);
  }
}
