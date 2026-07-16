import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StructureService } from '../../core/services/structure.service';
import { FeuilleSoinsService } from '../../core/services/feuille-soins.service';
import { FactureStructure, LigneFactureStructure } from '../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../core/models/bcsu.model';

/** Un patient regroupé dans une facture mensuelle (toutes ses prestations du mois). */
interface PatientBlock {
  /** Clé de regroupement stable (patientId, sinon lettre, sinon nom). */
  key: string;
  patientId?: string;
  nomComplet: string;
  matricule: string;
  lettreNumero?: string;
  feuilleSoinsId?: string;
  feuilleSoinsNumero?: string;
  lignes: LigneFactureStructure[];
  totalSencsu: number;
  expanded: boolean;
}

/** Facture mensuelle consolidée = (structure, régime, mois) → tous les patients. */
interface MonthInvoice {
  key: string;
  structureId: string;
  structureNom: string;
  regime: string;
  regimeLabel: string;
  mois: number;
  annee: number;
  label: string;
  patients: PatientBlock[];
  nbPatients: number;
  totalSencsu: number;
  hasTicket: boolean;
}

/** Une structure et ses factures mensuelles consolidées. */
interface StructureBlock {
  structureId: string;
  structureNom: string;
  invoices: MonthInvoice[];
  totalSencsu: number;
}

const STATUT_LABELS: Record<string, string> = {
  BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
  VALIDEE_SR: 'Validée CSUR', REJETEE_SR: 'Rejetée CSUR',
  VALIDEE_NC: 'Validée Centrale', REJETEE_NC: 'Rejetée Centrale', PAYEE: 'Payée'
};

/**
 * Vue régionale des factures de structures, CONSOLIDÉES par mois :
 * une seule « facture du mois » par structure + régime, regroupant TOUS les
 * patients (chaque FactureStructure sous-jacente = un patient). Chaque patient
 * est dépliable (prestations) avec sa feuille de soins et un lien vers son
 * dossier complet (bon de commande, ticket de caisse, feuille de soins).
 */
@Component({
  selector: 'app-regional-structures-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './regional-structures-factures.component.html',
  styleUrls: ['./regional-structures-factures.component.css']
})
export class RegionalStructuresFacturesComponent implements OnInit, OnChanges {
  /** Statuts autorisés (filtre de l'onglet : Reçues/Validées/Rejetées/Payées). */
  @Input() allowedStatuses?: string[];

  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  private readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  private factures: FactureStructure[] = [];
  structures: StructureBlock[] = [];
  loading = true;
  exporting: string | null = null;

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  constructor(
    private structureService: StructureService,
    private feuilleSoinsService: FeuilleSoinsService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.load();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['allowedStatuses'] && !changes['allowedStatuses'].firstChange) {
      this.structures = this.build(this.factures);
    }
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
        this.structures = this.build(this.factures);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur lors du chargement des factures : ' + (err.error?.message || err.message),
          'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Structure → (régime, mois) → patients. */
  private build(factures: FactureStructure[]): StructureBlock[] {
    const allowed = this.allowedStatuses;
    const filtered = allowed && allowed.length
      ? factures.filter(f => allowed.includes(f.statut))
      : factures;

    const structMap = new Map<string, StructureBlock>();
    const invoiceMap = new Map<string, MonthInvoice>();

    for (const f of filtered) {
      // Bloc structure
      let sb = structMap.get(f.structureSanitaireId);
      if (!sb) {
        sb = { structureId: f.structureSanitaireId, structureNom: f.structureNom, invoices: [], totalSencsu: 0 };
        structMap.set(f.structureSanitaireId, sb);
      }

      // Facture mensuelle consolidée = structure + régime + mois + année
      const invKey = `${f.structureSanitaireId}|${f.regime}|${f.annee}|${f.mois}`;
      let inv = invoiceMap.get(invKey);
      if (!inv) {
        inv = {
          key: invKey,
          structureId: f.structureSanitaireId,
          structureNom: f.structureNom,
          regime: f.regime,
          regimeLabel: this.regimeLabels[f.regime] || f.regime,
          mois: f.mois,
          annee: f.annee,
          label: `${this.moisNoms[f.mois] || f.mois} ${f.annee}`,
          patients: [],
          nbPatients: 0,
          totalSencsu: 0,
          hasTicket: false
        };
        invoiceMap.set(invKey, inv);
        sb.invoices.push(inv);
      }
      if (f.ticketCaisse) inv.hasTicket = true;

      // Agrège les patients (une FactureStructure = un patient, mais on reste robuste)
      this.mergePatients(inv, f.lignes || []);
    }

    // Totaux + tri
    const blocks = Array.from(structMap.values());
    for (const sb of blocks) {
      for (const inv of sb.invoices) {
        inv.nbPatients = inv.patients.length;
        inv.totalSencsu = inv.patients.reduce((s, p) => s + p.totalSencsu, 0);
      }
      // Plus récent d'abord
      sb.invoices.sort((a, b) => (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois) || a.regimeLabel.localeCompare(b.regimeLabel));
      sb.totalSencsu = sb.invoices.reduce((s, inv) => s + inv.totalSencsu, 0);
    }
    return blocks.sort((a, b) => a.structureNom.localeCompare(b.structureNom));
  }

  /** Ajoute/complète les blocs patients d'une facture mensuelle à partir de ses lignes. */
  private mergePatients(inv: MonthInvoice, lignes: LigneFactureStructure[]) {
    for (const l of lignes) {
      const key = l.patientId || l.lettreGarantieNumero || `${l.patientPrenom || ''}|${l.patientNom || ''}`;
      let p = inv.patients.find(pb => pb.key === key);
      if (!p) {
        p = {
          key,
          patientId: l.patientId,
          nomComplet: `${l.patientPrenom || ''} ${l.patientNom || ''}`.trim() || 'Patient non renseigné',
          matricule: l.patientMatricule || 'Sans matricule',
          lettreNumero: l.lettreGarantieNumero,
          feuilleSoinsId: l.feuilleSoinsId,
          feuilleSoinsNumero: l.feuilleSoinsNumero,
          lignes: [],
          totalSencsu: 0,
          expanded: false
        };
        inv.patients.push(p);
      }
      // Complète la feuille de soins si absente
      if (!p.feuilleSoinsId && l.feuilleSoinsId) {
        p.feuilleSoinsId = l.feuilleSoinsId;
        p.feuilleSoinsNumero = l.feuilleSoinsNumero;
      }
      p.lignes.push(l);
      p.totalSencsu += l.montantSencsu || 0;
    }
  }

  togglePatient(p: PatientBlock, event: Event) {
    event.stopPropagation();
    p.expanded = !p.expanded;
  }

  statutLabel(s: string): string {
    return STATUT_LABELS[s] ?? s;
  }

  /** Ouvre le dossier consolidé du patient (lettre, bon de commande, ticket, feuille). */
  openDossier(p: PatientBlock, event: Event) {
    event.stopPropagation();
    if (p.patientId) {
      this.router.navigate(['/dashboard/patients', p.patientId]);
    } else {
      this.snackBar.open('Dossier patient indisponible (identifiant manquant).', 'Fermer', { duration: 3000 });
    }
  }

  /** Télécharge la feuille de soins du patient. */
  imprimerFeuille(p: PatientBlock, event: Event) {
    event.stopPropagation();
    if (!p.feuilleSoinsId) return;
    const numero = p.feuilleSoinsNumero || p.feuilleSoinsId;
    this.feuilleSoinsService.exportPdf(p.feuilleSoinsId).subscribe({
      next: (blob: Blob) => this.downloadBlob(blob, `Feuille_Soins_${numero}.pdf`),
      error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  exporterExcel(inv: MonthInvoice, event: Event) {
    event.stopPropagation();
    this.exporting = inv.key;
    this.structureService.exportGroupeExcel(inv.structureId, inv.regime, inv.mois, inv.annee).subscribe({
      next: (blob: Blob) => { this.exporting = null; this.downloadBlob(blob, `Facture_${inv.structureNom}_${inv.regime}_${inv.mois}_${inv.annee}.xlsx`); },
      error: (err) => { this.exporting = null; this.snackBar.open('Erreur export : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
    });
  }

  exporterPdf(inv: MonthInvoice, event: Event) {
    event.stopPropagation();
    this.exporting = inv.key;
    this.structureService.exportGroupePdf(inv.structureId, inv.regime, inv.mois, inv.annee).subscribe({
      next: (blob: Blob) => { this.exporting = null; this.downloadBlob(blob, `Facture_${inv.structureNom}_${inv.regime}_${inv.mois}_${inv.annee}.pdf`); },
      error: (err) => { this.exporting = null; this.snackBar.open('Erreur export : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
    });
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  get isEmpty(): boolean {
    return !this.loading && this.structures.every(s => s.invoices.length === 0);
  }
}
