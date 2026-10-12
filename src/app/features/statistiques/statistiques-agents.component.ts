import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AgentDetailModalComponent } from './agent-detail-modal/agent-detail-modal.component';
import { StatsService } from '../../core/services/stats.service';
import { AgentStat } from '../../core/models/stats.model';



import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';
@Component({
  selector: 'app-statistiques-agents',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, MatCardModule, MatIconModule, MatDialogModule, BaseChartDirective],
  templateUrl: './statistiques-agents.component.html',
  styleUrls: ['./statistiques-agents.component.css']
})
export class StatistiquesAgentsComponent implements OnInit {

  // KPIs généraux
  totalDossiers = 0;
  totalLettres = 0;
  totalFeuilles = 0;
  tempsMoyenGlobal = 0;

  agentsStats: AgentStat[] = [];
  loading = true;

  constructor(private dialog: MatDialog, private statsService: StatsService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.statsService.getStatsAgents().subscribe(res => {
      this.agentsStats = res;
      this.totalDossiers = res.reduce((acc, curr) => acc + curr.dossiersTraites, 0);
      this.totalLettres = res.reduce((acc, curr) => acc + curr.lettresEmises, 0);
      this.totalFeuilles = res.reduce((acc, curr) => acc + curr.feuillesSoins, 0);
      const totalTemps = res.reduce((acc, curr) => acc + curr.tempsMoyen, 0);
      this.tempsMoyenGlobal = res.length ? Math.round(totalTemps / res.length) : 0;
      
      this.updateChartData();
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  // Options du graphique Bar
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { grid: { display: false } },
      y: { min: 0 }
    },
    plugins: {
      legend: { display: true, position: 'bottom' }
    }
  };
  public barChartType: ChartType = 'bar';
  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Dossiers Traités', backgroundColor: '#059669', borderRadius: 4 },
      { data: [], label: 'Lettres Émises', backgroundColor: '#3B82F6', borderRadius: 4 }
    ]
  };

  updateChartData() {
    this.barChartData = {
      labels: this.agentsStats.map(a => a.nom),
      datasets: [
        { data: this.agentsStats.map(a => a.dossiersTraites), label: 'Dossiers Traités', backgroundColor: '#059669', borderRadius: 4 },
        { data: this.agentsStats.map(a => a.lettresEmises), label: 'Lettres Émises', backgroundColor: '#3B82F6', borderRadius: 4 }
      ]
    };
  }

  openAgentDetail(agent: AgentStat) {
    this.dialog.open(AgentDetailModalComponent, {
      data: {
        id: agent.id,
        agentNom: agent.nom,
        structure: agent.structure,
        stats: agent
      },
      width: '90vw',
      maxWidth: '900px'
    });
  }
}
