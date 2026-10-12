import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { forkJoin } from 'rxjs';
import { ConsolidationService, FiltresConsolidation } from '../../core/services/consolidation.service';
import { DistrictService } from '../../core/services/district.service';
import { AuthService } from '../../core/services/auth.service';
import { District, LigneStructureTableau, TableauBord } from '../../core/models/referentiel.model';
import { FactureStructure } from '../../core/models/structure.model';
import { factureModifiable } from '../../core/models/statuts';
import { REGIME_LABELS, REGIME_OPTIONS, Regime } from '../../core/models/bcsu.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { RegimeBadgeComponent } from '../../shared/regime-badge/regime-badge.component';

import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';
/**
 * Consolidation district (§9) et tableau de bord (§10).
 *
 * <p>Une seule requête ramène les factures des postes ET des centres du district : le
 * service centre agrège les deux origines. L'écran met en avant ce qui manque —
 * les structures qui n'ont pas facturé — car c'est l'information sur laquelle le
 * district agit réellement en fin de mois.</p>
 */
@Component({
  selector: 'app-consolidation',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, FormsModule, MatIconModule, MatSnackBarModule, StatusBadgeComponent, RegimeBadgeComponent],
  templateUrl: './consolidation.component.html'
})
export class ConsolidationComponent implements OnInit {

  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  readonly mois = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  districts: District[] = [];
  tableau?: TableauBord;
  /** Factures de la période, brouillons et rejetées comprises, chacune avec son statut. */
  factures: FactureStructure[] = [];
  chargement = true;
  export?: 'excel' | 'pdf';

  /** Un compte de district ne choisit rien : son périmètre est celui de son compte. */
  districtImpose = false;

  filtres: FiltresConsolidation = {
    mois: new Date().getMonth() + 1,
    annee: new Date().getFullYear()
  };

  constructor(
    private consolidation: ConsolidationService,
    private districtService: DistrictService,
    private auth: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const districtCompte = this.auth.getDistrictId();
    // Seuls les échelons régional et central (et l'admin) choisissent un district. Les
    // autres comptes consolident le leur, que le serveur lit dans le jeton : on n'envoie
    // rien s'il manque à la session. Avant, un compte district sans districtId en session
    // présélectionnait le premier district de la liste — refusé par le serveur, écran vide.
    this.districtImpose = !this.auth.isAdmin()
      && !this.auth.isServiceCentral() && !this.auth.isServiceRegional();

    if (this.districtImpose) {
      this.filtres.districtId = districtCompte;
      // Depuis le 09/10/2026, un district ne consolide que le 0-5 ans (les autres régimes vont
      // au service régional) : le régime est verrouillé côté écran comme côté serveur.
      this.filtres.regime = Regime.ZERO_CINQ_ANS;
      this.charger();
      return;
    }

    this.districtService.getDistricts().subscribe({
      next: districts => {
        this.districts = districts || [];
        // Sans district sélectionné, le serveur refuse de consolider : on préselectionne
        // celui du compte s'il en a un, sinon le premier de la liste.
        this.filtres.districtId = districtCompte || this.districts[0]?.id;
        if (this.filtres.districtId) {
          this.charger();
        } else {
          this.chargement = false;
        }
      },
      error: err => { this.chargement = false; this.erreur(err); }
    });
  }

  charger(): void {
    this.chargement = true;
    forkJoin({
      tableau: this.consolidation.getTableauBord(this.filtres),
      factures: this.consolidation.getFactures(this.filtres)
    }).subscribe({
      next: ({ tableau, factures }) => {
        this.tableau = tableau;
        this.factures = factures || [];
        this.chargement = false;
      },
      error: err => { this.chargement = false; this.tableau = undefined; this.factures = []; this.erreur(err); }
    });
  }

  /** Transmise = soumise au centre, envoyée, validée ou payée ; sinon brouillon ou rejetée. */
  estTransmise(facture: FactureStructure): boolean {
    return !factureModifiable(facture.statut);
  }

  prestations(facture: FactureStructure): number {
    return facture.lignes?.length || 0;
  }

  /** Bénéficiaires distincts : calculés par le serveur, sinon déduits des lignes. */
  patients(facture: FactureStructure): number {
    if (facture.nombreBeneficiaires) return facture.nombreBeneficiaires;
    const cles = new Set((facture.lignes || []).map(l =>
      l.patientId || l.patientMatricule || `${l.patientNom || ''}|${l.patientPrenom || ''}`));
    return cles.size;
  }

  /** Une structure dont toutes les factures sont transmises n'a plus rien à faire. */
  aToutTransmis(structure: LigneStructureTableau): boolean {
    return structure.facturesEnCours === 0;
  }

  // ══════════════════════════ exports (§9) ══════════════════════════

  /**
   * « Situation 0-5 ans » (remplace le bouton « Excel », demande du 07/10/2026) : deux fichiers
   * d'un clic, pour le régime « Enfants de moins de 5 ans » quel que soit le filtre régime —
   * le classeur (une feuille par poste / centre, sans synthèse) et un PDF qui réunit la
   * « Liste + facture 0-5 ans » de chaque poste et centre du district.
   */
  exporterSituationEnfants(): void {
    this.export = 'excel';
    forkJoin({
      excel: this.consolidation.exporterSituationEnfantsExcel(this.filtres),
      pdf: this.consolidation.exporterSituationEnfants(this.filtres)
    }).subscribe({
      next: ({ excel, pdf }) => {
        this.export = undefined;
        const periode = this.filtres.mois
          ? `${this.filtres.annee}-${String(this.filtres.mois).padStart(2, '0')}`
          : `${this.filtres.annee}`;
        this.telecharger(excel, `SITUATION_ENFANTS_5ANS_${periode}.xlsx`);
        // Deux téléchargements trop rapprochés : certains navigateurs ne gardent que le premier.
        setTimeout(() => this.telecharger(pdf, `SITUATION_GLOBALE_ENFANTS_5ANS_${periode}.pdf`), 400);
      },
      error: err => { this.export = undefined; this.erreur(err); }
    });
  }

  /**
   * Bouton « Facture Globale » : deux documents d'un clic — la facture globale du district
   * (« Liste + facture 0-5 ans » de tous les postes et centres réunis, totaux cumulés) et la
   * liste nominative consolidée du district, TOUJOURS pour le régime « Enfants de moins de 5 ans »
   * et le mois sélectionné dans le filtre (quel que soit le régime choisi dans la liste déroulante).
   */
  exporterFactureGlobale(): void {
    this.export = 'pdf';
    // 0-5 ans imposé, district + mois/année repris du filtre (« le mois concerné »).
    const filtres = { ...this.filtres, regime: Regime.ZERO_CINQ_ANS };
    forkJoin({
      facture: this.consolidation.exporterFacturesEnfantsPdf(filtres),
      liste: this.consolidation.exporterListeEnfants(filtres)
    }).subscribe({
      next: ({ facture, liste }) => {
        this.export = undefined;
        const periode = filtres.mois
          ? `${filtres.annee}-${String(filtres.mois).padStart(2, '0')}`
          : `${filtres.annee}`;
        this.telecharger(facture, `Liste_et_facture_enfants_5ans_${periode}.pdf`);
        // Deux téléchargements trop rapprochés : certains navigateurs ne gardent que le premier.
        setTimeout(() => this.telecharger(liste, `LISTE_ENFANTS_5ANS_consolide_${periode}.pdf`), 400);
      },
      error: err => { this.export = undefined; this.erreur(err); }
    });
  }

  private telecharger(blob: Blob, nom: string): void {
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    lien.click();
    // Libérée un peu plus tard : révoquée aussitôt, l'adresse peut l'être avant que le
    // navigateur n'ait lu le fichier (deux téléchargements enchaînés).
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ══════════════════════════ affichage ══════════════════════════

  /** Clés d'une répartition, en ignorant les valeurs nulles. */
  cles(objet?: Record<string, number>): string[] {
    return objet ? Object.keys(objet).filter(cle => objet[cle] > 0) : [];
  }

  /** Mois de l'année ayant une valeur — le suivi mensuel du §10. */
  moisRenseignes(): string[] {
    return this.cles(this.tableau?.montantParMois);
  }

  /** Hauteur relative d'une barre du suivi mensuel, en pourcentage du maximum. */
  hauteurBarre(mois: string): number {
    const valeurs = Object.values(this.tableau?.montantParMois || {});
    const maximum = Math.max(...valeurs, 1);
    return Math.round(((this.tableau?.montantParMois?.[mois] || 0) / maximum) * 100);
  }

  libelleRegime(cle: string): string {
    return this.regimeLabels[cle as Regime] || cle;
  }

  private erreur(err: any): void {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
