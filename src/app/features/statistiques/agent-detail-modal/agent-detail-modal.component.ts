import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { PointageService, Pointage } from '../../../core/services/pointage.service';

import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
export interface AgentDetailData {
  agentNom: string;
  structure: string;
  id?: string;
  stats?: any; // The AgentStat object
}

interface PointageHistory {
  date: Date;
  heureArrivee: string;
  heureDepart: string;
  statut: 'PRESENT' | 'ABSENT' | 'RETARD';
}

@Component({
  selector: 'app-agent-detail-modal',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatCardModule],
  templateUrl: './agent-detail-modal.component.html',
  styleUrls: ['./agent-detail-modal.component.css']
})
export class AgentDetailModalComponent implements OnInit {
  
  // KPIs réels (récupérés via MAT_DIALOG_DATA.stats)
  heuresTravailleesSemaine = 0;
  nombreEnregistrements = 0;
  lettresEmises = 0;
  feuillesSoins = 0;

  pointages: PointageHistory[] = [];
  loadingPointages = false;

  constructor(
    public dialogRef: MatDialogRef<AgentDetailModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AgentDetailData,
    private pointageService: PointageService
  ) {}

  ngOnInit() {
    if (this.data.stats) {
      this.heuresTravailleesSemaine = this.data.stats.heuresTravailleesSemaine;
      this.nombreEnregistrements = this.data.stats.dossiersTraites;
      this.lettresEmises = this.data.stats.lettresEmises;
      this.feuillesSoins = this.data.stats.feuillesSoins;
    }
    
    if (this.data.id) {
      this.loadPointages();
    }
  }

  close() {
    this.dialogRef.close();
  }

  private loadPointages() {
    this.loadingPointages = true;
    this.pointageService.getPointagesByAgent(this.data.id!).subscribe(res => {
      this.pointages = res.map(p => {
        let statut: 'PRESENT' | 'ABSENT' | 'RETARD' = 'PRESENT';
        
        // Logique simplifiée pour statuts
        if (p.heureArrivee) {
          const arrDate = new Date(p.heureArrivee);
          // Si arrivée après 8h30 = retard (exemple)
          if (arrDate.getHours() > 8 || (arrDate.getHours() === 8 && arrDate.getMinutes() > 30)) {
            statut = 'RETARD';
          }
        } else {
          statut = 'ABSENT';
        }

        const formatTime = (isoString: string) => {
          if (!isoString) return '-';
          const d = new Date(isoString);
          return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
        };

        return {
          date: new Date(p.date),
          heureArrivee: formatTime(p.heureArrivee),
          heureDepart: formatTime(p.heureDepart),
          statut
        };
      });
      this.loadingPointages = false;
    }, () => {
      this.loadingPointages = false;
    });
  }

}
