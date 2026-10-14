import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable } from 'rxjs';
import { last } from 'rxjs/operators';
import { StructureService } from '../../../core/services/structure.service';
import { FactureStructure } from '../../../core/models/structure.model';
import { Regime } from '../../../core/models/bcsu.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { factureModifiable } from '../../../core/models/statuts';
import { finDuMoisAtteinte } from '../../../core/utils/fin-de-mois';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { RegimeBadgeComponent } from '../../../shared/regime-badge/regime-badge.component';
import {
  LignePatientListe, ListePatientsFactureComponent, PositionListe
} from '../../../shared/liste-patients-facture/liste-patients-facture.component';
import { EtatListe, EtatListeService } from '../../../shared/pagination/etat-liste.service';
import {
  EchelonPointage, MOIS, VisiteFacture, aUnPdf, avancementPointage, cheminFacture, estContributif, estForfaitaire, exigeCartePoste,
  libelleRegimePoste, lignesPatients, nombrePatients, telecharger, visiteCorrespond, visiteVerifiee, visitesFacture
} from '../../espace-poste/poste-facturation';

type FiltrePointage = 'tous' | 'a_verifier' | 'verifies';

/**
 * Détail d'une facture de point de soins, pour tous les rôles qui la lisent : la structure
 * qui l'a saisie (centre), le centre qui valide celle d'un poste, le service régional et le
 * niveau central. Même présentation que la facture du poste : en-tête et circuit de
 * validation, bandeau des totaux, puis la liste des patients — un tableau sans en-tête, une
 * ligne par visite (nom et prénom, date, matricule). Un clic ouvre l'écran du patient
 * (prestations, dossier, pointage « vérifié », corrections de la structure émettrice).
 */
@Component({
  selector: 'app-facture-structure-detail',
  standalone: true,
  imports: [ListePatientsFactureComponent, CommonModule, RouterModule, FormsModule,
    MatIconModule, MatMenuModule, MatSnackBarModule, MatProgressSpinnerModule, StatusBadgeComponent, RegimeBadgeComponent],
  templateUrl: './facture-structure-detail.component.html'
})
export class FactureStructureDetailComponent implements OnInit {
  readonly libelleRegime = libelleRegimePoste;

  facture: FactureStructure | null = null;
  /** Une entrée par visite (dossier, ou lettre de garantie pour les anciennes saisies). */
  visites: VisiteFacture[] = [];
  /** Lignes de la liste des patients, après recherche et filtre de pointage. */
  lignes: LignePatientListe[] = [];
  loading = true;
  busy = false;
  exporting = false;
  recherche = '';
  /** Page, recherche et défilement retrouvés en revenant d'un patient. */
  etatRetour?: EtatListe;

  @ViewChild(ListePatientsFactureComponent) liste?: ListePatientsFactureComponent;

  constructor(
    private route: ActivatedRoute,
    private location: Location,
    private structureService: StructureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    public auth: AuthService,
    private etatListe: EtatListeService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.etatRetour = this.etatListe.reprendre(this.cleEtat(id));
    this.recherche = this.etatRetour?.recherche || '';
    this.filtrePointage = (this.etatRetour?.filtre as FiltrePointage) || 'tous';
    this.load(id);
  }

  private load(id: string) {
    this.loading = true;
    this.structureService.getFacture(id).pipe(last()).subscribe({
      next: f => {
        this.appliquer(f);
        this.loading = false;
        EtatListeService.defiler(this.etatRetour);
      },
      error: () => { this.loading = false; }
    });
  }

  private appliquer(f: FactureStructure) {
    this.facture = f;
    this.visites = visitesFacture(f);
    this.filtrer();
  }

  // ══════════════════════════ droits ══════════════════════════

  get canSend(): boolean {
    return !!this.facture && factureModifiable(this.facture.statut);
  }

  /** La structure émettrice peut corriger ses saisies AVANT l'envoi (ou après rejet). */
  get canEditLines(): boolean {
    return this.auth.isStructureSanitaire() && this.canSend
      && this.auth.getCurrentUser()?.structureSanitaireId === this.facture?.structureSanitaireId;
  }

  get canEnvoyer(): boolean {
    return this.canEditLines && (this.facture?.lignes?.length || 0) > 0 && !this.facture?.nombreDossiersACompleter;
  }

  /** « Envoyer maintenant » n'apparaît qu'à la fin du mois facturé. */
  get finDuMois(): boolean {
    return finDuMoisAtteinte(this.facture?.mois, this.facture?.annee);
  }

  /** Le service régional valide ou rejette une facture reçue (ENVOYEE). */
  get canReview(): boolean {
    return !!this.facture && this.facture.statut === 'ENVOYEE' && this.auth.isServiceRegional();
  }

  /**
   * Le DISTRICT valide ou rejette la facture d'un poste de son district (SOUMISE_CS) — rôle
   * tenu par le centre de rattachement jusqu'au 08/10/2026.
   */
  get canReviewPoste(): boolean {
    return !!this.facture && this.facture.statut === 'SOUMISE_CS' && this.auth.aCapaciteDistrict();
  }

  // ══════════════════════════ pointage des patients ══════════════════════════

  /**
   * Échelon qui pointe en ce moment : le centre pendant la validation de la facture d'un
   * poste, le service régional pendant la sienne. Le pointage lui-même se fait sur l'écran
   * du patient ; la liste en montre l'avancement et filtre dessus.
   */
  get echelonPointage(): EchelonPointage | null {
    if (this.canReviewPoste) return 'centre';
    if (this.canReview) return 'region';
    return null;
  }

  /** Filtre de la liste pendant le pointage. */
  filtrePointage: FiltrePointage = 'tous';
  readonly filtresPointage = [
    { cle: 'tous' as const, libelle: 'Tous' },
    { cle: 'a_verifier' as const, libelle: 'À vérifier' },
    { cle: 'verifies' as const, libelle: 'Vérifiés' }
  ];

  /** Avancement du pointage de l'échelon courant, en patients distincts. */
  get pointage(): { faits: number; total: number } {
    const echelon = this.echelonPointage;
    return echelon ? avancementPointage(this.facture, echelon) : { faits: 0, total: 0 };
  }

  choisirFiltrePointage(filtre: FiltrePointage) {
    this.filtrePointage = filtre;
    this.filtrer(true);
  }

  /** Avant de valider : signaler les patients que l'échelon n'a pas pointés. */
  private avertissementPointage(): string {
    const { faits, total } = this.pointage;
    const restants = total - faits;
    return restants > 0
      ? ` Attention : ${restants} patient(s) sur ${total} n'ont pas été pointés « vérifiés ».`
      : (total > 0 ? ` Les ${total} patients ont été vérifiés.` : '');
  }

  // ══════════════════════════ état dérivé ══════════════════════════

  get rejetee(): boolean {
    const s = this.facture?.statut;
    return s === 'REJETEE_CS' || s === 'REJETEE_SR' || s === 'REJETEE_NC';
  }

  get tauxSencsu(): number {
    return estContributif(this.facture?.regime) ? 80 : 100;
  }

  get aUnPdf(): boolean {
    return aUnPdf(this.facture?.regime);
  }

  get periode(): string {
    return this.facture ? `${MOIS[this.facture.mois] || ''} ${this.facture.annee}` : '';
  }

  get destinationEnvoi(): string {
    // Un poste n'envoie au district que le 0-5 ans (09/10/2026) ; les autres régimes vont au SR.
    return this.auth.isPosteDeSante() && this.facture?.regime === 'ZERO_CINQ_ANS'
      ? 'au district' : 'au service régional';
  }

  /** Patients distincts (un patient revenu dans le mois compte une fois). */
  get nombrePatients(): number {
    return nombrePatients(this.facture) || this.visites.length;
  }

  /** Nombre de dossiers patients marqués « rejetés » par l'échelon courant. */
  get nbRejetes(): number {
    const dossiers = this.facture?.dossiers;
    if (!dossiers?.length) return 0;
    if (this.canReviewPoste) return dossiers.filter(d => !!d.rejeteCentreLe).length;
    if (this.canReview)      return dossiers.filter(d => !!d.rejeteRegionLe).length;
    return 0;
  }

  // ══════════════════════════ liste des patients ══════════════════════════

  /** Recalcule la liste affichée (chargement, recherche, filtre de pointage). */
  filtrer(premierePage = false) {
    if (!this.facture) return;
    const echelon = this.echelonPointage;
    let retenues = this.visites.filter(v => visiteCorrespond(v, this.recherche));
    if (echelon && this.filtrePointage !== 'tous') {
      const voulu = this.filtrePointage === 'verifies';
      retenues = retenues.filter(v => !!v.dossier && visiteVerifiee(v, echelon) === voulu);
    }
    this.lignes = lignesPatients(retenues, cheminFacture('structure', this.facture.id),
      { aCarte: exigeCartePoste(this.facture.regime), echelon });
    if (premierePage) this.liste?.premierePage();
  }

  get messageVide(): string {
    if (!this.visites.length) return 'Aucun patient sur cette facture.';
    return 'Aucun patient ne correspond à ce filtre.';
  }

  private cleEtat(id: string): string {
    return 'facture-structure:' + id;
  }

  /** Un patient s'ouvre : on note où en est la liste, pour y revenir. */
  memoriserPosition(position: PositionListe) {
    if (!this.facture) return;
    this.etatListe.memoriser(this.cleEtat(this.facture.id),
      { ...position, recherche: this.recherche, filtre: this.filtrePointage, defilement: window.scrollY });
  }

  // ══════════════════════════ navigation et documents ══════════════════════════

  retour() {
    this.location.back();
  }

  exporterExcel() {
    const f = this.facture!;
    this.exporting = true;
    this.structureService.exportFactureExcel(f.id).subscribe({
      next: blob => { this.exporting = false; telecharger(blob, `Facture_${f.numero}.xlsx`); },
      error: err => { this.exporting = false; this.erreur(err); }
    });
  }

  exporterPdf() {
    const f = this.facture!;
    this.exporting = true;
    this.structureService.exportFacturePdf(f.id).subscribe({
      next: blob => { this.exporting = false; telecharger(blob, `Facture_${f.numero}.pdf`); },
      error: err => { this.exporting = false; this.erreur(err); }
    });
  }

  /** Tous les rǸgimes sauf 0-5 ans ont la page de garde + liste nominative. */
  get estEnfants(): boolean {
    return !estForfaitaire(this.facture?.regime);
  }

  exporterEnfantsPdf() {
    const f = this.facture!;
    this.exporting = true;
    this.structureService.exportEnfantsPdf(f.id).subscribe({
      next: blob => { this.exporting = false; telecharger(blob, `Liste_et_facture_enfants_5ans_${f.numero}.pdf`); },
      error: err => { this.exporting = false; this.erreur(err); }
    });
  }

  // ══════════════════════════ circuit de validation ══════════════════════════

  envoyer() {
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: `La facture sera transmise ${this.destinationEnvoi}. Elle ne pourra plus être modifiée, sauf rejet.`,
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (ok) this.action(() => this.structureService.envoyerFacture(this.facture!.id), `Facture envoyée ${this.destinationEnvoi}.`);
    });
  }

  valider() {
    this.confirm.ask({
      title: 'Valider la facture',
      message: 'Confirmez la validation de cette facture.' + this.avertissementPointage(),
      confirmText: 'Valider'
    }).subscribe(ok => {
      if (ok) this.action(() => this.structureService.validerFacture(this.facture!.id), 'Facture validée.');
    });
  }

  rejeter() {
    this.confirm.ask({
      title: 'Renvoyer la facture à la structure',
      message: `${this.nbRejetes} patient(s) rejeté(s) seront renvoyés à la structure pour correction. `
        + 'Leur motif accompagne la facture.',
      confirmText: 'Renvoyer',
      danger: true
    }).subscribe(ok => {
      if (ok) this.action(() => this.structureService.rejeterFacture(this.facture!.id, ''), 'Facture renvoyée à la structure.');
    });
  }

  validerPoste() {
    this.confirm.ask({
      title: 'Valider la facture du poste',
      message: 'Confirmez la validation de cette facture. Elle sera transmise au service régional.'
        + this.avertissementPointage(),
      confirmText: 'Valider'
    }).subscribe(ok => {
      if (ok) this.action(() => this.structureService.validerFacturePoste(this.facture!.id), 'Facture validée et transmise.');
    });
  }

  rejeterPoste() {
    this.confirm.ask({
      title: 'Renvoyer la facture au poste',
      message: `${this.nbRejetes} patient(s) rejeté(s) seront renvoyés au poste de santé pour correction. `
        + 'Leur motif accompagne la facture.',
      confirmText: 'Renvoyer',
      danger: true
    }).subscribe(ok => {
      if (ok) this.action(() => this.structureService.rejeterFacturePoste(this.facture!.id, ''), 'Facture renvoyée au poste.');
    });
  }

  /** Appel au serveur qui renvoie la facture à jour ; un seul traitement d'erreur. */
  private action(appel: () => Observable<FactureStructure>, message: string) {
    this.busy = true;
    appel().subscribe({
      next: f => {
        this.busy = false;
        this.appliquer(f);
        this.snackBar.open(message, 'Fermer', { duration: 3000 });
      },
      error: err => { this.busy = false; this.erreur(err); }
    });
  }

  private erreur(err: any) {
    this.snackBar.open(err?.error?.message || err?.message || 'Opération impossible.', 'Fermer',
      { duration: 6000, panelClass: 'error-snackbar' });
  }
}
