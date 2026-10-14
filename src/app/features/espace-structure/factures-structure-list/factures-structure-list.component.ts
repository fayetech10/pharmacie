import { Component, OnInit, ViewChild, ElementRef, DestroyRef, inject, Input } from '@angular/core';
import { SkeletonListComponent } from '../../../shared/skeleton-list/skeleton-list.component';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StructureService } from '../../../core/services/structure.service';
import { FactureStructure, LigneFactureStructure } from '../../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';

interface FactureGroup {
  titre: string;
  regime: string;
  mois: number;
  annee: number;
  factures: FactureStructure[];
  brouillons: number;
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



import { FormsModule } from '@angular/forms';
import { RegimeBadgeComponent } from '../../../shared/regime-badge/regime-badge.component';
import { apparenceStatut } from '../../../core/models/statuts';
import { telecharger } from '../../espace-poste/poste-facturation';
import { finDuMoisAtteinte } from '../../../core/utils/fin-de-mois';

import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
@Component({
  selector: 'app-factures-structure-list',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, RegimeBadgeComponent, CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatMenuModule, MatSnackBarModule, SkeletonListComponent],
  templateUrl: './factures-structure-list.component.html'
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
  /** Facture dont l'export Excel/PDF est en cours (sablier sur son bouton ⋮). */
  exportFacture: string | null = null;
  expandedFactureIds = new Set<string>();

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];
  
  constructor(
    private router: Router,
    private structureService: StructureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    public auth: AuthService
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
          brouillons: 0
        };
        month.regimes.push(regimeGroup);
      }
      regimeGroup.factures.push(f);
      if (f.statut === 'BROUILLON' || f.statut === 'REJETEE_SR' || f.statut === 'REJETEE_CS') regimeGroup.brouillons++;
    }

    // Tri : mois/année les plus récents d'abord.
    return Array.from(monthMap.values()).sort((a, b) => (b.annee - a.annee) || (b.mois - a.mois));
  }

  getMoisNom(mois: number): string {
    return this.moisNoms[mois] || '';
  }

  /** Nombre de patients distincts compilés dans la facture mensuelle. */
  patientsCount(f: FactureStructure): number {
    return this.getPatientGroups(f).length;
  }

  openDetail(id: string) {
    this.router.navigate(['/dashboard/factures-structure', id]);
  }

  exporterFacture(f: FactureStructure, format: 'excel' | 'pdf') {
    this.exportFacture = f.id;
    const export$ = format === 'excel'
      ? this.structureService.exportFactureExcel(f.id)
      : this.structureService.exportFacturePdf(f.id);
    export$.subscribe({
      next: (blob: Blob) => {
        this.exportFacture = null;
        telecharger(blob, `Facture_${f.numero}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      },
      error: (err) => {
        this.exportFacture = null;
        this.snackBar.open('Erreur lors de l\'export: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  envoyerGroupe(group: FactureGroup, event: Event) {
    event.stopPropagation();
    const key = this.cleGroupe(group);
    // Un poste n'envoie au district que le 0-5 ans (09/10/2026) ; les autres régimes vont au SR.
    const destination = this.auth.isPosteDeSante() && group.regime === 'ZERO_CINQ_ANS'
      ? 'au district' : 'au service régional';
    this.confirm.ask({
      title: 'Envoyer la facture mensuelle',
      message: `Envoyer les ${group.brouillons} facture(s) en brouillon de « ${group.titre} » ${destination} ? Vous ne pourrez plus les modifier.`,
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.envoiEnCours = key;
      this.structureService.envoyerGroupe(group.regime, group.mois, group.annee).subscribe({
        next: (envoyees) => {
          this.envoiEnCours = null;
          this.snackBar.open(`${envoyees.length} facture(s) transmise(s) ${destination}`, 'Fermer', { duration: 4000 });
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

  /** « Envoyer » n'apparaît qu'à la fin du mois du groupe. */
  finDuMois(group: FactureGroup): boolean {
    return finDuMoisAtteinte(group.mois, group.annee);
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
    return apparenceStatut(statut).libelle;
  }

  statutIcon(statut: string): string {
    return apparenceStatut(statut).icone;
  }

}

