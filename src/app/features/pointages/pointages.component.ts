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
  /** Message d'erreur affiché : sans lui, un échec réseau laissait un tableau vide muet. */
  erreur: string | null = null;

  constructor(private dialog: MatDialog, private pointageService: PointageService) {}

  ngOnInit() {
    this.loadPointages();
  }

  /**
   * Date CALENDAIRE locale au format YYYY-MM-DD.
   * `toISOString()` convertit en UTC : pour tout utilisateur hors UTC, la requête
   * pouvait porter sur la veille ou le lendemain et ne rien remonter.
   */
  private toDateLocale(d: Date): string {
    const mois = String(d.getMonth() + 1).padStart(2, '0');
    const jour = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mois}-${jour}`;
  }

  loadPointages() {
    this.loading = true;
    this.erreur = null;
    this.pointageService.getByDate(this.toDateLocale(this.selectedDate)).subscribe({
      next: (res) => {
        this.pointages = res || [];
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        this.pointages = [];
        this.filteredPointages = [];
        this.loading = false;
        this.erreur = err?.status === 403
          ? "Vous n'avez pas les droits pour consulter les pointages."
          : "Impossible de charger les pointages. Vérifiez la connexion au serveur, puis réessayez.";
      }
    });
  }

  onDateChange() {
    this.loadPointages();
  }

  applyFilters() {
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (!q) {
      this.filteredPointages = [...this.pointages];
      return;
    }
    // Nom, prénom et structure peuvent être nuls : sans ces gardes, une seule
    // valeur manquante faisait échouer le filtre et la page restait vide.
    this.filteredPointages = this.pointages.filter(p =>
      (p.userNom || '').toLowerCase().includes(q)
      || (p.userPrenom || '').toLowerCase().includes(q)
      || (p.structureNom || '').toLowerCase().includes(q)
    );
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
