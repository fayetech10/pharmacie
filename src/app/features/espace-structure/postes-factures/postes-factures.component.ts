import { Component, DestroyRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { StructureService } from '../../../core/services/structure.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { FactureStructure } from '../../../core/models/structure.model';
import { REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { RegimeBadgeComponent } from '../../../shared/regime-badge/regime-badge.component';
import { apparenceStatut } from '../../../core/models/statuts';

import { AvancementPointageComponent } from '../../../shared/avancement-pointage/avancement-pointage.component';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
import { EtatListe, EtatListeService } from '../../../shared/pagination/etat-liste.service';
import { nombrePatients } from '../../espace-poste/poste-facturation';
/** Factures d'un même mois pour un poste (2e niveau, à l'intérieur d'un poste déplié). */
interface PeriodeGroup {
  key: string;
  label: string;
  factures: FactureStructure[];
  total: number;
  nbATraiter: number;
}

/** Une facture du poste ouvert, avec son mois : la liste se pagine facture par facture. */
interface LigneFacturePoste {
  facture: FactureStructure;
  periode: PeriodeGroup;
  /** Première facture de son mois : l'en-tête du mois la précède. */
  premiereDuMois: boolean;
}

/** Un poste de santé rattaché : ligne du 1er écran. */
interface PosteBlock {
  posteId: string;
  posteNom: string;
  nbFactures: number;
  nbATraiter: number;
  totalSencsu: number;
  periodes: PeriodeGroup[];
}


/** Statut d'une facture de poste qui attend une action du centre de santé. */
const STATUT_A_TRAITER = 'SOUMISE_CS';

/**
 * Onglet « Factures des postes de santé rattachés » de l'espace du centre (et de la structure).
 *
 * Trois écrans enchaînés (demande du 07/10/2026), comme une navigation et non plus un
 * accordéon :
 *   - les postes rattachés, une ligne chacun — nom, factures, « à valider », part SEN-CSU ;
 *     un clic sur le poste ouvre…
 *   - …ses factures, groupées par mois (la plus récente d'abord) — régime, patients, statut,
 *     pointage, montant ; un clic sur une facture ouvre…
 *   - …la facture elle-même (détail de facture de structure).
 * Le poste ouvert est dans l'adresse (`?poste=`) : « Retour » depuis la facture revient à ses
 * factures, et « Tous les postes » à la liste.
 */
@Component({
  selector: 'app-postes-factures',
  standalone: true,
  imports: [AvancementPointageComponent, PaginationComponent, PaginerPipe, StatusBadgeComponent, RegimeBadgeComponent,CommonModule, FormsModule, MatIconModule, MatCardModule, MatSnackBarModule],
  templateUrl: './postes-factures.component.html'
})
export class PostesFacturesComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  readonly mois = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /** Réponse brute du serveur (les filtres régime/mois/année sont appliqués côté serveur). */
  private allFactures: FactureStructure[] = [];
  /** Tous les postes ayant des factures (après filtre « à traiter »), et ceux affichés après recherche. */
  private tousLesPostes: PosteBlock[] = [];
  postes: PosteBlock[] = [];
  /** Poste ouvert (`?poste=`) ; null = la liste des postes. */
  posteId: string | null = null;
  /** Factures du poste ouvert, à plat (10 par page), chacune avec son mois. */
  lignesPoste: LigneFacturePoste[] = [];
  /** Page retrouvée en revenant d'une facture. */
  etatRetour?: EtatListe;
  @ViewChild('pgFactures') pgFactures?: PaginationComponent;
  loading = true;

  // Filtres serveur
  filterMois = 0;
  filterAnnee = 0;
  filterRegime = '';
  anneesDispo: number[] = [2023, 2024, 2025, 2026, 2027];

  // Filtres locaux (instantanés)
  recherche = '';
  seulementATraiter = false;

  // Totaux du bandeau de synthèse
  totalPostes = 0;
  totalFactures = 0;
  totalATraiter = 0;
  totalSencsu = 0;

  /** Clé de l'élément en cours de traitement (id de facture ou « posteId|période ») : désactive les boutons. */
  traitement: string | null = null;

  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private etatListe = inject(EtatListeService);

  constructor(
    private structureService: StructureService,
    private confirm: ConfirmService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.posteId = params.get('poste');
      this.etatRetour = this.posteId ? this.etatListe.reprendre('postes-factures:' + this.posteId) : undefined;
      this.construireLignesPoste();
    });
    this.load();
  }

  /** Le poste ouvert, tel que les filtres régime / mois / année le laissent. */
  get posteCourant(): PosteBlock | undefined {
    return this.posteId ? this.tousLesPostes.find(p => p.posteId === this.posteId) : undefined;
  }

  /** Nom du poste ouvert, même quand les filtres ne lui laissent aucune facture. */
  get nomPosteCourant(): string {
    return this.posteCourant?.posteNom
      || this.allFactures.find(f => f.structureSanitaireId === this.posteId)?.structureNom
      || 'Poste de santé';
  }

  /** Ouvre les factures d'un poste (le poste entre dans l'adresse). */
  ouvrirPoste(p: PosteBlock) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { poste: p.posteId }, queryParamsHandling: 'merge' });
    window.scrollTo({ top: 0 });
  }

  /** Retour à la liste des postes. */
  retourPostes() {
    this.router.navigate([], { relativeTo: this.route, queryParams: { poste: null }, queryParamsHandling: 'merge' });
  }

  load() {
    this.loading = true;
    const params: any = {};
    if (this.filterMois > 0) params.mois = this.filterMois;
    if (this.filterAnnee > 0) params.annee = this.filterAnnee;
    if (this.filterRegime) params.regime = this.filterRegime;

    this.structureService.getFacturesPostes(params).subscribe({
      next: (factures) => {
        this.allFactures = factures || [];
        this.appliquerFiltres();
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Recherche / filtre « à traiter » : recalcul local, sans appel serveur. */
  appliquerFiltres() {
    const q = this.recherche.trim().toLowerCase();
    const parStatut = this.allFactures.filter(f => !this.seulementATraiter || f.statut === STATUT_A_TRAITER);
    this.tousLesPostes = this.construire(parStatut);
    // La recherche porte sur le nom du poste : elle ne trie que la liste des postes.
    this.postes = q ? this.tousLesPostes.filter(p => (p.posteNom || '').toLowerCase().includes(q)) : this.tousLesPostes;

    const retenues = this.postes.flatMap(p => p.periodes.flatMap(per => per.factures));
    this.totalPostes = this.postes.length;
    this.totalFactures = retenues.length;
    this.totalATraiter = retenues.filter(f => f.statut === STATUT_A_TRAITER).length;
    this.totalSencsu = retenues.reduce((s, f) => s + (f.montantTotalSencsu || 0), 0);
    this.construireLignesPoste();
  }

  /** Factures du poste ouvert à plat, dans l'ordre (mois le plus récent d'abord). */
  private construireLignesPoste() {
    const poste = this.posteCourant;
    this.lignesPoste = !poste ? [] : poste.periodes.flatMap(periode =>
      periode.factures.map((facture, i) => ({ facture, periode, premiereDuMois: i === 0 })));
  }

  /** Groupe les factures par poste, puis par mois (le plus récent d'abord). */
  private construire(factures: FactureStructure[]): PosteBlock[] {
    const parPoste = new Map<string, FactureStructure[]>();
    for (const f of factures) {
      const arr = parPoste.get(f.structureSanitaireId) || [];
      arr.push(f);
      parPoste.set(f.structureSanitaireId, arr);
    }

    const blocks: PosteBlock[] = [];
    parPoste.forEach((lot, posteId) => {
      const parPeriode = new Map<string, PeriodeGroup>();
      for (const f of lot) {
        const key = `${f.annee}-${String(f.mois).padStart(2, '0')}`;
        let p = parPeriode.get(key);
        if (!p) {
          p = {
            key,
            label: `${this.moisNoms[f.mois] || f.mois} ${f.annee}`,
            factures: [],
            total: 0,
            nbATraiter: 0
          };
          parPeriode.set(key, p);
        }
        p.factures.push(f);
        p.total += f.montantTotalSencsu || 0;
        if (f.statut === STATUT_A_TRAITER) p.nbATraiter++;
      }

      const periodes = Array.from(parPeriode.values()).sort((a, b) => b.key.localeCompare(a.key));
      periodes.forEach(p => p.factures.sort((a, b) =>
        (this.regimeLabels[a.regime] || a.regime).localeCompare(this.regimeLabels[b.regime] || b.regime)));

      blocks.push({
        posteId,
        posteNom: lot[0].structureNom,
        nbFactures: lot.length,
        nbATraiter: lot.filter(f => f.statut === STATUT_A_TRAITER).length,
        totalSencsu: lot.reduce((s, f) => s + (f.montantTotalSencsu || 0), 0),
        periodes
      });
    });

    // Les postes qui attendent une action passent devant, puis ordre alphabétique.
    return blocks.sort((a, b) =>
      (b.nbATraiter > 0 ? 1 : 0) - (a.nbATraiter > 0 ? 1 : 0) || a.posteNom.localeCompare(b.posteNom));
  }

  // ----- Divers -----
  reinitialiser() {
    this.recherche = '';
    this.seulementATraiter = false;
    this.filterRegime = '';
    this.filterMois = 0;
    this.filterAnnee = 0;
    this.load();
  }

  get filtresActifs(): boolean {
    return !!this.recherche || this.seulementATraiter || !!this.filterRegime
      || this.filterMois > 0 || this.filterAnnee > 0;
  }

  /**
   * Patients distincts — un patient venu plusieurs fois (plusieurs lettres, plusieurs
   * dossiers) compte une fois, comme dans le détail et l'avancement du pointage.
   */
  patientsCount(f: FactureStructure): number {
    if (f.dossiers?.length) return nombrePatients(f);
    const ids = new Set((f.lignes || []).map(l => l.patientId || l.lettreGarantieNumero || `${l.patientPrenom}|${l.patientNom}`));
    return ids.size;
  }

  estATraiter(f: FactureStructure): boolean {
    return f.statut === STATUT_A_TRAITER;
  }

  statutLabel(s: string): string {
    return apparenceStatut(s).libelle;
  }

  openDetail(f: FactureStructure) {
    // La page de la liste est notée : « Retour » depuis la facture y revient.
    if (this.posteId && this.pgFactures) {
      this.etatListe.memoriser('postes-factures:' + this.posteId, {
        page: this.pgFactures.pageCourante, taille: this.pgFactures.taille, recherche: '', defilement: window.scrollY
      });
    }
    this.router.navigate(['/dashboard/factures-structure', f.id]);
  }

  // ===== Validation / rejet depuis la liste =====
  // Évite d'ouvrir chaque facture une par une quand le volume est important.
  // Le serveur reste l'autorité (rôle, rattachement du poste et statut sont revérifiés).

  /** Valide une facture : SOUMISE_CS → ENVOYEE (transmise au service régional). */
  valider(f: FactureStructure, event: Event) {
    event.stopPropagation();
    this.confirm.ask({
      title: 'Valider la facture',
      message: `Valider la facture ${f.numero} (${this.regimeLabels[f.regime] || f.regime}) `
        + `de « ${f.structureNom} » ? Elle sera transmise au service régional.`,
      confirmText: 'Valider'
    }).subscribe(ok => {
      if (!ok) return;
      this.traitement = f.id;
      this.structureService.validerFacturePoste(f.id).subscribe({
        next: () => {
          this.traitement = null;
          this.snackBar.open('Facture validée et transmise au service régional', 'Fermer', { duration: 4000 });
          this.load();
        },
        error: (err) => {
          this.traitement = null;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  /** Rejette une facture : SOUMISE_CS → REJETEE_CS. Le motif est obligatoire (imposé côté serveur). */
  rejeter(f: FactureStructure, event: Event) {
    event.stopPropagation();
    this.confirm.prompt({
      title: 'Rejeter la facture',
      message: `Facture ${f.numero} de « ${f.structureNom} ». Le poste de santé devra la corriger puis la renvoyer.`,
      label: 'Motif du rejet',
      placeholder: 'Ex : montants incohérents sur 3 prestations',
      required: true,
      multiline: true,
      danger: true,
      confirmText: 'Rejeter'
    }).subscribe(motif => {
      if (!motif) return;
      this.traitement = f.id;
      this.structureService.rejeterFacturePoste(f.id, motif).subscribe({
        next: () => {
          this.traitement = null;
          this.snackBar.open('Facture rejetée et renvoyée au poste de santé', 'Fermer', { duration: 4000 });
          this.load();
        },
        error: (err) => {
          this.traitement = null;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  /** Valide d'un coup toutes les factures « à valider » d'un mois pour un poste. */
  validerLot(poste: PosteBlock, per: PeriodeGroup, event: Event) {
    event.stopPropagation();
    const cibles = per.factures.filter(f => this.estATraiter(f));
    if (cibles.length === 0) return;
    this.confirm.ask({
      title: 'Valider les factures du mois',
      message: `Valider les ${cibles.length} facture(s) de « ${poste.posteNom} » pour ${per.label} ? `
        + `Elles seront transmises au service régional.`,
      confirmText: `Valider les ${cibles.length}`
    }).subscribe(ok => {
      if (!ok) return;
      this.traitement = this.cleLot(poste, per);
      // Une facture en échec ne doit pas annuler les autres : chaque appel est isolé.
      forkJoin(cibles.map(f => this.structureService.validerFacturePoste(f.id).pipe(
        map(() => true),
        catchError(() => of(false))
      ))).subscribe(resultats => {
        this.traitement = null;
        const echecs = resultats.filter(r => !r).length;
        const succes = resultats.length - echecs;
        this.snackBar.open(
          echecs === 0
            ? `${succes} facture(s) validée(s) et transmise(s) au service régional`
            : `${succes} facture(s) validée(s), ${echecs} en échec — réessayez sur celles restantes`,
          'Fermer', { duration: 5000, panelClass: echecs ? 'error-snackbar' : undefined });
        this.load();
      });
    });
  }

  /** Identifiant du lot (poste + mois), pour l'état « en cours » du bouton. */
  cleLot(poste: PosteBlock, per: PeriodeGroup): string {
    return `${poste.posteId}|${per.key}`;
  }

  /** *ngFor : évite de reconstruire toutes les lignes à chaque filtrage. */
  trackPoste = (_: number, p: PosteBlock) => p.posteId;
  trackPeriode = (_: number, p: PeriodeGroup) => p.key;
  trackFacture = (_: number, f: FactureStructure) => f.id;
  trackLigne = (_: number, l: LigneFacturePoste) => l.facture.id;
}
