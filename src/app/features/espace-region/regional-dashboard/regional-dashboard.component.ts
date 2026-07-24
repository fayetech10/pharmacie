import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { StatsService } from '../../../core/services/stats.service';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';
import { StatsData, MonthData } from '../../../core/models/stats.model';

/** Segment du bandeau « où en sont les factures » (part-à-tout). */
interface PipelineSegment {
  key: string;
  label: string;
  icon: string;
  color: string;
  statuts: string[];
  count: number;
  share: number;
}

/** Tuile d'indicateur : libellé · valeur · évolution optionnelle · destination au clic. */
interface KpiTile {
  label: string;
  value: string;
  suffix?: string;
  icon: string;
  hint: string;
  delta?: number | null;
  deltaLabel?: string;
  /** Vue ouverte au clic sur la tuile. */
  go: () => void;
  /** Intitulé de la destination (infobulle et libellé accessible). */
  goLabel: string;
}

/** Ligne du classement des prestataires. */
interface TopRow {
  id: string;
  nom: string;
  montant: number;
  factures: number;
  share: number;
}

@Component({
  selector: 'app-regional-dashboard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatTooltipModule,
    MatSnackBarModule, BaseChartDirective
  ],
  templateUrl: './regional-dashboard.component.html',
  styleUrls: ['./regional-dashboard.component.css']
})
export class RegionalDashboardComponent implements OnInit {

  // ───────────────────────────────────────────────────────────────────────────
  // Palette du tableau de bord.
  //
  // Validée avec le validateur de la méthode dataviz sur surface blanche
  // (couleur des cartes) — ne pas modifier une valeur sans revalider :
  //   • Bandeau de statuts (segments adjacents) : CVD ΔE 9.3 (cible ≥ 8),
  //     vision normale ΔE 23.3 (plancher ≥ 15), contraste ≥ 3:1 pour les 4.
  //   • Émeraude / gris de l'évolution : forme « emphase » (1 teinte + gris),
  //     l'accent porte l'année courante, le gris le contexte (4,97:1).
  // ───────────────────────────────────────────────────────────────────────────
  private readonly ACCENT = '#047857';   // émeraude de marque — série courante
  private readonly CONTEXT = '#667085';  // gris neutre — série de contexte
  private readonly ACCENT_WASH = 'rgba(4, 120, 87, 0.10)'; // aplat 10 %
  private readonly GRID = '#E4E7EC';     // hairline discrète
  private readonly INK_2 = '#475467';    // texte d'axe (7,69:1)
  private readonly SURFACE = '#FFFFFF';

  stats: StatsData | null = null;
  /** Premier chargement (aucune donnée) : squelette. Rechargement : opacité réduite. */
  loading = true;
  refreshing = false;
  error = false;

  annee = new Date().getFullYear();
  anneesDispo: number[] = [];
  /** Vue tabulaire de l'évolution (jumelle accessible du graphique). */
  showTable = false;

  kpis: KpiTile[] = [];
  pipeline: PipelineSegment[] = [];
  pipelineTotal = 0;
  topRows: TopRow[] = [];

  /** 12 mois de l'année courante et de la précédente (normalisés). */
  moisCourant: number[] = new Array(12).fill(0);
  moisPrecedent: number[] = new Array(12).fill(0);

  readonly monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  /**
   * Définition du parcours d'une facture, dans l'ordre du circuit régional.
   * `key` reprend volontairement les clés de groupe de l'espace régional
   * (`StatutGroupKey`) : elle est passée telle quelle en paramètre d'URL pour
   * pré-sélectionner le bon filtre dans l'onglet « Factures pharmacies ».
   */
  private readonly pipelineDef: Omit<PipelineSegment, 'count' | 'share'>[] = [
    { key: 'RECUES',   label: 'À traiter', icon: 'move_to_inbox', color: '#B45309', statuts: ['ENVOYEE'] },
    { key: 'VALIDEES', label: 'Validées',  icon: 'task_alt',      color: '#059669', statuts: ['VALIDEE_SR', 'VALIDEE_NC'] },
    { key: 'PAYEES',   label: 'Payées',    icon: 'paid',          color: '#1D4ED8', statuts: ['PAYEE'] },
    { key: 'REJETEES', label: 'Rejetées',  icon: 'cancel',        color: '#DC2626', statuts: ['REJETEE_SR', 'REJETEE_NC'] }
  ];

  private destroyRef = inject(DestroyRef);

  constructor(
    private statsService: StatsService,
    private factureService: FactureService,
    private authService: AuthService,
    private factureEvents: FactureEventsService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const now = new Date().getFullYear();
    this.anneesDispo = [now, now - 1, now - 2, now - 3];
    this.load();

    // Toute décision prise ailleurs (validation, paiement) réactualise le tableau.
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }

  private get regionId(): string | null {
    return this.authService.getCurrentUser()?.regionId ?? null;
  }

  load(): void {
    const regionId = this.regionId;
    if (!regionId) {
      this.loading = false;
      this.error = true;
      return;
    }

    // Rechargement : on garde le rendu précédent (pas de squelette qui clignote).
    if (this.stats) this.refreshing = true; else this.loading = true;
    this.error = false;

    forkJoin({
      stats: this.statsService.getStatsRegional(regionId).pipe(catchError(() => of(null))),
      courant: this.statsService.getEvolutionMensuelle(this.annee, regionId).pipe(catchError(() => of([] as MonthData[]))),
      precedent: this.statsService.getEvolutionMensuelle(this.annee - 1, regionId).pipe(catchError(() => of([] as MonthData[])))
    }).subscribe({
      next: ({ stats, courant, precedent }) => {
        if (!stats) {
          this.error = true;
          this.loading = false;
          this.refreshing = false;
          return;
        }
        this.stats = stats;
        this.moisCourant = this.toSerie(courant);
        this.moisPrecedent = this.toSerie(precedent);
        this.buildPipeline(stats);
        this.buildKpis(stats);
        this.buildTop(stats);
        this.loading = false;
        this.refreshing = false;
      },
      error: () => {
        this.error = true;
        this.loading = false;
        this.refreshing = false;
      }
    });
  }

  onAnneeChange(): void {
    this.load();
  }

  /** Normalise une évolution mensuelle sur 12 cases (mois absent = 0). */
  private toSerie(data: MonthData[]): number[] {
    const serie = new Array(12).fill(0);
    for (const m of data || []) {
      if (m.mois >= 1 && m.mois <= 12) serie[m.mois - 1] = m.montantTotal || 0;
    }
    return serie;
  }

  // ───────────────────────────── Indicateurs ─────────────────────────────

  private buildPipeline(s: StatsData): void {
    const parStatut = s.facturesParStatut || {};
    const segments = this.pipelineDef.map(def => ({
      ...def,
      count: def.statuts.reduce((sum, st) => sum + (parStatut[st] || 0), 0),
      share: 0
    }));
    const total = segments.reduce((sum, seg) => sum + seg.count, 0);
    for (const seg of segments) {
      seg.share = total > 0 ? (seg.count / total) * 100 : 0;
    }
    this.pipeline = segments;
    this.pipelineTotal = total;
  }

  private buildKpis(s: StatsData): void {
    const totalCourant = this.moisCourant.reduce((a, b) => a + b, 0);
    const totalPrecedent = this.moisPrecedent.reduce((a, b) => a + b, 0);
    const delta = totalPrecedent > 0
      ? ((totalCourant - totalPrecedent) / totalPrecedent) * 100
      : null;

    this.kpis = [
      {
        label: 'Montant facturé',
        value: this.compact(s.montantTotal || 0),
        suffix: 'FCFA',
        icon: 'receipt_long',
        hint: 'Montant total facturé par les prestataires de la région.',
        delta,
        deltaLabel: `vs ${this.annee - 1}`,
        go: () => this.ouvrirFactures(),
        goLabel: 'Voir toutes les factures'
      },
      {
        label: 'Factures traitées',
        value: this.nombre(s.nombreFactures || 0),
        icon: 'fact_check',
        hint: 'Nombre de factures reçues par la région, tous statuts confondus.',
        go: () => this.ouvrirFactures(),
        goLabel: 'Voir toutes les factures'
      },
      {
        label: 'Patients couverts',
        value: this.nombre(s.totalPatients || 0),
        icon: 'groups',
        hint: 'Bénéficiaires distincts pris en charge sur la période.',
        go: () => this.ouvrirPatients(),
        goLabel: 'Voir les dossiers patients'
      },
      {
        label: 'Délai moyen de traitement',
        value: this.nombre(Math.round(s.delaiMoyenTraitementJours || 0)),
        suffix: 'jours',
        icon: 'schedule',
        hint: 'Délai moyen entre la réception d\'une facture et sa décision.',
        go: () => this.allerFactures('RECUES'),
        goLabel: 'Voir les factures en attente de décision'
      }
    ];
  }

  private buildTop(s: StatsData): void {
    const top = (s.topPharmacies || []).slice(0, 6);
    const max = top.reduce((m, p) => Math.max(m, p.montant || 0), 0);
    this.topRows = top.map(p => ({
      id: p.id,
      nom: p.nom,
      montant: p.montant || 0,
      factures: p.nombreFactures || 0,
      share: max > 0 ? ((p.montant || 0) / max) * 100 : 0
    }));
  }

  // ───────────────────────────── Graphique ─────────────────────────────

  /**
   * Évolution mensuelle — forme « emphase » : l'année courante porte l'accent,
   * l'année précédente sert de contexte en gris. Une seule échelle (jamais de
   * double axe), grille en hairline pleine, valeurs lisibles aussi en tableau.
   */
  get lineData(): ChartConfiguration<'line'>['data'] {
    return {
      labels: this.monthLabels,
      datasets: [
        {
          data: this.moisPrecedent,
          label: `${this.annee - 1}`,
          borderColor: this.CONTEXT,
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.35,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 4.5,
          pointBackgroundColor: this.CONTEXT,
          pointHoverBorderColor: this.SURFACE,
          pointHoverBorderWidth: 2
        },
        {
          data: this.moisCourant,
          label: `${this.annee}`,
          borderColor: this.ACCENT,
          backgroundColor: this.ACCENT_WASH,
          borderWidth: 2,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4.5,
          pointBackgroundColor: this.ACCENT,
          pointHoverBorderColor: this.SURFACE,
          pointHoverBorderWidth: 2
        }
      ]
    };
  }

  get lineOptions(): ChartConfiguration<'line'>['options'] {
    const compact = (v: number) => this.compact(v);
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 18,
            boxHeight: 2,
            color: this.INK_2,
            font: { size: 12, weight: 500 }
          }
        },
        tooltip: {
          backgroundColor: '#101828',
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          usePointStyle: true,
          callbacks: {
            label: (ctx: any) => ` ${ctx.dataset.label} · ${this.nombre(ctx.parsed.y)} FCFA`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: this.GRID },
          ticks: { color: this.INK_2, font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          grid: { color: this.GRID },
          border: { display: false },
          ticks: {
            color: this.INK_2,
            font: { size: 11 },
            maxTicksLimit: 5,
            callback: (value: any) => compact(Number(value))
          }
        }
      }
    };
  }

  /** Description textuelle du graphique (lecteurs d'écran). */
  get lineAria(): string {
    const total = this.moisCourant.reduce((a, b) => a + b, 0);
    return `Évolution mensuelle du montant facturé en ${this.annee} : ${this.nombre(total)} francs CFA au total, comparée à ${this.annee - 1}.`;
  }

  /** Mois le plus élevé de l'année courante (étiquette directe sélective). */
  get moisFort(): { label: string; montant: number } | null {
    let idx = -1;
    let max = 0;
    this.moisCourant.forEach((v, i) => { if (v > max) { max = v; idx = i; } });
    return idx >= 0 ? { label: this.monthLabels[idx], montant: max } : null;
  }

  get totalAnnee(): number {
    return this.moisCourant.reduce((a, b) => a + b, 0);
  }

  get aDesDonneesEvolution(): boolean {
    return this.moisCourant.some(v => v > 0) || this.moisPrecedent.some(v => v > 0);
  }

  // ───────────────────────────── Actions ─────────────────────────────

  /**
   * Ouvre l'onglet « Factures pharmacies » (périmètre de tous les compteurs de ce
   * tableau de bord) avec le filtre de statut demandé, et d'éventuels paramètres
   * supplémentaires — ciblage d'un prestataire notamment.
   */
  private allerFactures(statut: string, extra: Record<string, string> = {}): void {
    this.router.navigate(['/dashboard/espace-region'], {
      queryParams: { tab: 1, statut, ...extra }
    });
  }

  /** Toutes les factures pharmacies de la région, sans filtre de statut. */
  ouvrirFactures(): void {
    this.allerFactures('TOUTES');
  }

  /** Factures d'un segment du parcours. Un segment vide n'est pas cliquable. */
  ouvrirSegment(seg: PipelineSegment): void {
    if (seg.count === 0) return;
    this.allerFactures(seg.key);
  }

  /** Dossiers patients de la région. */
  ouvrirPatients(): void {
    this.router.navigate(['/dashboard/patients']);
  }

  /** Factures du prestataire cliqué dans le classement. */
  ouvrirPrestataire(r: TopRow): void {
    this.allerFactures('TOUTES', { provider: r.id, providerNom: r.nom });
  }

  exporter(): void {
    this.factureService.exportGlobalRegionExcel().subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Export_Region_${this.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export lancé', 'Fermer', { duration: 2500 });
      },
      error: (err: any) => this.snackBar.open(
        'Erreur lors de l\'export : ' + (err?.error?.message || err?.message || ''),
        'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  // ───────────────────────────── Formatage ─────────────────────────────

  /** Nombre compact pour les grandes valeurs (12,4 M) — figures proportionnelles. */
  compact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace('.', ',') + ' Md';
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
    if (abs >= 10_000) return Math.round(n / 1_000) + ' k';
    return this.nombre(Math.round(n));
  }

  /** Séparateur de milliers français (espace insécable fine). */
  nombre(n: number): string {
    return (n || 0).toLocaleString('fr-FR');
  }

  /** Pourcentage signé pour les deltas. */
  deltaTexte(d: number): string {
    const signe = d > 0 ? '+' : '';
    return `${signe}${d.toFixed(1).replace('.', ',')} %`;
  }
}
