import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StructureService } from '../../../core/services/structure.service';
import { FactureStructure } from '../../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';

/** Factures d'un poste de santé, groupées pour l'affichage. */
interface PosteBlock {
  posteId: string;
  posteNom: string;
  factures: FactureStructure[];
  totalSencsu: number;
}

const STATUT_LABELS: Record<string, string> = {
  SOUMISE_CS: 'Soumise CS',
  REJETEE_CS: 'Rejetée CS',
  ENVOYEE: 'Envoyée',
  VALIDEE_SR: 'Validée SR',
  REJETEE_SR: 'Rejetée SR',
  VALIDEE_NC: 'Validée NC',
  REJETEE_NC: 'Rejetée NC',
  PAYEE: 'Payée'
};

/**
 * Onglet « Factures postes de santé polarisés » de l'espace structure :
 * factures envoyées par les postes de santé rattachés à la structure,
 * présentées PAR POSTE avec filtres régime, mois et année.
 */
@Component({
  selector: 'app-postes-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatCardModule, MatSnackBarModule],
  templateUrl: './postes-factures.component.html',
  styleUrls: ['./postes-factures.component.css']
})
export class PostesFacturesComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  postes: PosteBlock[] = [];
  loading = true;

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  constructor(
    private structureService: StructureService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    const params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    this.structureService.getFacturesPostes(params).subscribe({
      next: (factures) => {
        this.postes = this.build(factures);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Regroupe les factures par poste de santé, les plus récentes en premier. */
  private build(factures: FactureStructure[]): PosteBlock[] {
    const map = new Map<string, PosteBlock>();
    for (const f of factures) {
      let p = map.get(f.structureSanitaireId);
      if (!p) {
        p = { posteId: f.structureSanitaireId, posteNom: f.structureNom, factures: [], totalSencsu: 0 };
        map.set(f.structureSanitaireId, p);
      }
      p.factures.push(f);
      p.totalSencsu += f.montantTotalSencsu || 0;
    }
    for (const p of map.values()) {
      p.factures.sort((a, b) => (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois));
    }
    return Array.from(map.values()).sort((a, b) => a.posteNom.localeCompare(b.posteNom));
  }

  patientsCount(f: FactureStructure): number {
    const ids = new Set((f.lignes || []).map(l => l.patientId || l.lettreGarantieNumero || `${l.patientPrenom}|${l.patientNom}`));
    return ids.size;
  }

  statutLabel(s: string): string {
    return STATUT_LABELS[s] || s;
  }

  openDetail(f: FactureStructure) {
    this.router.navigate(['/dashboard/factures-structure', f.id]);
  }
}
