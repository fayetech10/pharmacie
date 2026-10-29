import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ConsolidationService } from '../../core/services/consolidation.service';
import {
  ActiviteDistrict, ActiviteStructure, ActivitesRegion, IndicateursActivite, ResumeFactureActivite
} from '../../core/models/referentiel.model';
import { apparenceStatut } from '../../core/models/statuts';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { RegimeBadgeComponent } from '../../shared/regime-badge/regime-badge.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';

/** Statut d'une facture et nombre de factures dans ce statut, prêts pour la puce. */
export interface PuceStatut {
  statut: string;
  libelle: string;
}

/** Une structure telle qu'affichée : la donnée serveur et ses puces calculées une fois. */
export interface LigneStructure {
  s: ActiviteStructure;
  puces: PuceStatut[];
  /** Fond du liseré haut de la carte : gris sans saisie, rouge si rejet, ambre si dossiers à compléter. */
  lisere: string;
}

/** Un district tel qu'affiché (un bloc de la liste), avec ses structures filtrées et triées. */
export interface LigneDistrict {
  cle: string;
  d: ActiviteDistrict;
  structures: LigneStructure[];
  rejetees: number;
}

export type FiltreType = '' | 'PS' | 'CENTRES';
export type FiltreSituation = 'TOUTES' | 'SANS_SAISIE' | 'A_COMPLETER' | 'REJETEES' | 'AU_DISTRICT';
export type Tri = 'NOM' | 'MONTANT' | 'PATIENTS';

/** Ordre de lecture des statuts : celui du circuit d'une facture. */
const ORDRE_STATUTS = ['BROUILLON', 'SOUMISE_CS', 'REJETEE_CS', 'ENVOYEE', 'VALIDEE_SR', 'REJETEE_SR',
  'VALIDEE_NC', 'REJETEE_NC', 'PAYEE'];
const REJETS = ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'];

@Component({
  selector: 'app-regional-activites',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, StatusBadgeComponent,
    RegimeBadgeComponent, PaginationComponent, PaginerPipe],
  templateUrl: './regional-activites.component.html',
  styleUrls: ['./regional-activites.component.css']
})
export class RegionalActivitesComponent implements OnInit {
  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  readonly mois = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  readonly annees: number[];

  filtreMois = new Date().getMonth() + 1;
  filtreAnnee = new Date().getFullYear();
  filtreType: FiltreType = '';
  filtreSituation: FiltreSituation = 'TOUTES';
  tri: Tri = 'NOM';
  recherche = '';

  readonly situations: { cle: FiltreSituation; libelle: string }[] = [
    { cle: 'TOUTES', libelle: 'Toutes' },
    { cle: 'SANS_SAISIE', libelle: 'Sans saisie' },
    { cle: 'A_COMPLETER', libelle: 'À compléter' },
    { cle: 'AU_DISTRICT', libelle: 'Au district' },
    { cle: 'REJETEES', libelle: 'Rejetées' }
  ];

  readonly types: { cle: FiltreType; libelle: string }[] = [
    { cle: '', libelle: 'Tous' },
    { cle: 'PS', libelle: 'Postes' },
    { cle: 'CENTRES', libelle: 'Centres et EPS' }
  ];

  /** Structures par situation (recherche et type appliqués). */
  comptes: Record<FiltreSituation, number> = { TOUTES: 0, SANS_SAISIE: 0, A_COMPLETER: 0, AU_DISTRICT: 0, REJETEES: 0 };

  chargement = true;
  erreur: string | null = null;
  donnees: ActivitesRegion | null = null;

  /** Districts affichés après filtres et ordonnés (ceux ayant des données en premier). */
  lignes: LigneDistrict[] = [];
  /** Totaux du périmètre filtré, pour les indicateurs. */
  totaux: IndicateursActivite | null = null;
  structuresAffichees = 0;
  structuresAyantSaisi = 0;
  districtsAvecDonnees = 0;

  /** Structure dont les factures sont ouvertes (modale). */
  structureOuverte: ActiviteStructure | null = null;

  /** Vrai dès le premier filtre ou rechargement pour alléger les transitions répétées. */
  interagi = false;

  constructor(private consolidation: ConsolidationService, private router: Router) {
    const an = new Date().getFullYear();
    this.annees = [an, an - 1, an - 2, an - 3];
  }

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    if (this.donnees) this.interagi = true;
    this.chargement = true;
    this.erreur = null;
    this.consolidation.getActivitesRegion({ mois: this.filtreMois || undefined, annee: this.filtreAnnee })
      .subscribe({
        next: donnees => {
          this.donnees = donnees;
          this.construire();
          this.chargement = false;
        },
        error: err => {
          this.donnees = null;
          this.lignes = [];
          this.totaux = null;
          this.erreur = err?.error?.message || err?.message || 'Chargement impossible.';
          this.chargement = false;
        }
      });
  }

  /**
   * Indique si un district possède des données d'activité sur la période
   * (structures ayant saisi, factures enregistrées, montant SEN-CSU ou patients).
   */
  districtADesDonnees(l: LigneDistrict): boolean {
    return (l.d.structuresActives > 0)
      || ((l.d.indicateurs?.nombreFactures ?? 0) > 0)
      || ((l.d.indicateurs?.montantSencsu ?? 0) > 0)
      || ((l.d.indicateurs?.patients ?? 0) > 0)
      || l.structures.some(x => (x.s.indicateurs?.nombreFactures ?? 0) > 0);
  }

  /** Recalcule l'affichage après un changement de recherche, de période ou de tri. */
  construire(): void {
    const donnees = this.donnees;
    if (!donnees) return;
    const terme = sansAccent(this.recherche.trim());

    const lignes: LigneDistrict[] = [];
    const comptes: Record<FiltreSituation, number> = { TOUTES: 0, SANS_SAISIE: 0, A_COMPLETER: 0, AU_DISTRICT: 0, REJETEES: 0 };

    for (const d of donnees.districts) {
      const districtTrouve = !terme || sansAccent(`${d.nom} ${d.code || ''}`).includes(terme);
      const candidates = d.structures
        .filter(s => districtTrouve || sansAccent(`${s.nom} ${s.code || ''}`).includes(terme))
        .filter(s => this.correspondType(s));

      for (const s of candidates) {
        for (const situation of this.situations) {
          if (correspondSituation(s, situation.cle)) comptes[situation.cle]++;
        }
      }

      const structures = candidates
        .filter(s => correspondSituation(s, this.filtreSituation))
        .sort(this.comparateur())
        .map(s => ({ s, puces: puces(s.indicateurs), lisere: lisere(s.indicateurs) }));

      const filtre = !!this.filtreType || this.filtreSituation !== 'TOUTES';
      if (!structures.length && (filtre || (terme && !districtTrouve))) continue;

      lignes.push({
        cle: this.cle(d),
        d,
        structures,
        rejetees: REJETS.reduce((n, st) => n + (d.indicateurs.parStatut[st] || 0), 0)
      });
    }

    // ─── TRI DES DISTRICTS : Ceux qui ont des données sont affichés en premier ───
    lignes.sort((a, b) => {
      const aHas = this.districtADesDonnees(a) ? 1 : 0;
      const bHas = this.districtADesDonnees(b) ? 1 : 0;
      if (aHas !== bHas) {
        return bHas - aHas; // Districts avec données en tête
      }
      if (this.tri === 'MONTANT') {
        const diffMontant = (b.d.indicateurs?.montantSencsu || 0) - (a.d.indicateurs?.montantSencsu || 0);
        if (diffMontant !== 0) return diffMontant;
      } else if (this.tri === 'PATIENTS') {
        const diffPatients = (b.d.indicateurs?.patients || 0) - (a.d.indicateurs?.patients || 0);
        if (diffPatients !== 0) return diffPatients;
      }
      return a.d.nom.localeCompare(b.d.nom, 'fr');
    });

    this.lignes = lignes;
    this.comptes = comptes;
    this.districtsAvecDonnees = lignes.filter(l => this.districtADesDonnees(l)).length;

    // Indicateurs du périmètre affiché
    const tout = !terme && !this.filtreType && this.filtreSituation === 'TOUTES';
    const structures = lignes.flatMap(l => l.structures.map(x => x.s));
    this.structuresAffichees = tout ? donnees.nombreStructures : structures.length;
    this.structuresAyantSaisi = tout ? donnees.structuresActives
      : structures.filter(s => s.indicateurs.nombreFactures > 0).length;
    this.totaux = tout ? donnees.indicateurs
      : lignes.length === 1 && lignes[0].structures.length === lignes[0].d.structures.length
        ? lignes[0].d.indicateurs
        : additionner(structures.map(s => s.indicateurs));
  }

  filtrer(): void {
    this.interagi = true;
    this.construire();
  }

  choisirSituation(situation: FiltreSituation): void {
    this.filtreSituation = situation;
    this.filtrer();
  }

  choisirType(type: FiltreType): void {
    this.filtreType = type;
    this.filtrer();
  }

  changerPeriode(): void {
    this.structureOuverte = null;
    this.interagi = true;
    this.charger();
  }

  get filtresActifs(): boolean {
    return !!this.recherche.trim() || this.tri !== 'NOM';
  }

  reinitialiser(): void {
    this.recherche = '';
    this.filtreType = '';
    this.filtreSituation = 'TOUTES';
    this.tri = 'NOM';
    this.filtrer();
  }

  get libellePeriode(): string {
    return this.filtreMois ? `${this.moisNoms[this.filtreMois]} ${this.filtreAnnee}` : `Année ${this.filtreAnnee}`;
  }

  // ───────────────────────────── navigation ─────────────────────────────

  ouvrirStructure(s: ActiviteStructure): void {
    this.structureOuverte = s;
  }

  @HostListener('document:keydown.escape')
  fermerStructure(): void {
    this.structureOuverte = null;
  }

  ouvrirFacture(f: ResumeFactureActivite): void {
    this.router.navigate(['/dashboard/factures-structure', f.id]);
  }

  defiler(rangee: HTMLElement, sens: 1 | -1): void {
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rangee.scrollBy({ left: sens * Math.max(rangee.clientWidth - 290, 260), behavior: doux ? 'smooth' : 'auto' });
  }

  // ───────────────────────────── utilitaires ─────────────────────────────

  cle(d: ActiviteDistrict): string {
    return d.id || 'sans-district';
  }

  private correspondType(s: ActiviteStructure): boolean {
    if (this.filtreType === 'PS') return s.type === 'PS';
    if (this.filtreType === 'CENTRES') return s.type === 'CS' || s.type === 'EPS';
    return true;
  }

  private comparateur(): (a: ActiviteStructure, b: ActiviteStructure) => number {
    const parNom = (a: ActiviteStructure, b: ActiviteStructure) => a.nom.localeCompare(b.nom, 'fr');
    const saisie = (s: ActiviteStructure) => (s.indicateurs.nombreFactures > 0 ? 1 : 0);
    const ensuite: (a: ActiviteStructure, b: ActiviteStructure) => number =
      this.tri === 'MONTANT' ? (a, b) => b.indicateurs.montantSencsu - a.indicateurs.montantSencsu || parNom(a, b)
        : this.tri === 'PATIENTS' ? (a, b) => b.indicateurs.patients - a.indicateurs.patients || parNom(a, b)
          : parNom;
    return (a, b) => saisie(b) - saisie(a) || ensuite(a, b);
  }

  typeLibelle(type: string | null | undefined): string {
    return type === 'PS' ? 'Poste de santé' : type === 'EPS' ? 'Hôpital (EPS)' : type === 'CS' ? 'Centre de santé' : '—';
  }

  trackDistrict(_: number, l: LigneDistrict): string {
    return l.cle;
  }

  trackStructure(_: number, l: LigneStructure): string {
    return l.s.id;
  }

  trackFacture(_: number, f: ResumeFactureActivite): string {
    return f.id;
  }
}

/** Puces de statut d'un périmètre, dans l'ordre du circuit : « Brouillon (2) ». */
function puces(i: IndicateursActivite): PuceStatut[] {
  const parStatut = i.parStatut || {};
  return Object.keys(parStatut)
    .sort((a, b) => rang(a) - rang(b))
    .map(statut => ({ statut, libelle: `${apparenceStatut(statut).libelle} (${parStatut[statut]})` }));
}

/** La structure est-elle dans cette situation sur la période ? */
function correspondSituation(s: ActiviteStructure, situation: FiltreSituation): boolean {
  const i = s.indicateurs;
  switch (situation) {
    case 'SANS_SAISIE': return i.nombreFactures === 0;
    case 'A_COMPLETER': return i.dossiersACompleter > 0;
    case 'AU_DISTRICT': return (i.parStatut['SOUMISE_CS'] || 0) > 0;
    case 'REJETEES': return REJETS.some(st => (i.parStatut[st] || 0) > 0);
    default: return true;
  }
}

function rang(statut: string): number {
  const i = ORDRE_STATUTS.indexOf(statut);
  return i < 0 ? ORDRE_STATUTS.length : i;
}

function lisere(i: IndicateursActivite): string {
  if (!i.nombreFactures) return 'bg-slate-300';
  if (REJETS.some(st => (i.parStatut[st] || 0) > 0)) return 'bg-red-500';
  if (i.dossiersACompleter > 0) return 'bg-amber-400';
  return 'bg-emerald-600';
}

function additionner(liste: IndicateursActivite[]): IndicateursActivite {
  const total: IndicateursActivite = {
    nombreFactures: 0, facturesEnCours: 0, facturesTransmises: 0, parStatut: {},
    patients: 0, visites: 0, dossiersACompleter: 0, montantTotal: 0, montantSencsu: 0,
    montantSencsuTransmis: 0, montantSencsuEnCours: 0, derniereSaisie: null
  };
  for (const i of liste) {
    total.nombreFactures += i.nombreFactures;
    total.facturesEnCours += i.facturesEnCours;
    total.facturesTransmises += i.facturesTransmises;
    for (const [statut, n] of Object.entries(i.parStatut || {})) {
      total.parStatut[statut] = (total.parStatut[statut] || 0) + n;
    }
    total.patients += i.patients;
    total.visites += i.visites;
    total.dossiersACompleter += i.dossiersACompleter;
    total.montantTotal += i.montantTotal;
    total.montantSencsu += i.montantSencsu;
    total.montantSencsuTransmis += i.montantSencsuTransmis;
    total.montantSencsuEnCours += i.montantSencsuEnCours;
    if (i.derniereSaisie && (!total.derniereSaisie || i.derniereSaisie > total.derniereSaisie)) {
      total.derniereSaisie = i.derniereSaisie;
    }
  }
  return total;
}

function sansAccent(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
