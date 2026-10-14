import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ConsolidationService } from '../../core/services/consolidation.service';
import {
  ActiviteDistrict, ActiviteStructure, ActivitesRegion, IndicateursActivite, ResumeFactureActivite
} from '../../core/models/referentiel.model';
import { apparenceStatut } from '../../core/models/statuts';
import { IndicateurComponent } from '../../shared/indicateur/indicateur.component';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { RegimeBadgeComponent } from '../../shared/regime-badge/regime-badge.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';

/** Statut d'une facture et nombre de factures dans ce statut, prêts pour la puce. */
interface PuceStatut {
  statut: string;
  libelle: string;
}

/** Une structure telle qu'affichée : la donnée serveur et ses puces calculées une fois. */
interface LigneStructure {
  s: ActiviteStructure;
  puces: PuceStatut[];
}

/** Un district tel qu'affiché, avec ses structures filtrées et triées. */
interface LigneDistrict {
  cle: string;
  d: ActiviteDistrict;
  puces: PuceStatut[];
  structures: LigneStructure[];
  /** Structures du district sans aucune facture sur la période. */
  sansSaisie: number;
  rejetees: number;
}

type FiltreType = '' | 'PS' | 'CENTRES';
type FiltreSituation = 'TOUTES' | 'SANS_SAISIE' | 'A_COMPLETER' | 'REJETEES' | 'AU_DISTRICT';
type Tri = 'NOM' | 'MONTANT' | 'PATIENTS';

/** Ordre de lecture des statuts : celui du circuit d'une facture. */
const ORDRE_STATUTS = ['BROUILLON', 'SOUMISE_CS', 'REJETEE_CS', 'ENVOYEE', 'VALIDEE_SR', 'REJETEE_SR',
  'VALIDEE_NC', 'REJETEE_NC', 'PAYEE'];
const REJETS = ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'];

/**
 * Service régional — activités du réseau de la région (14/10/2026) : chaque district, puis ses
 * centres et postes de santé, sur un mois ou une année — factures et leur statut, patients,
 * visites, dossiers à compléter, part SEN-CSU, dernière saisie.
 *
 * <p>Le serveur impose la région (celle du compte) ; toutes les structures actives sont listées,
 * à zéro quand elles n'ont rien saisi — ce sont celles à relancer. Brouillons compris : un poste
 * garde sa facture en brouillon jusqu'à l'envoi de fin de mois.</p>
 */
@Component({
  selector: 'app-regional-activites',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, IndicateurComponent, StatusBadgeComponent,
    RegimeBadgeComponent, PaginationComponent, PaginerPipe],
  templateUrl: './regional-activites.component.html'
})
export class RegionalActivitesComponent implements OnInit {
  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  readonly mois = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  readonly annees: number[];

  filtreMois = new Date().getMonth() + 1;
  filtreAnnee = new Date().getFullYear();
  filtreDistrict = '';
  filtreType: FiltreType = '';
  filtreSituation: FiltreSituation = 'TOUTES';
  tri: Tri = 'NOM';
  recherche = '';

  readonly situations: { cle: FiltreSituation; libelle: string }[] = [
    { cle: 'TOUTES', libelle: 'Toutes les situations' },
    { cle: 'SANS_SAISIE', libelle: 'Aucune saisie sur la période' },
    { cle: 'A_COMPLETER', libelle: 'Dossiers à compléter' },
    { cle: 'AU_DISTRICT', libelle: 'En attente du district' },
    { cle: 'REJETEES', libelle: 'Factures rejetées' }
  ];

  chargement = true;
  erreur: string | null = null;
  donnees: ActivitesRegion | null = null;

  /** Districts affichés après filtres (calculés en champ, jamais en getter). */
  lignes: LigneDistrict[] = [];
  /** Totaux du périmètre filtré, pour les indicateurs. */
  totaux: IndicateursActivite | null = null;
  structuresAffichees = 0;
  structuresAyantSaisi = 0;

  /** Districts dépliés (clé) et structure dont les factures sont ouvertes. */
  private deplies = new Set<string>();
  structureOuverte: string | null = null;

  constructor(private consolidation: ConsolidationService, private router: Router) {
    const an = new Date().getFullYear();
    this.annees = [an, an - 1, an - 2, an - 3];
  }

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.erreur = null;
    this.consolidation.getActivitesRegion({ mois: this.filtreMois || undefined, annee: this.filtreAnnee })
      .subscribe({
        next: donnees => {
          this.donnees = donnees;
          // Le district filtré a pu disparaître (autre période) : on retombe sur « tous ».
          if (this.filtreDistrict && !donnees.districts.some(d => this.cle(d) === this.filtreDistrict)) {
            this.filtreDistrict = '';
          }
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

  /** Recalcule l'affichage après un changement de recherche, de filtre ou de tri. */
  construire(): void {
    const donnees = this.donnees;
    if (!donnees) return;
    const terme = sansAccent(this.recherche.trim());

    const lignes: LigneDistrict[] = [];
    for (const d of donnees.districts) {
      const cle = this.cle(d);
      if (this.filtreDistrict && cle !== this.filtreDistrict) continue;
      // Le nom du district suffit à le garder entier ; sinon, seules ses structures qui
      // correspondent restent (chercher un poste sans savoir de quel district il dépend).
      const districtTrouve = !terme || sansAccent(`${d.nom} ${d.code || ''}`).includes(terme);
      const structures = d.structures
        .filter(s => districtTrouve || sansAccent(`${s.nom} ${s.code || ''}`).includes(terme))
        .filter(s => this.correspondType(s) && this.correspondSituation(s))
        .sort(this.comparateur())
        .map(s => ({ s, puces: puces(s.indicateurs) }));
      // Un filtre qui ne laisse aucune structure masque le district — sauf une recherche qui
      // désigne le district lui-même (un district encore vide compris).
      const filtre = !!this.filtreType || this.filtreSituation !== 'TOUTES';
      if (!structures.length && (filtre || (terme && !districtTrouve))) continue;
      lignes.push({
        cle, d, structures,
        puces: puces(d.indicateurs),
        sansSaisie: d.structures.filter(s => !s.indicateurs.nombreFactures).length,
        rejetees: REJETS.reduce((n, st) => n + (d.indicateurs.parStatut[st] || 0), 0)
      });
    }
    this.lignes = lignes;

    // Indicateurs : le périmètre affiché (tout, ou le district / les structures filtrés).
    const tout = !this.filtreDistrict && !terme && !this.filtreType && this.filtreSituation === 'TOUTES';
    const structures = lignes.flatMap(l => l.structures.map(x => x.s));
    this.structuresAffichees = tout ? donnees.nombreStructures : structures.length;
    this.structuresAyantSaisi = tout ? donnees.structuresActives
      : structures.filter(s => s.indicateurs.nombreFactures > 0).length;
    this.totaux = tout ? donnees.indicateurs
      : lignes.length === 1 && lignes[0].structures.length === lignes[0].d.structures.length
        ? lignes[0].d.indicateurs
        : additionner(structures.map(s => s.indicateurs));

    // Un seul district à l'écran, ou une recherche : on l'ouvre d'office.
    if (lignes.length === 1 || terme) lignes.forEach(l => this.deplies.add(l.cle));
  }

  changerPeriode(): void {
    this.structureOuverte = null;
    this.charger();
  }

  get filtresActifs(): boolean {
    return !!this.recherche.trim() || !!this.filtreDistrict || !!this.filtreType
      || this.filtreSituation !== 'TOUTES' || this.tri !== 'NOM';
  }

  reinitialiser(): void {
    this.recherche = '';
    this.filtreDistrict = '';
    this.filtreType = '';
    this.filtreSituation = 'TOUTES';
    this.tri = 'NOM';
    this.construire();
  }

  get libellePeriode(): string {
    return this.filtreMois ? `${this.moisNoms[this.filtreMois]} ${this.filtreAnnee}` : `Année ${this.filtreAnnee}`;
  }

  // ───────────────────────────── dépliage ─────────────────────────────

  estDeplie(l: LigneDistrict): boolean {
    return this.deplies.has(l.cle);
  }

  basculer(l: LigneDistrict): void {
    if (this.deplies.has(l.cle)) this.deplies.delete(l.cle);
    else this.deplies.add(l.cle);
  }

  basculerStructure(s: ActiviteStructure): void {
    this.structureOuverte = this.structureOuverte === s.id ? null : s.id;
  }

  ouvrirFacture(f: ResumeFactureActivite): void {
    this.router.navigate(['/dashboard/factures-structure', f.id]);
  }

  // ───────────────────────────── filtres ─────────────────────────────

  cle(d: ActiviteDistrict): string {
    return d.id || 'sans-district';
  }

  private correspondType(s: ActiviteStructure): boolean {
    if (this.filtreType === 'PS') return s.type === 'PS';
    if (this.filtreType === 'CENTRES') return s.type === 'CS' || s.type === 'EPS';
    return true;
  }

  private correspondSituation(s: ActiviteStructure): boolean {
    const i = s.indicateurs;
    switch (this.filtreSituation) {
      case 'SANS_SAISIE': return i.nombreFactures === 0;
      case 'A_COMPLETER': return i.dossiersACompleter > 0;
      case 'AU_DISTRICT': return (i.parStatut['SOUMISE_CS'] || 0) > 0;
      case 'REJETEES': return REJETS.some(st => (i.parStatut[st] || 0) > 0);
      default: return true;
    }
  }

  /** Tri des structures d'un district ; à défaut, l'ordre serveur (centres puis postes, par nom). */
  private comparateur(): (a: ActiviteStructure, b: ActiviteStructure) => number {
    const parNom = (a: ActiviteStructure, b: ActiviteStructure) => a.nom.localeCompare(b.nom, 'fr');
    switch (this.tri) {
      case 'MONTANT': return (a, b) => b.indicateurs.montantSencsu - a.indicateurs.montantSencsu || parNom(a, b);
      case 'PATIENTS': return (a, b) => b.indicateurs.patients - a.indicateurs.patients || parNom(a, b);
      default: return () => 0;
    }
  }

  // ───────────────────────────── affichage ─────────────────────────────

  typeLibelle(type: string | null | undefined): string {
    return type === 'PS' ? 'Poste' : type === 'EPS' ? 'Hôpital (EPS)' : type === 'CS' ? 'Centre' : '—';
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

function rang(statut: string): number {
  const i = ORDRE_STATUTS.indexOf(statut);
  return i < 0 ? ORDRE_STATUTS.length : i;
}

/**
 * Totaux d'une sélection de structures. Les patients s'additionnent (un patient vu dans deux
 * structures compte deux fois — le serveur ne les dédoublonne qu'à l'échelle d'un district
 * entier ou de la région).
 */
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

/** Minuscules sans accents : « Thiès » se retrouve en tapant « thies ». */
function sansAccent(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
