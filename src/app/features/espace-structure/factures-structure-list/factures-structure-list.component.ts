import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StructureService } from '../../../core/services/structure.service';
import { FactureStructure, LigneFactureStructure } from '../../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';
import { ConfirmService } from '../../../core/services/confirm.service';

interface FactureGroup {
  titre: string;
  regime: string;
  mois: number;
  annee: number;
  factures: FactureStructure[];
  brouillons: number;
  // Pagination
  currentPage: number;
  pageSize: number;
}

interface MonthGroup {
  titre: string;
  mois: number;
  annee: number;
  regimes: FactureGroup[];
}

interface PatientPrestations {
  nomComplet: string;
  lignes: LigneFactureStructure[];
}

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: 'Non envoyée',
  ENVOYEE: 'Envoyée',
  VALIDEE_SR: 'Validée SR',
  REJETEE_SR: 'Rejetée SR',
  VALIDEE_NC: 'Validée NC',
  REJETEE_NC: 'Rejetée NC',
  PAYEE: 'Payée'
};

const STATUT_ICONS: Record<string, string> = {
  BROUILLON: 'edit_note',
  ENVOYEE: 'send',
  VALIDEE_SR: 'task_alt',
  REJETEE_SR: 'cancel',
  VALIDEE_NC: 'verified',
  REJETEE_NC: 'cancel',
  PAYEE: 'payments'
};

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-factures-structure-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './factures-structure-list.component.html',
  styleUrls: ['./factures-structure-list.component.css']
})
export class FacturesStructureListComponent implements OnInit {
  @Input() factures: FactureStructure[] = [];
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  private readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  
  monthGroups: MonthGroup[] = [];
  loading = true;
  envoiEnCours: string | null = null;
  exporting: string | null = null;
  expandedFactureIds = new Set<string>();

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];
  
  constructor(
    private router: Router,
    private structureService: StructureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    let params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    this.structureService.getFactures(params).subscribe({
      next: (data) => {
        this.factures = data;
        this.monthGroups = this.groupByMonth(this.factures);
        this.loading = false;
      },
      error: (err) => {
        this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
        this.loading = false;
      }
    });
  }

  /** Regroupe d'abord par mois, puis par régime à l'intérieur de chaque mois. */
  groupByMonth(factures: FactureStructure[]): MonthGroup[] {
    const monthMap = new Map<string, MonthGroup>();
    for (const f of factures) {
      const monthKey = `${f.annee}-${f.mois}`;
      let month = monthMap.get(monthKey);
      if (!month) {
        month = {
          titre: `${this.moisNoms[f.mois] || f.mois} ${f.annee}`,
          mois: f.mois,
          annee: f.annee,
          regimes: []
        };
        monthMap.set(monthKey, month);
      }

      const regimeKey = f.regime;
      let regimeGroup = month.regimes.find(r => r.regime === regimeKey);
      if (!regimeGroup) {
        regimeGroup = {
          titre: this.regimeLabels[f.regime] || f.regime,
          regime: f.regime,
          mois: f.mois,
          annee: f.annee,
          factures: [],
          brouillons: 0,
          currentPage: 1,
          pageSize: 10
        };
        month.regimes.push(regimeGroup);
      }
      regimeGroup.factures.push(f);
      if (f.statut === 'BROUILLON') regimeGroup.brouillons++;
    }

    // Tri : mois/année les plus récents d'abord.
    return Array.from(monthMap.values()).sort((a, b) => (b.annee - a.annee) || (b.mois - a.mois));
  }

  getMoisNom(mois: number): string {
    return this.moisNoms[mois] || '';
  }

  /** Nom complet du/des patient(s) d'une facture, pour l'aperçu de la ligne. */
  patientsApercu(f: FactureStructure): string {
    const groups = this.getPatientGroups(f);
    if (groups.length === 0) return '—';
    if (groups.length === 1) return groups[0].nomComplet;
    return `${groups[0].nomComplet} +${groups.length - 1} autre${groups.length - 1 > 1 ? 's' : ''}`;
  }

  openDetail(id: string) {
    this.router.navigate(['/dashboard/factures-structure', id]);
  }

  envoyerGroupe(group: FactureGroup, event: Event) {
    event.stopPropagation();
    const key = this.cleGroupe(group);
    this.confirm.ask({
      title: 'Envoyer la facture mensuelle',
      message: `Envoyer les ${group.brouillons} facture(s) en brouillon de « ${group.titre} » au service régional ? Vous ne pourrez plus les modifier.`,
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.envoiEnCours = key;
      this.structureService.envoyerGroupe(group.regime, group.mois, group.annee).subscribe({
        next: (envoyees) => {
          this.envoiEnCours = null;
          this.snackBar.open(`${envoyees.length} facture(s) transmise(s) au service régional`, 'Fermer', { duration: 4000 });
          this.load();
        },
        error: (err) => {
          this.envoiEnCours = null;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  exporterGroupe(group: FactureGroup, event: Event) {
    event.stopPropagation();
    if (group.factures.length === 0) return;
    this.exporting = this.cleGroupe(group);
    const structureId = group.factures[0].structureSanitaireId;
    
    this.structureService.exportGroupeExcel(structureId, group.regime, group.mois, group.annee).subscribe({
      next: (blob: Blob) => {
        this.exporting = null;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Factures_${group.regime}_${group.mois}_${group.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.exporting = null;
        this.snackBar.open('Erreur lors de l\'export: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  exporterGroupePdf(group: FactureGroup, event: Event) {
    event.stopPropagation();
    if (group.factures.length === 0) return;
    this.exporting = this.cleGroupe(group);
    const structureId = group.factures[0].structureSanitaireId;
    
    this.structureService.exportGroupePdf(structureId, group.regime, group.mois, group.annee).subscribe({
      next: (blob: Blob) => {
        this.exporting = null;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Factures_${group.regime}_${group.mois}_${group.annee}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.exporting = null;
        this.snackBar.open('Erreur lors de l\'export: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  cleGroupe(group: FactureGroup): string {
    return `${group.regime}|${group.mois}|${group.annee}`;
  }

  /** Regroupe les lignes d'une facture par patient, avec la liste de leurs prestations. */
  getPatientGroups(f: FactureStructure): PatientPrestations[] {
    const map = new Map<string, PatientPrestations>();
    for (const l of f.lignes) {
      const key = l.patientId || `${l.patientNom}|${l.patientPrenom}`;
      let g = map.get(key);
      if (!g) {
        const nomComplet = `${l.patientPrenom || ''} ${l.patientNom || ''}`.trim();
        g = { nomComplet: nomComplet || 'Patient non renseigné', lignes: [] };
        map.set(key, g);
      }
      g.lignes.push(l);
    }
    return Array.from(map.values());
  }

  /** Nombre total de prestations (lignes de facturation) d'une facture. */
  prestationsCount(f: FactureStructure): number {
    return f.lignes.length;
  }

  statutLabel(statut: string): string {
    return STATUT_LABELS[statut] || statut;
  }

  statutIcon(statut: string): string {
    return STATUT_ICONS[statut] || 'info';
  }

  // --- Pagination pour FactureGroup ---
  getPaginatedFactures(g: FactureGroup): FactureStructure[] {
    const start = (g.currentPage - 1) * g.pageSize;
    return g.factures.slice(start, start + g.pageSize);
  }

  getTotalPages(g: FactureGroup): number {
    return Math.ceil(g.factures.length / g.pageSize);
  }

  getPageNumbers(g: FactureGroup): number[] {
    const pages = [];
    for (let i = 1; i <= this.getTotalPages(g); i++) {
      pages.push(i);
    }
    return pages;
  }

  goToPage(g: FactureGroup, page: number) {
    if (page >= 1 && page <= this.getTotalPages(g)) {
      g.currentPage = page;
    }
  }

  Math = Math;
}
