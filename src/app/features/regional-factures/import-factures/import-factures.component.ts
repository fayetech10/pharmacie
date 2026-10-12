import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { Regime } from '../../../core/models/bcsu.model';
import {
  FactureReconnueImport, ResultatImportFactures, StructureSanitaire
} from '../../../core/models/structure.model';
import { STATUTS_FACTURE } from '../../../core/models/statuts';
import { ChoixImportFacture, StructureService } from '../../../core/services/structure.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { RegimeBadgeComponent } from '../../../shared/regime-badge/regime-badge.component';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { MOIS, libelleRegimePoste } from '../../espace-poste/poste-facturation';

/**
 * Reprise, par le Service Régional, des factures déjà générées par l'application utilisée
 * avant la bascule — <b>une facture par fichier</b>, au format de la facture Excel du régime.
 *
 * <p>L'agent choisit la structure, puis le régime (qui décide du modèle du fichier), la
 * période et le statut qu'avait la facture. Le fichier est d'abord <b>vérifié</b> (simulation
 * côté serveur : rien n'est enregistré), puis l'agent <b>confirme</b>. L'import est tout ou
 * rien et refuse une facture déjà présente pour le même régime et le même mois : réimporter
 * est sans danger.</p>
 */
@Component({
  selector: 'app-import-factures',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
    RegimeBadgeComponent, StatusBadgeComponent],
  templateUrl: './import-factures.component.html'
})
export class ImportFacturesComponent implements OnInit {
  readonly mois = MOIS;
  readonly libelleRegime = libelleRegimePoste;
  /** Tous les régimes facturables (l'ancien « Dialyse », scindé depuis, n'est pas proposé). */
  readonly regimes: Regime[] = [
    Regime.CONTRIBUTIF, Regime.NDONGO_DARA, Regime.ELEVES, Regime.ZERO_CINQ_ANS, Regime.SESAME,
    Regime.BSF_CEC, Regime.BSF, Regime.CEC, Regime.CESARIENNE, Regime.DIALYSE_PERITONEALE, Regime.HEMODIALYSE
  ];
  readonly statuts = Object.entries(STATUTS_FACTURE).map(([cle, apparence]) => ({ cle, libelle: apparence.libelle }));
  readonly listeMois = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly annees: number[];

  structures: StructureSanitaire[] = [];
  chargementStructures = true;

  structureId = '';
  regime: Regime | '' = '';
  moisChoisi: number;
  anneeChoisie: number;
  statut = '';
  numeroOrigine = '';
  fichier: File | null = null;

  /** Vérification (simulation) en cours. */
  verification = false;
  /** Import réel en cours. */
  importEnCours = false;
  /** Résultat de la vérification : aperçu, rien n'est encore enregistré. */
  apercu: ResultatImportFactures | null = null;
  /** Résultat de l'import confirmé. */
  resultat: ResultatImportFactures | null = null;

  constructor(
    private structureService: StructureService,
    private authService: AuthService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    // Factures déjà générées : par défaut, le mois écoulé.
    const precedent = new Date();
    precedent.setDate(1);
    precedent.setMonth(precedent.getMonth() - 1);
    this.moisChoisi = precedent.getMonth() + 1;
    this.anneeChoisie = precedent.getFullYear();
    const annee = new Date().getFullYear();
    this.annees = Array.from({ length: 6 }, (_, i) => annee - i);
  }

  ngOnInit() {
    const regionId = this.authService.isServiceRegional() ? this.authService.getCurrentUser()?.regionId : null;
    this.structureService.getStructures().subscribe({
      next: structures => {
        this.chargementStructures = false;
        // Le serveur refuse de toute façon une structure hors de la région : on ne la propose pas.
        this.structures = (structures || [])
          .filter(s => !regionId || s.regionId === regionId)
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      },
      error: err => { this.chargementStructures = false; this.erreur(err); }
    });
  }

  get postes(): StructureSanitaire[] {
    return this.structures.filter(s => s.typeStructure === 'PS');
  }

  get autresStructures(): StructureSanitaire[] {
    return this.structures.filter(s => s.typeStructure !== 'PS');
  }

  get structureNom(): string {
    return this.structures.find(s => s.id === this.structureId)?.nom || '';
  }

  get occupe(): boolean {
    return this.verification || this.importEnCours;
  }

  /** Tout ce qui décrit la facture est choisi : le fichier peut être déposé. */
  get pret(): boolean {
    return !!this.structureId && !!this.regime && !!this.moisChoisi && !!this.anneeChoisie && !!this.statut;
  }

  /** L'aperçu est sans erreur : l'import peut être confirmé. */
  get importable(): boolean {
    return !!this.apercu && !this.apercu.erreurs.length && this.apercu.factures.length > 0;
  }

  private get choix(): ChoixImportFacture {
    return {
      structureId: this.structureId, regime: this.regime, mois: this.moisChoisi, annee: this.anneeChoisie,
      statut: this.statut, numeroOrigine: this.numeroOrigine
    };
  }

  /** Modèle du régime choisi : la facture Excel de ce régime, préremplie de ce qui est déjà choisi. */
  telechargerModele() {
    if (!this.regime) return;
    const regime = this.regime;
    this.structureService.telechargerModeleImportFactures({
      regime, structureId: this.structureId, mois: this.moisChoisi, annee: this.anneeChoisie,
      numeroOrigine: this.numeroOrigine
    }).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `modele_facture_${regime.toLowerCase()}.xlsx`;
        lien.click();
        URL.revokeObjectURL(url);
      },
      error: err => this.erreur(err)
    });
  }

  onFichier(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fichier = input.files?.[0] || null;
    // Le même fichier, corrigé puis rechoisi, doit redéclencher la vérification.
    input.value = '';
    this.verifier();
  }

  /** Un choix a changé : l'aperçu d'un fichier déjà déposé ne vaut plus, on revérifie. */
  onChoix() {
    this.verifier();
  }

  /** Simulation : le serveur contrôle tout et renvoie l'aperçu, sans rien enregistrer. */
  verifier() {
    this.apercu = null;
    this.resultat = null;
    if (!this.pret || !this.fichier) return;
    this.verification = true;
    this.structureService.importerFactures(this.choix, this.fichier, true).subscribe({
      next: apercu => { this.verification = false; this.apercu = apercu; },
      error: err => { this.verification = false; this.erreur(err); }
    });
  }

  confirmer() {
    if (!this.importable || !this.fichier || !this.apercu) return;
    const facture = this.apercu.factures[0];
    this.confirm.ask({
      title: 'Importer la facture ?',
      message: `La facture ${this.libelleRegime(facture.regime)} de ${this.mois[facture.mois]} ${facture.annee} `
        + `de « ${this.apercu.structureNom} » (${facture.patients} visite(s), ${this.montant(facture.montantTotal)}) `
        + `va être enregistrée avec le statut « ${this.libelleStatut(facture.statut)} ».`,
      confirmText: 'Importer',
      cancelText: 'Annuler'
    }).subscribe(ok => {
      if (!ok || !this.fichier) return;
      this.importEnCours = true;
      this.structureService.importerFactures(this.choix, this.fichier, false).subscribe({
        next: resultat => {
          this.importEnCours = false;
          if (resultat.erreurs.length) {
            // Le contenu a changé entre la vérification et l'import (facture saisie entre-temps…).
            this.apercu = resultat;
            return;
          }
          this.apercu = null;
          this.resultat = resultat;
          this.snackBar.open('Facture importée.', 'Fermer', { duration: 4000 });
        },
        error: err => { this.importEnCours = false; this.erreur(err); }
      });
    });
  }

  /** Facture suivante : on garde la structure et le statut, on repart d'un autre fichier. */
  recommencer() {
    this.fichier = null;
    this.numeroOrigine = '';
    this.apercu = null;
    this.resultat = null;
  }

  ouvrir(facture: FactureReconnueImport) {
    if (facture.id) this.router.navigate(['/dashboard/factures-structure', facture.id]);
  }

  libelleStatut(statut: string): string {
    return STATUTS_FACTURE[statut]?.libelle || statut;
  }

  montant(valeur: number): string {
    return `${Math.round(valeur || 0).toLocaleString('fr-FR')} F`;
  }

  trackFacture = (_: number, f: FactureReconnueImport) => `${f.regime}|${f.annee}|${f.mois}`;

  private erreur(err: any) {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
