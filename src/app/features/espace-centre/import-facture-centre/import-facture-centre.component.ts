import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { last } from 'rxjs/operators';

import { Regime } from '../../../core/models/bcsu.model';
import { RapportRapprochement } from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { MOIS, libelleRegimePoste } from '../../espace-poste/poste-facturation';
import { TicketsSerieComponent } from '../tickets-serie/tickets-serie.component';

/**
 * Import de fin de mois d'un centre de santé / EPS (spécification « Facturation CS / EPS »).
 *
 * <p>Le BCSU a enregistré les patients au fil du mois ; la structure complète leurs
 * prestations depuis son logiciel, dans <b>notre modèle Excel du régime</b>, prérempli de
 * ces patients. Le fichier est d'abord <b>rapproché</b> sans rien enregistrer (clé du régime
 * + date de prise en charge), puis la structure confirme. Les visites rapprochées sont
 * complétées, le reste est rapporté pour correction ; réimporter remplace les prestations
 * importées, sans doublon.</p>
 */
@Component({
  selector: 'app-import-facture-centre',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
    TicketsSerieComponent],
  templateUrl: './import-facture-centre.component.html'
})
export class ImportFactureCentreComponent {
  readonly mois = MOIS;
  readonly libelleRegime = libelleRegimePoste;
  /** Régimes à clé de rapprochement : les autres restent facturés sur lettre de garantie. */
  readonly regimes: Regime[] = [
    Regime.CONTRIBUTIF, Regime.BSF, Regime.CEC, Regime.SESAME, Regime.CESARIENNE, Regime.ZERO_CINQ_ANS
  ];
  readonly listeMois = Array.from({ length: 12 }, (_, i) => i + 1);
  readonly annees: number[];

  regime: Regime | '' = '';
  moisChoisi: number;
  anneeChoisie: number;
  fichier: File | null = null;

  verification = false;
  importEnCours = false;
  chargementDernier = false;
  /** Aperçu (rien n'est enregistré), import confirmé, ou dernier import réaffiché. */
  rapport: RapportRapprochement | null = null;
  /** Le rapport affiché est celui du dernier import, relu : pas d'action possible dessus. */
  rapportArchive = false;
  /** Saisie des tickets de caisse en série, ouverte après l'import (ou à tout moment). */
  modeTickets = false;

  constructor(
    private structureService: StructureService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    // L'import se fait en fin de mois, ou dans les premiers jours du suivant : jusqu'au 10,
    // on propose le mois écoulé.
    const reference = new Date();
    if (reference.getDate() <= 10) {
      reference.setDate(1);
      reference.setMonth(reference.getMonth() - 1);
    }
    this.moisChoisi = reference.getMonth() + 1;
    this.anneeChoisie = reference.getFullYear();
    const annee = new Date().getFullYear();
    this.annees = [annee, annee - 1];
  }

  get occupe(): boolean {
    return this.verification || this.importEnCours || this.chargementDernier;
  }

  get pret(): boolean {
    return !!this.regime && !!this.moisChoisi && !!this.anneeChoisie;
  }

  get periode(): string {
    return `${this.mois[this.moisChoisi]} ${this.anneeChoisie}`;
  }

  /** Un choix a changé : l'aperçu d'un fichier déjà déposé ne vaut plus, on revérifie. */
  onChoix() {
    this.rapport = null;
    this.rapportArchive = false;
    this.verifier();
  }

  telechargerModele() {
    if (!this.regime) return;
    const regime = this.regime;
    this.structureService.telechargerModeleRapprochement(regime, this.moisChoisi, this.anneeChoisie).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `import_${regime.toLowerCase()}_${this.anneeChoisie}-${String(this.moisChoisi).padStart(2, '0')}.xlsx`;
        lien.click();
        URL.revokeObjectURL(url);
      },
      error: err => this.erreur(err)
    });
  }

  onFichier(event: Event) {
    const input = event.target as HTMLInputElement;
    this.fichier = input.files?.[0] || null;
    // Le même fichier, corrigé puis rechoisi, doit redéclencher le rapprochement.
    input.value = '';
    this.verifier();
  }

  /** Aperçu : le serveur rapproche tout et renvoie le rapport, sans rien enregistrer. */
  verifier() {
    if (!this.pret || !this.fichier || !this.regime) return;
    this.rapport = null;
    this.rapportArchive = false;
    this.verification = true;
    this.structureService.importerRapprochement(this.regime, this.moisChoisi, this.anneeChoisie, this.fichier, true)
      .subscribe({
        next: rapport => { this.verification = false; this.rapport = rapport; },
        error: err => { this.verification = false; this.erreur(err); }
      });
  }

  confirmer() {
    const apercu = this.rapport;
    if (!apercu || !apercu.simulation || !apercu.applicable || !this.fichier || !this.regime) return;
    const regime = this.regime;
    this.confirm.ask({
      title: 'Confirmer l\'import ?',
      message: `${apercu.rapprochees.length} patient(s) de la facture ${this.libelleRegime(regime)} de ${this.periode} `
        + `vont recevoir ${apercu.prestationsImportees} prestation(s) (${this.montant(apercu.montantImporte)}). `
        + 'Les prestations déjà importées pour ces patients seront remplacées.',
      confirmText: 'Importer',
      cancelText: 'Annuler'
    }).subscribe(ok => {
      if (!ok || !this.fichier) return;
      this.importEnCours = true;
      this.structureService.importerRapprochement(regime, this.moisChoisi, this.anneeChoisie, this.fichier, false)
        .subscribe({
          next: rapport => {
            this.importEnCours = false;
            this.rapport = rapport;
            if (rapport.simulation) {
              // La facture a changé entre l'aperçu et la confirmation (transmise, patient retiré…).
              this.snackBar.open('L\'import n\'a pas pu être appliqué : voir le rapport.', 'Fermer', { duration: 6000 });
              return;
            }
            this.fichier = null;
            this.snackBar.open('Import enregistré.', 'Fermer', { duration: 4000 });
          },
          error: err => { this.importEnCours = false; this.erreur(err); }
        });
    });
  }

  /** Réaffiche le rapport du dernier import confirmé pour ce régime et ce mois. */
  voirDernierImport() {
    if (!this.regime) return;
    this.chargementDernier = true;
    this.structureService.dernierRapprochement(this.regime, this.moisChoisi, this.anneeChoisie).pipe(last()).subscribe({
      next: rapport => {
        this.chargementDernier = false;
        if (!rapport) {
          this.snackBar.open(`Aucun import enregistré pour ${this.periode}.`, 'Fermer', { duration: 4000 });
          return;
        }
        this.fichier = null;
        this.rapport = rapport;
        this.rapportArchive = true;
      },
      error: err => { this.chargementDernier = false; this.erreur(err); }
    });
  }

  abandonner() {
    this.fichier = null;
    this.rapport = null;
    this.rapportArchive = false;
  }

  ouvrirFacture() {
    if (this.rapport?.factureId) this.router.navigate(['/dashboard/espace-ps/factures', this.rapport.factureId]);
  }

  dateFr(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, j] = iso.substring(0, 10).split('-');
    return `${j}/${m}/${a}`;
  }

  datesFr(isos: string[]): string {
    return isos.map(d => this.dateFr(d)).join(', ');
  }

  lignesFr(lignes: number[]): string {
    return lignes.join(', ');
  }

  montant(valeur: number): string {
    return `${Math.round(valeur || 0).toLocaleString('fr-FR')} F`;
  }

  private erreur(err: any) {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
