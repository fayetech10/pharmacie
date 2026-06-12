import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { StatsService } from '../../core/services/stats.service';
import { AuthService } from '../../core/services/auth.service';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatSelectModule, MatIconModule, BaseChartDirective],
  template: `
    <div class="page-head">
      <div>
        <h1>Statistiques et Analytiques</h1>
        <p>Aperçu global des performances de la CSU</p>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid" *ngIf="stats">
      <div class="kpi-card">
        <div class="kpi-icon blue"><mat-icon>receipt_long</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ stats.nombreFactures }}</span>
          <span class="kpi-label">Total Factures</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon green"><mat-icon>payments</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ stats.montantTotal | number:'1.0-0':'fr' }} <small>CFA</small></span>
          <span class="kpi-label">Montant Global</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon teal"><mat-icon>check_circle</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ (stats.facturesParStatut['VALIDEE'] || 0) }}</span>
          <span class="kpi-label">Factures Validées</span>
        </div>
      </div>

      <div class="kpi-card">
        <div class="kpi-icon purple"><mat-icon>pie_chart</mat-icon></div>
        <div class="kpi-body">
          <span class="kpi-value">{{ tauxAcceptation | number:'1.0-1':'fr' }}%</span>
          <span class="kpi-label">Taux d'acceptation</span>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Répartition par Statut</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div style="display: block; max-height: 300px; padding-bottom: 20px;">
            <canvas baseChart *ngIf="isPieReady"
              [data]="pieChartData"
              [options]="pieChartOptions"
              [type]="'doughnut'">
            </canvas>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Évolution Mensuelle</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div style="display: block; max-height: 300px; padding-bottom: 20px;">
            <canvas baseChart *ngIf="isLineReady"
              [data]="lineChartData"
              [options]="lineChartOptions"
              [type]="'line'">
            </canvas>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .kpi-icon.teal { background: #CCFBF1; color: #0F766E; }
    .kpi-icon.purple { background: #F3E8FF; color: #7E22CE; }

    .dashboard-grid { display: grid; grid-template-columns: 1fr 2fr; gap: 24px; }
    @media (max-width: 960px) { .dashboard-grid { grid-template-columns: 1fr; } }
  `]
})
export class StatsComponent implements OnInit {
  stats: any;
  tauxAcceptation = 0;

  // Libellés lisibles + couleur par statut (cohérent avec les badges)
  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Brouillon',
    ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée SR',
    REJETEE_SR: 'Rejetée SR',
    VALIDEE_NC: 'Validée Central',
    REJETEE_NC: 'Rejetée Central',
    PAYEE: 'Payée'
  };
  private readonly statutColors: Record<string, string> = {
    BROUILLON: '#64748B',
    ENVOYEE: '#2563EB',
    VALIDEE_SR: '#0D9488',
    REJETEE_SR: '#DC2626',
    VALIDEE_NC: '#16A34A',
    REJETEE_NC: '#991B1B',
    PAYEE: '#15803D'
  };

  // Pie Chart
  public pieChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'bottom' } }
  };
  public pieChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  public isPieReady = false;

  // Line Chart
  public lineChartOptions: ChartOptions<'line'> = { responsive: true, maintainAspectRatio: false };
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
      
      let validee = data.facturesParStatut['VALIDEE'] || 0;
      let totale = data.nombreFactures || 1;
      this.tauxAcceptation = (validee / totale) * 100;

      const statutKeys = Object.keys(data.facturesParStatut);
      this.pieChartData = {
        labels: statutKeys.map(k => this.statutLabels[k] ?? k),
        datasets: [{
          data: statutKeys.map(k => data.facturesParStatut[k]) as number[],
          backgroundColor: statutKeys.map(k => this.statutColors[k] ?? '#94A3B8')
        }]
      };
      this.isPieReady = true;
    });
  }

  loadEvolution() {
    const regionId = this.authService.isServiceCentral() ? undefined : this.authService.getCurrentUser()?.regionId;
    this.statsService.getEvolutionMensuelle(new Date().getFullYear(), regionId).subscribe((data: any[]) => {
      this.lineChartData = {
        labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'],
        datasets: [{
          data: data.map((d: any) => d.montantTotal),
          label: 'Montant Total (CFA)',
          fill: true,
          tension: 0.4,
          borderColor: '#1565C0',
          backgroundColor: 'rgba(21, 101, 192, 0.1)'
        }]
      };
      this.isLineReady = true;
    });
  }
}
