import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AgentDetailModalComponent } from '../statistiques/agent-detail-modal/agent-detail-modal.component';
import { PointageService, Pointage } from '../../core/services/pointage.service';



@Component({
  selector: 'app-pointages',
  standalone: true,
  imports: [
    CommonModule, 
    MatCardModule, 
    MatIconModule, 
    MatInputModule, 
    MatFormFieldModule, 
    FormsModule, 
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDialogModule
  ],
  templateUrl: './pointages.component.html',
  styleUrls: ['./pointages.component.css']
})
export class PointagesComponent implements OnInit {
  searchQuery = '';
  selectedDate: Date = new Date();
  
  pointages: Pointage[] = [];
  filteredPointages: Pointage[] = [];
  loading = false;

  constructor(private dialog: MatDialog, private pointageService: PointageService) {}

  ngOnInit() {
    this.loadPointages();
  }

  loadPointages() {
    this.loading = true;
    const dateStr = this.selectedDate.toISOString().split('T')[0];
    this.pointageService.getByDate(dateStr).subscribe(res => {
      this.pointages = res;
      this.applyFilters();
      this.loading = false;
    }, () => {
      this.loading = false;
    });
  }

  onDateChange() {
    this.loadPointages();
  }

  applyFilters() {
    this.filteredPointages = this.pointages.filter(p => {
      const matchName = p.userNom.toLowerCase().includes(this.searchQuery.toLowerCase()) || p.userPrenom.toLowerCase().includes(this.searchQuery.toLowerCase());
      return matchName;
    });
  }

  openAgentDetail(p: Pointage) {
    this.dialog.open(AgentDetailModalComponent, {
      data: {
        id: p.userId, // Passer l'id de l'utilisateur
        agentNom: this.getAgentFullName(p),
        structure: p.structureNom
      },
      width: '90vw',
      maxWidth: '900px'
    });
  }

  getAgentFullName(p: Pointage): string {
    return (p.userPrenom || '') + ' ' + (p.userNom || '');
  }

  getStatut(p: Pointage): string {
    if (p.heureArrivee && p.heureDepart) return 'TERMINE';
    if (p.heureArrivee && !p.heureDepart) return 'EN_POSTE';
    return 'ABSENT';
  }
}
