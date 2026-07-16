import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { FactureService } from '../../core/services/facture.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { StatsComponent, StatsScope } from '../stats/stats.component';
import { StructureService } from '../../core/services/structure.service';
import { StructureSanitaire, FactureStructure } from '../../core/models/structure.model';
import { UnifiedProvider, UnifiedFacture, mapToUnifiedFacture, ProviderType } from '../../core/models/unified.model';
import { REGIME_OPTIONS, REGIME_LABELS } from '../../core/models/bcsu.model';

interface ProviderSummary {
  provider: UnifiedProvider;
  factures: UnifiedFacture[];
  factureCount: number;
  totalMontant: number;
}

type DrillLevel = 'providers' | 'factures' | 'structure-month-detail';

@Component({
  selector: 'app-regional-factures',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatSnackBarModule,
    StatusBadgeComponent,
    StatsComponent
  ],
  templateUrl: './regional-factures.component.html',
  styleUrls: ['./regional-factures.component.css']
})
export class RegionalFacturesComponent implements OnInit {
  pharmacies: Pharmacie[] = [];
  structures: StructureSanitaire[] = [];
  facturesPharmacie: Facture[] = [];
  facturesStructure: FactureStructure[] = [];

  unifiedFactures: UnifiedFacture[] = [];

  /** Chargement initial des données de la région. */
  loading = true;

  // Niveau de navigation courant
  level: DrillLevel = 'providers';

  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  readonly regimeOptions = REGIME_OPTIONS;
  readonly regimeLabels = REGIME_LABELS;

  // Niveau 1
  providerSummaries: ProviderSummary[] = [];
  providerColumns = ['provider', 'factures', 'montant', 'action'];
  totalRegionMontant = 0;

  // Niveau 2
  selectedProvider: ProviderSummary | null = null;
  factureColumns = ['mois', 'montant', 'statut', 'action'];
  /** Périmètre pour le tableau de bord en drill-down. */
  providerScope: StatsScope | null = null;

  // Filtres niveau 2 (factures d'une pharmacie)
  filterYear = 0;
  filterStatut = '';
  statuts = Object.values(StatutFacture);
  private readonly statutLabels: Record<string, string> = {
    BROUILLON: 'Non envoyée', ENVOYEE: 'Envoyée',
    VALIDEE_SR: 'Validée SR', REJETEE_SR: 'Rejetée SR',
    VALIDEE_NC: 'Validée NC', REJETEE_NC: 'Rejetée NC', PAYEE: 'Payée'
  };

  constructor(
    private authService: AuthService,
    private pharmacieService: PharmacieService,
    private structureService: StructureService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
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

    forkJoin({
      pharmacies: this.pharmacieService.getAll(),
      structures: this.structureService.getStructures(),
      facturesPharmacie: this.factureService.getAll(params),
      facturesStructure: this.structureService.getFactures(params)
    }).subscribe({
      next: (res) => {
        this.pharmacies = res.pharmacies;
        this.structures = res.structures;
        this.facturesPharmacie = res.facturesPharmacie;
        this.facturesStructure = res.facturesStructure;
        
        this.unifiedFactures = [
          ...this.facturesPharmacie.map(f => mapToUnifiedFacture(f, 'PHARMACIE')),
          ...this.facturesStructure.map(f => mapToUnifiedFacture(f, 'STRUCTURE'))
        ];
        
        this.buildProviderSummaries();
        this.loading = false;
      },
      error: (err: any) => {
        this.loading = false;
        this.snackBar.open('Erreur lors du chargement des données de la région: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  buildProviderSummaries() {
    const providers: UnifiedProvider[] = [
      ...this.pharmacies.map(p => ({ id: p.id, nom: p.nom, code: p.code, type: 'PHARMACIE' as ProviderType })),
      ...this.structures.map(s => ({ id: s.id, nom: s.nom, code: s.code, type: 'STRUCTURE' as ProviderType }))
    ];

    this.providerSummaries = providers.map(provider => {
      const pFactures = this.unifiedFactures
        .filter(f => f.providerId === provider.id)
        .sort((a, b) => (a.annee !== b.annee ? b.annee - a.annee : b.mois - a.mois));
      return {
        provider,
        factures: pFactures,
        factureCount: pFactures.length,
        totalMontant: pFactures.reduce((sum, f) => sum + f.montantTotal, 0)
      };
    });
    // Classement « top prestataires » : montant facturé décroissant.
    this.providerSummaries.sort((a, b) => b.totalMontant - a.totalMontant);
    this.totalRegionMontant = this.providerSummaries.reduce((sum, p) => sum + p.totalMontant, 0);
  }

  // ===== Synthèse du tableau de bord (pharmacie vs structure) =====

  get pharmaFactures(): UnifiedFacture[] {
    return this.unifiedFactures.filter(f => f.providerType === 'PHARMACIE');
  }
  get structFactures(): UnifiedFacture[] {
    return this.unifiedFactures.filter(f => f.providerType === 'STRUCTURE');
  }
  get pharmaCount(): number { return this.pharmaFactures.length; }
  get structCount(): number { return this.structFactures.length; }
  get pharmaMontant(): number { return this.pharmaFactures.reduce((s, f) => s + f.montantTotal, 0); }
  get structMontant(): number { return this.structFactures.reduce((s, f) => s + f.montantTotal, 0); }

  /** Répartition par statut (colonnes du tableau de bord). */
  readonly statusBreakdown: { label: string; statuts: string[]; tone: string }[] = [
    { label: 'Reçues',   statuts: ['ENVOYEE'],                 tone: 'recues' },
    { label: 'Validées', statuts: ['VALIDEE_SR', 'VALIDEE_NC'], tone: 'validees' },
    { label: 'Rejetées', statuts: ['REJETEE_SR', 'REJETEE_NC'], tone: 'rejetees' },
    { label: 'Payées',   statuts: ['PAYEE'],                   tone: 'payees' }
  ];

  countByStatus(factures: UnifiedFacture[], statuts: string[]): number {
    return factures.filter(f => statuts.includes(f.statut)).length;
  }

  /** Années présentes dans les factures du prestataire sélectionné. */
  get anneesDispo(): number[] {
    const fs = this.selectedProvider?.factures ?? [];
    return Array.from(new Set(fs.map(f => f.annee))).sort((a, b) => b - a);
  }

  /** Factures du prestataire sélectionné filtrées par année + statut. */
  get displayedFactures(): UnifiedFacture[] {
    let fs = this.selectedProvider?.factures ?? [];
    if (this.filterYear) fs = fs.filter(f => f.annee === this.filterYear);
    if (this.filterStatut) fs = fs.filter(f => f.statut === this.filterStatut);
    return fs;
  }

  statutLabel(s: string): string {
    return this.statutLabels[s] ?? s;
  }

  exportFacture(fs: UnifiedFacture[]) {
    if (!fs || fs.length === 0) return;
    const f = fs[0];
    let ob$;
    let filename = `Facture_${this.getMonthName(f.mois)}_${f.annee}.xlsx`;

    if (f.providerType === 'PHARMACIE') {
      ob$ = this.factureService.exportFactureExcel(f.id);
    } else {
      // Pour une structure, on doit regrouper toutes les factures du mois (et de leur régime)
      // Note : Dans la vue régionale, si on a mélangé des régimes, on prend le premier ou null.
      ob$ = this.structureService.exportGroupeExcel(f.providerId, f.regime || '', f.mois, f.annee);
      filename = `Facture_Globale_${this.getMonthName(f.mois)}_${f.annee}.xlsx`;
    }

    ob$.subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Téléchargement lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  exportFacturePdf(fs: UnifiedFacture[]) {
    if (!fs || fs.length === 0) return;
    const f = fs[0];
    let ob$;
    let filename = `Facture_${this.getMonthName(f.mois)}_${f.annee}.pdf`;

    if (f.providerType === 'PHARMACIE') {
      ob$ = this.factureService.exportFacturePdf(f.id);
    } else {
      ob$ = this.structureService.exportGroupePdf(f.providerId, f.regime || '', f.mois, f.annee);
      filename = `Facture_Globale_${this.getMonthName(f.mois)}_${f.annee}.pdf`;
    }

    ob$.subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Téléchargement PDF lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  exportGlobalRegion() {
    this.factureService.exportGlobalRegionExcel().subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Export_Global_Region.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Téléchargement de l\'export global lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => this.snackBar.open('Erreur lors de l\'export global: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  // Niveau 1 → 2
  selectProvider(ps: ProviderSummary) {
    this.selectedProvider = ps;
    this.providerScope = { type: 'pharmacie', id: ps.provider.id, label: ps.provider.nom };
    this.filterYear = 0;
    this.filterStatut = '';
    this.level = 'factures';
  }

  // Niveau 2 → 3 (Structure only)
  selectedMonthFactures: UnifiedFacture[] = [];
  selectedMonthName: string = '';
  viewStructureMonth(fs: UnifiedFacture[], monthName: string) {
    // Un-group the factures to get the original individual patient factures for this month/regime/statut
    const month = fs[0]?.mois;
    if (!month) return;
    let allFs = this.selectedProvider?.factures ?? [];
    if (this.filterYear) allFs = allFs.filter(f => f.annee === this.filterYear);
    if (this.filterStatut) allFs = allFs.filter(f => f.statut === this.filterStatut);
    
    // We get all individual factures that formed this group
    this.selectedMonthFactures = allFs.filter(f => f.mois === month);
    this.selectedMonthName = monthName;
    this.level = 'structure-month-detail';
  }

  // Navigation arrière
  goBack() {
    if (this.level === 'structure-month-detail') {
      this.level = 'factures';
      this.selectedMonthFactures = [];
      this.selectedMonthName = '';
    } else if (this.level === 'factures') {
      this.goToProviders();
    }
  }

  goToProviders() {
    this.level = 'providers';
    this.selectedProvider = null;
    this.providerScope = null;
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }

  // ===== VUE MENSUELLE =====

  /** Retourne les factures pour un mois donné (filtrées par année et statut). */
  getFacturesForMonth(month: number): UnifiedFacture[] {
    let fs = this.selectedProvider?.factures ?? [];
    if (this.filterYear) fs = fs.filter(f => f.annee === this.filterYear);
    if (this.filterStatut) fs = fs.filter(f => f.statut === this.filterStatut);
    fs = fs.filter(f => f.mois === month);

    if (this.selectedProvider?.provider.type === 'STRUCTURE') {
      const grouped = new Map<string, UnifiedFacture>();
      for (const f of fs) {
        const key = `${f.regime || ''}-${f.statut}`;
        let g = grouped.get(key);
        if (!g) {
          g = { ...f, montantTotal: 0, id: `GRP-${f.regime}-${f.statut}-${f.mois}-${f.annee}` } as UnifiedFacture;
          (g as any)._patients = new Set<string>();
          grouped.set(key, g);
        }
        g.montantTotal += f.montantTotal;
        const firstLine = f.originalFactureStructure?.lignes?.[0];
        const pId = firstLine?.patientId || f.originalFactureStructure?.id;
        if (pId) (g as any)._patients.add(pId);
      }
      return Array.from(grouped.values()).map(g => {
        (g as any)._patientCount = (g as any)._patients.size;
        return g;
      });
    }

    return fs;
  }

  /** Nombre de patients distincts dans une facture. */
  countPatients(f: UnifiedFacture): number {
    if (f.providerType === 'PHARMACIE') {
      const orig = f.originalFacturePharmacie;
      if (!orig || !orig.lignes || orig.lignes.length === 0) return 0;
      const ids = new Set(
        orig.lignes
          .map(l => (l.patientMatricule || l.patientNomPrenom || '').trim().toLowerCase())
          .filter(Boolean)
      );
      return ids.size;
    } else {
      return (f as any)._patientCount || 1;
    }
  }

  /** Génère l'identifiant de facture affiché. */
  getFactureRef(f: UnifiedFacture): string {
    const mm = String(f.mois).padStart(2, '0');
    return f.providerType === 'PHARMACIE' 
      ? `FACT-PHARMA-${f.annee}-${mm}`
      : `FACT-STRUCT-${f.annee}-${mm}`;
  }

  /** Date d'envoi (première action ENVOYEE dans l'historique). */
  getDateEnvoi(f: UnifiedFacture): string | null {
    if (f.providerType === 'PHARMACIE') {
      if (!f.originalFacturePharmacie?.historique) return null;
      const envoi = f.originalFacturePharmacie.historique.find(h => h.statut === StatutFacture.ENVOYEE);
      return envoi ? envoi.date : null;
    } else {
      // TODO: Implement history for FactureStructure if needed
      return f.date ?? null;
    }
  }

  /** Le statut affiché sous forme de label pour le badge de la vue mensuelle. */
  getStatutDateLabel(f: UnifiedFacture): string {
    const dateEnvoi = this.getDateEnvoi(f);
    if (f.statut === 'ENVOYEE' && dateEnvoi) {
      return `Envoyé le ${dateEnvoi.substring(0, 10)}`;
    }
    return this.statutLabel(f.statut);
  }
}
