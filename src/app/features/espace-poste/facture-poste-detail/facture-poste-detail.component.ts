import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { last } from 'rxjs/operators';
import { FactureStructure } from '../../../core/models/structure.model';
import { Regime } from '../../../core/models/bcsu.model';
import { StructureService } from '../../../core/services/structure.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { FacturationCsuPosteComponent } from '../facturation-csu/facturation-csu.component';
import {
  MOIS, VisiteFacture, aUnPdf, cheminFacture, estForfaitaire, estModifiable, exigeCartePoste, libelleRegimePoste, lignesPatients,
  nombrePatients, telecharger, visiteACompleter, visiteCorrespond, visitesFacture
} from '../poste-facturation';
import {
  LignePatientListe, ListePatientsFactureComponent, PositionListe
} from '../../../shared/liste-patients-facture/liste-patients-facture.component';
import { EtatListe, EtatListeService } from '../../../shared/pagination/etat-liste.service';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';

/**
 * Consultation et modification d'une facture mensuelle du poste (« Mes factures → Mois →
 * Consulter / Modifier ») : une ligne par visite (nom et prénom, date, matricule), sans
 * en-tête. Un clic sur un patient ouvre son écran de détail (prestations, montants, dossier :
 * {@link PatientFactureDetailComponent}).
 *
 * <p>« Modifier » et « Compléter » sont sur l'écran du patient, pas dans cette liste ; le
 * mode modification permet d'ajouter un patient au mois. Pas de photo de l'assuré sur cet
 * écran (demande du 07/10/2026).</p>
 */
@Component({
  selector: 'app-facture-poste-detail',
  standalone: true,
  imports: [ListePatientsFactureComponent, CommonModule, FormsModule,
    RouterModule, MatIconModule, MatMenuModule, MatSnackBarModule, MatProgressSpinnerModule, FacturationCsuPosteComponent,
    StatusBadgeComponent],
  templateUrl: './facture-poste-detail.component.html'
})
export class FacturePosteDetailComponent implements OnInit {
  readonly libelleRegime = libelleRegimePoste;
  readonly moisNoms = MOIS;

  facture: FactureStructure | null = null;
  /** Les visites (une par dossier), dans l'ordre des dates. */
  visites: VisiteFacture[] = [];
  /** Lignes de la liste des patients, après la recherche. */
  lignes: LignePatientListe[] = [];
  chargement = true;
  recherche = '';
  action: string | null = null;
  /** Page et défilement retrouvés en revenant d'un patient. */
  etatRetour?: EtatListe;

  /** Assistant ouvert pour ajouter un patient au mois. */
  ajout = false;

  @ViewChild(ListePatientsFactureComponent) liste?: ListePatientsFactureComponent;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private structureService: StructureService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar,
    private auth: AuthService,
    private etatListe: EtatListeService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.etatRetour = this.etatListe.reprendre(this.cleEtat(id));
      this.recherche = this.etatRetour?.recherche || '';
      this.charger(id);
    }
  }

  charger(id: string) {
    this.chargement = !this.facture;
    this.structureService.getFacture(id).pipe(last()).subscribe({
      next: facture => {
        this.facture = facture;
        this.construire();
        this.chargement = false;
        EtatListeService.defiler(this.etatRetour);
      },
      error: err => {
        this.chargement = false;
        this.snackBar.open(err.error?.message || 'Facture introuvable.', 'Fermer', { duration: 5000 });
      }
    });
  }

  private construire() {
    this.visites = visitesFacture(this.facture);
    this.filtrer();
  }

  /** Recalcule la liste affichée (chargement, recherche). */
  filtrer(premierePage = false) {
    if (!this.facture) return;
    const retenues = this.visites.filter(v => visiteCorrespond(v, this.recherche));
    this.lignes = lignesPatients(retenues, cheminFacture('espace-ps', this.facture.id), { aCarte: this.aCarte });
    if (premierePage) this.liste?.premierePage();
  }

  private cleEtat(id: string): string {
    return 'facture-ps:' + id;
  }

  /** Un patient s'ouvre : on note où en est la liste, pour y revenir. */
  memoriserPosition(position: PositionListe) {
    if (!this.facture) return;
    this.etatListe.memoriser(this.cleEtat(this.facture.id),
      { ...position, recherche: this.recherche, defilement: window.scrollY });
  }

  // ─────────────── état dérivé ───────────────

  get modifiable(): boolean {
    return !!this.facture && estModifiable(this.facture.statut);
  }

  get aCarte(): boolean {
    return exigeCartePoste(this.facture?.regime);
  }

  get aCompleter(): number {
    return this.visites.filter(visiteACompleter).length;
  }

  get peutEnvoyer(): boolean {
    return this.modifiable && (this.facture?.lignes?.length || 0) > 0 && this.aCompleter === 0;
  }

  /**
   * Facture de centre / EPS complétée par l'import de fin de mois : elle ne part pas à la
   * clôture du mois, c'est la structure qui la transmet (bouton « Transmettre » mis en avant).
   */
  get transmiseParLaStructure(): boolean {
    return !!this.facture?.etape;
  }

  get periode(): string {
    return this.facture ? `${MOIS[this.facture.mois]} ${this.facture.annee}` : '';
  }

  // ─────────────── navigation ───────────────

  /** Retour à « Mes factures » de l'espace d'où l'on vient (poste ou centre de santé). */
  retour() {
    const f = this.facture;
    const poste = this.auth.isPosteDeSante();
    const tab = poste ? 2 : 3;
    this.router.navigate([poste ? '/dashboard/espace-poste' : '/dashboard/espace-centre'], {
      queryParams: f ? { tab, regime: f.regime, annee: f.annee } : { tab }
    });
  }

  get destinationEnvoi(): string {
    // Le 0-5 ans d'un poste (09/10/2026) et d'un centre de santé (12/10/2026) passe par le
    // district ; tout le reste — et tout ce qu'émet un EPS — va directement au service régional.
    const type = this.facture?.typeStructure || (this.auth.isPosteDeSante() ? 'PS' : null);
    return (type === 'PS' || type === 'CS') && this.facture?.regime === 'ZERO_CINQ_ANS'
      ? 'au district' : 'au service régional';
  }

  // ─────────────── dossiers ───────────────

  ajouterPatient() {
    this.ajout = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Patient ajouté : la facture renvoyée par le serveur fait foi ; l'assistant reste ouvert pour le suivant. */
  patientAjoute(facture: FactureStructure) {
    this.facture = facture;
    this.construire();
  }

  fermerAjout() {
    this.ajout = false;
    if (this.facture) this.charger(this.facture.id);
  }

  // ─────────────── facture ───────────────

  excel() {
    const f = this.facture!;
    this.action = 'excel';
    this.structureService.exportGroupeExcel(f.structureSanitaireId, f.regime, f.mois, f.annee).subscribe({
      next: blob => { this.action = null; telecharger(blob, `${f.numero}_${MOIS[f.mois]}_${f.annee}.xlsx`); },
      error: () => this.echec('Export Excel impossible.')
    });
  }

  pdf() {
    const f = this.facture!;
    if (!aUnPdf(f.regime)) return;
    this.action = 'pdf';
    this.structureService.exportFacturePdf(f.id).subscribe({
      next: blob => { this.action = null; telecharger(blob, `${f.numero}_facture_${MOIS[f.mois]}_${f.annee}.pdf`); },
      error: () => this.echec('Génération du PDF impossible.')
    });
  }

  get aUnPdf(): boolean {
    return estForfaitaire(this.facture?.regime);
  }

  /** Nombre de patients distincts de la facture (un patient revenu plusieurs fois compte une fois). */
  get nbPatients(): number {
    return nombrePatients(this.facture);
  }

  /** Document PDF « Liste nominative » : forfait (0-5 ans) ou page de garde + liste (autres régimes). */
  listeNominative() {
    if (this.estEnfants) this.enfantsPdf();
    else this.pdf();
  }

  /** Tous les rǸgimes sauf 0-5 ans ont la page de garde + liste nominative. */
  get estEnfants(): boolean {
    return !estForfaitaire(this.facture?.regime);
  }

  enfantsPdf() {
    const f = this.facture!;
    this.action = 'enfantsPdf';
    this.structureService.exportEnfantsPdf(f.id).subscribe({
      next: blob => { this.action = null; telecharger(blob, `Liste_et_facture_enfants_5ans_${f.numero}.pdf`); },
      error: () => this.echec('Génération du PDF 0-5 ans impossible.')
    });
  }

  envoyer() {
    const f = this.facture!;
    const verbe = this.transmiseParLaStructure ? 'Transmettre' : 'Envoyer';
    this.confirm.ask({
      title: `${verbe} la facture`,
      message: `${verbe} la facture ${this.libelleRegime(f.regime)} de ${this.periode} ${this.destinationEnvoi} ? `
        + 'Elle ne pourra plus être modifiée, sauf rejet.',
      confirmText: verbe
    }).subscribe(ok => {
      if (!ok) return;
      this.action = 'envoi';
      this.structureService.envoyerFacture(f.id).subscribe({
        next: facture => {
          this.action = null;
          this.facture = facture;
          this.construire();
          this.snackBar.open(this.transmiseParLaStructure ? 'Facture transmise.' : 'Facture envoyée.', 'Fermer',
            { duration: 3500 });
        },
        error: err => this.echec(err.error?.message || 'Envoi impossible.')
      });
    });
  }

  private echec(message: string) {
    this.action = null;
    this.snackBar.open(message, 'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
