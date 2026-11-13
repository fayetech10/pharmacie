import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SrGestionService, StatsRegimeSR, StructureEnregistrementRow } from '../services/sr-gestion.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';

interface SaisieStructureTypeStats {
  type: 'PS' | 'CS' | 'EPS';
  libelle: string;
  icone: string;
  nombreActif: number;
  nombreAvecSaisie: number;
  montantSaisi: number;
  tauxSaisie: number;
}

@Component({
  selector: 'app-regional-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './regional-dashboard.component.html',
  styleUrls: ['./regional-dashboard.component.css']
})
export class RegionalDashboardComponent implements OnInit {
  annee = new Date().getFullYear();
  trimestre: number | null = null;
  mois: number | null = null;

  anneesDispo: number[] = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);
  trimestres = [
    { valeur: null, label: 'Toute l’année' },
    { valeur: 1, label: 'Trimestre 1 (Jan - Mar)' },
    { valeur: 2, label: 'Trimestre 2 (Avr - Juin)' },
    { valeur: 3, label: 'Trimestre 3 (Juil - Sep)' },
    { valeur: 4, label: 'Trimestre 4 (Oct - Déc)' }
  ];

  moisListe = [
    { num: null, nom: 'Tous les mois' },
    { num: 1, nom: 'Janvier' },
    { num: 2, nom: 'Février' },
    { num: 3, nom: 'Mars' },
    { num: 4, nom: 'Avril' },
    { num: 5, nom: 'Mai' },
    { num: 6, nom: 'Juin' },
    { num: 7, nom: 'Juillet' },
    { num: 8, nom: 'Août' },
    { num: 9, nom: 'Septembre' },
    { num: 10, nom: 'Octobre' },
    { num: 11, nom: 'Novembre' },
    { num: 12, nom: 'Décembre' }
  ];

  statsRegimes: StatsRegimeSR[] = [];
  structuresSuivies: StructureEnregistrementRow[] = [];
  loading = false;
  loadingStructures = false;

  // Totaux globaux
  totalFacture = 0;
  totalSencsu = 0;
  totalSencsuTraite = 0;
  totalSencsuEnAttente = 0;
  totalBeneficiaires = 0;
  tauxTraitementSencsu = 0;
  messageErreur = '';

  private destroyRef = inject(DestroyRef);

  get totalFacturesNombre(): number {
    return this.statsRegimes.reduce((s, r) => s + r.nombreFactures, 0);
  }

  get regimesAvecActivite(): boolean {
    return this.statsRegimes.some(r => r.nombreFactures > 0);
  }

  get periodeSansFacture(): boolean {
    return !this.loading && this.statsRegimes.length > 0 && !this.regimesAvecActivite;
  }

  get saisiesParTypeStructure(): SaisieStructureTypeStats[] {
    const types: Array<Pick<SaisieStructureTypeStats, 'type' | 'libelle' | 'icone'>> = [
      { type: 'PS', libelle: 'Postes de santé', icone: 'medical_services' },
      { type: 'CS', libelle: 'Centres de santé', icone: 'local_hospital' },
      { type: 'EPS', libelle: 'Hôpitaux (EPS)', icone: 'domain' }
    ];

    return types.map(type => {
      const structures = this.structuresSuivies.filter(s => s.actif && s.type.toUpperCase() === type.type);
      const saisissantes = structures.filter(s => s.saisieActive);
      return {
        ...type,
        nombreActif: structures.length,
        nombreAvecSaisie: saisissantes.length,
        montantSaisi: saisissantes.reduce((total, structure) => total + structure.montantTotal, 0),
        tauxSaisie: this.calculerPourcentage(saisissantes.length, structures.length)
      };
    });
  }

  get totalStructuresAvecSaisie(): number {
    return this.saisiesParTypeStructure.reduce((total, type) => total + type.nombreAvecSaisie, 0);
  }

  constructor(private srService: SrGestionService, private factureEvents: FactureEventsService) {}

  ngOnInit(): void {
    this.chargerDonnees();
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.chargerDonnees(false));
  }

  chargerDonnees(showLoader = true): void {
    if (showLoader) this.loading = true;
    this.messageErreur = '';
    this.chargerSuiviStructures();
    this.srService.calculerTableauDeBord({
      annee: this.annee,
      trimestre: this.trimestre ?? undefined,
      mois: this.mois ?? undefined
    }).subscribe({
      next: (res) => {
        this.statsRegimes = res;
        this.totalFacture = res.reduce((s, r) => s + r.montantFacture, 0);
        this.totalSencsu = res.reduce((s, r) => s + r.montantSencsuTotal, 0);
        this.totalSencsuTraite = res.reduce((s, r) => s + r.montantSencsuTraite, 0);
        this.totalSencsuEnAttente = res.reduce((s, r) => s + r.montantSencsuEnAttente, 0);
        this.totalBeneficiaires = res.reduce((s, r) => s + r.nombreBeneficiaires, 0);
        this.tauxTraitementSencsu = this.totalSencsu > 0 ? Math.round((this.totalSencsuTraite / this.totalSencsu) * 100) : 0;
        this.loading = false;
      },
      error: (err) => {
        this.messageErreur = err?.error?.message || 'Les données du tableau de bord sont indisponibles.';
        this.loading = false;
      }
    });
  }

  private chargerSuiviStructures(): void {
    this.loadingStructures = true;
    this.srService.getSuiviEnregistrement(this.annee, this.mois ?? undefined, this.trimestre ?? undefined).subscribe({
      next: res => {
        this.structuresSuivies = res.structures || [];
        this.loadingStructures = false;
      },
      error: () => {
        this.structuresSuivies = [];
        this.loadingStructures = false;
      }
    });
  }

  onFiltreChange(): void {
    this.chargerDonnees();
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }

  calculerPourcentage(part: number, total: number): number {
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
  }
}
