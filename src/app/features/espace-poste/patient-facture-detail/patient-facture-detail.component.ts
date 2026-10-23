import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, Subscription } from 'rxjs';
import { last } from 'rxjs/operators';
import { DossierPatient, FactureStructure } from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { supprimableParServiceRegional } from '../../../core/models/statuts';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { PatientDetailComponent } from '../../patients/patient-detail/patient-detail.component';
import { FacturationCsuPosteComponent } from '../facturation-csu/facturation-csu.component';
import { DossierPatientContenuComponent } from '../dossier-patient-dialog/dossier-patient-contenu.component';
import {
  ContexteFacture, EchelonPointage, LigneIndexee, VisiteFacture, cheminFacture, clePatientVisite, dateFr,
  estContributif, estForfaitaire, estModifiable, exigeCartePoste, visiteACompleter, visitesFacture
} from '../poste-facturation';

/** Une information affichée, seulement si elle est renseignée. */
interface Info {
  libelle: string;
  valeur: string;
  mono?: boolean;
}

/**
 * Détail d'un patient d'une facture (« facture → patient ») : une visite — identité,
 * prestations et montants, pièces du dossier — avec ce que l'utilisateur peut y faire :
 *  - Espace PS, facture modifiable : Modifier / Compléter (assistant de facturation), Retirer ;
 *    un dossier « à compléter » s'ouvre directement sur son formulaire et, une fois enregistré,
 *    on passe au suivant à compléter (retour à la facture quand il n'en reste plus) ;
 *  - structure émettrice avant l'envoi : corriger ou supprimer une prestation, Retirer ;
 *  - service régional, à toute étape avant la validation nationale (brouillon compris) :
 *    supprimer une prestation, Retirer ;
 *  - contrôle (centre pour un poste, service régional) : pointer le patient « vérifié ».
 * Les autres visites du même patient dans le mois sont listées ; « Précédent / Suivant »
 * parcourt les patients de la facture. Pas de photo de l'assuré sur cet écran.
 */
@Component({
  selector: 'app-patient-facture-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatIconModule, MatDialogModule, MatSnackBarModule,
    MatProgressSpinnerModule, StatusBadgeComponent, DossierPatientContenuComponent, FacturationCsuPosteComponent],
  templateUrl: './patient-facture-detail.component.html'
})
export class PatientFactureDetailComponent implements OnInit, OnDestroy {
  readonly dateFr = dateFr;

  contexte: ContexteFacture = 'espace-ps';
  facture: FactureStructure | null = null;
  /** Toutes les visites de la facture, dans l'ordre de la liste. */
  visites: VisiteFacture[] = [];
  visite: VisiteFacture | null = null;
  /** Les visites du même patient dans le mois, celle-ci comprise. */
  visitesDuPatient: VisiteFacture[] = [];
  /** Dossier montré dans « Dossier patient » (reconstitué pour une saisie sans dossier). */
  dossierAffiche: DossierPatient | null = null;
  chargement = true;
  /** Assistant de facturation ouvert sur cette visite. */
  edition = false;
  /** Assistant ouvert pour compléter un dossier : une fois enregistré, on passe au suivant. */
  private enCompletion = false;
  /**
   * Un dossier « à compléter » s'ouvre d'office sur son formulaire, une fois par visite :
   * fermé par l'agent, il ne se rouvre pas tout seul.
   */
  private ouvertureAutoFaite = false;
  /** Appel en cours (retrait, correction, pointage). */
  occupe = false;
  /** Ouvert depuis la liste de la facture : « Retour » y revient par l'historique (page, recherche gardées). */
  private depuisFacture = false;

  /** Prestation en cours de correction (modale). */
  ligneEditee: LigneIndexee | null = null;
  modeleLigne = { designation: '', quantite: 1, prixUnitaire: 0, codeActe: '' };

  afficherIdentite = false;
  afficherDossier = false;

  private factureId = '';
  private cleVisite = '';
  private abonnement?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private structureService: StructureService,
    private confirm: ConfirmService,
    private auth: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.depuisFacture = !!(this.router.getCurrentNavigation()?.extras.state?.['depuisFacture'] ?? history.state?.depuisFacture);
  }

  ngOnInit() {
    this.contexte = this.route.snapshot.data['contexte'] === 'structure' ? 'structure' : 'espace-ps';
    // Passer à une autre visite garde le même écran : on suit les paramètres.
    this.abonnement = this.route.paramMap.subscribe(params => {
      const factureId = params.get('id') || '';
      this.cleVisite = params.get('visite') || '';
      this.edition = false;
      this.enCompletion = false;
      this.ouvertureAutoFaite = false;
      this.ligneEditee = null;
      if (factureId !== this.factureId || !this.facture) {
        this.factureId = factureId;
        this.charger();
      } else {
        this.construire();
      }
      window.scrollTo({ top: 0 });
    });
  }

  ngOnDestroy() {
    this.abonnement?.unsubscribe();
  }

  private charger() {
    this.chargement = !this.facture;
    this.structureService.getFacture(this.factureId).pipe(last()).subscribe({
      next: facture => {
        this.facture = facture;
        this.construire();
        this.chargement = false;
      },
      error: err => {
        this.chargement = false;
        this.snackBar.open(err.error?.message || 'Facture introuvable.', 'Fermer', { duration: 5000 });
      }
    });
  }

  private construire() {
    this.visites = visitesFacture(this.facture);
    const v = this.visites.find(x => x.cle === this.cleVisite) || null;
    this.visite = v;
    const cle = v ? clePatientVisite(v) : null;
    // « Visites du mois » dans l'ordre chronologique (la facture, elle, met les dernières en tête).
    this.visitesDuPatient = cle ? this.visites.filter(x => clePatientVisite(x) === cle).sort((a, b) => a.rang - b.rang) : [];
    this.dossierAffiche = !v ? null : v.dossier || {
      id: v.lignes[0]?.dossierId || v.cle, statut: 'COMPLET', identiteVerrouillee: false, pieces: [],
      prenom: v.prenom, nom: v.nom, matricule: v.matricule, lettreGarantieNumero: v.lettreNumero
    };
    if (!this.peutModifierDossier) this.edition = false;
    // Dossier « à compléter » : directement son formulaire, sans passer par la fiche en lecture
    // ni par le bouton « Compléter » (demande du 19/10/2026).
    if (v && !this.ouvertureAutoFaite) {
      this.ouvertureAutoFaite = true;
      if (this.peutModifierDossier && this.aCompleter) this.editer();
    }
  }

  // ─────────────── droits ───────────────

  get modifiable(): boolean {
    return !!this.facture && estModifiable(this.facture.statut);
  }

  /** Espace PS : le poste (ou le centre) complète ses propres dossiers tant que la facture n'est pas partie. */
  get peutModifierDossier(): boolean {
    return this.contexte === 'espace-ps' && this.modifiable && !!this.visite?.dossier;
  }

  /** Structure émettrice : corrige ses prestations avant l'envoi (ou après un rejet). */
  get peutCorrigerLignes(): boolean {
    return this.contexte === 'structure' && this.modifiable && this.auth.isStructureSanitaire()
      && this.auth.getCurrentUser()?.structureSanitaireId === this.facture?.structureSanitaireId;
  }

  /**
   * Service régional : supprime des prestations ou retire le patient d'une facture de sa région,
   * même en brouillon, tant que le niveau central ne l'a pas validée (le serveur contrôle la région).
   */
  get peutSupprimerSR(): boolean {
    return this.contexte === 'structure' && this.auth.isServiceRegional() && !!this.facture
      && supprimableParServiceRegional(this.facture.statut);
  }

  /** Bouton « Supprimer » sur les prestations : la structure émettrice ou le service régional. */
  get peutSupprimerLignes(): boolean {
    return this.peutCorrigerLignes || this.peutSupprimerSR;
  }

  get peutRetirer(): boolean {
    return this.contexte === 'espace-ps' ? this.modifiable : this.peutSupprimerLignes;
  }

  /**
   * Échelon qui pointe en ce moment : le centre pendant la validation de la facture d'un
   * poste, le service régional pendant la sienne. Hors de ces étapes, les pointages déjà faits
   * restent affichés mais ne se modifient plus.
   */
  get echelonPointage(): EchelonPointage | null {
    const f = this.facture;
    if (this.contexte !== 'structure' || !f) return null;
    // 1er échelon (clé « centre », champs verifieCentre*) : tenu par le DISTRICT depuis le 08/10/2026.
    if (f.statut === 'SOUMISE_CS' && this.auth.aCapaciteDistrict()) return 'centre';
    if (f.statut === 'ENVOYEE' && this.auth.isServiceRegional()) return 'region';
    return null;
  }

  // ─────────────── état dérivé ───────────────

  get forfaitaire(): boolean {
    return estForfaitaire(this.facture?.regime);
  }

  get aCarte(): boolean {
    return exigeCartePoste(this.facture?.regime) && !this.visite?.lettreNumero;
  }

  get tauxSencsu(): number {
    return estContributif(this.facture?.regime) ? 80 : 100;
  }

  get aCompleter(): boolean {
    return !!this.visite && visiteACompleter(this.visite);
  }

  /** Position du patient dans la facture (1 à N). */
  get position(): number {
    return this.visite ? this.visites.indexOf(this.visite) + 1 : 0;
  }

  get precedente(): VisiteFacture | null {
    return this.position > 1 ? this.visites[this.position - 2] : null;
  }

  get suivante(): VisiteFacture | null {
    return this.position && this.position < this.visites.length ? this.visites[this.position] : null;
  }

  /**
   * La colonne latérale (« Visites du mois », retrait) a-t-elle du contenu ? Sinon, inutile de
   * réserver ses 340 px : la carte Prestations prend alors toute la largeur de la page.
   */
  get aColonneLaterale(): boolean {
    return this.visitesDuPatient.length > 1 || (this.peutRetirer && !this.edition);
  }

  /** Identité du patient et détails de la visite : les champs renseignés seulement. */
  get identite(): Info[] {
    const v = this.visite;
    if (!v) return [];
    return this.renseignees([
      { libelle: 'Matricule', valeur: v.matricule || '', mono: true },
      { libelle: 'Date de la visite', valeur: dateFr(v.date) },
      { libelle: 'Date de naissance', valeur: dateFr(v.dateNaissance) },
      { libelle: 'Sexe', valeur: v.sexe === 'M' ? 'Masculin' : v.sexe === 'F' ? 'Féminin' : '' },
      { libelle: 'Téléphone', valeur: v.telephone || '' },
      { libelle: 'Adresse', valeur: v.adresse || '' },
      { libelle: 'N° de CNI', valeur: v.numeroCni || '', mono: true },
      { libelle: 'N° de registre', valeur: v.numeroRegistre || '', mono: true },
      { libelle: 'Lettre de garantie', valeur: v.lettreNumero || '', mono: true },
      { libelle: 'Service', valeur: v.service || '' },
      { libelle: 'Dialyse (IRC / IRA)', valeur: v.ircIra || '' },
      { libelle: 'Indication', valeur: v.indicationCbt || '' }
    ]);
  }

  /** Carte CSU contrôlée à la saisie (régimes à carte). */
  get carte(): Info[] {
    const v = this.visite;
    const d = v?.dossier;
    if (!v || !this.aCarte) return [];
    const validite = d?.dateDebutValidite || d?.dateFinValidite
      ? `${dateFr(d.dateDebutValidite) || '…'} au ${dateFr(d.dateFinValidite) || '…'}` : '';
    return this.renseignees([
      { libelle: 'Vérification', valeur: v.verificationCarte === 'VERIFIEE' ? 'Carte vérifiée en ligne'
          : v.verificationCarte === 'NON_VERIFIEE_PANNE' ? 'Non vérifiée (système en panne)' : '' },
      { libelle: 'Catégorie', valeur: d?.categorieCarte || '' },
      { libelle: 'État', valeur: d?.etatCarte || '' },
      { libelle: 'Validité', valeur: validite },
      { libelle: 'Mutuelle', valeur: d?.mutuelle || '' },
      { libelle: "Type d'adhésion", valeur: d?.typeAdhesion || '' },
      { libelle: 'Taux de couverture', valeur: d?.tauxCouverture != null ? `${d.tauxCouverture} %` : '' }
    ]);
  }

  private renseignees(infos: Info[]): Info[] {
    return infos.filter(i => !!i.valeur && i.valeur.trim() !== '');
  }

  // ─────────────── pointage du contrôle ───────────────

  /** Patient pointé à cet échelon : toutes ses visites du mois le sont. */
  estVerifie(echelon: EchelonPointage | null): boolean {
    if (!echelon) return false;
    const dossiers = this.visitesDuPatient.map(v => v.dossier).filter((d): d is DossierPatient => !!d);
    return dossiers.length > 0 && dossiers.every(d => echelon === 'centre' ? !!d.verifieCentreLe : !!d.verifieRegionLe);
  }

  /** « Vérifié par … le … à … » — l'info-bulle du pointage. */
  infoVerification(echelon: EchelonPointage | null): string | null {
    if (!echelon || !this.estVerifie(echelon)) return null;
    const d = this.visitesDuPatient.map(v => v.dossier).filter((x): x is DossierPatient => !!x).pop()!;
    const le = echelon === 'centre' ? d.verifieCentreLe : d.verifieRegionLe;
    const par = echelon === 'centre' ? d.verifieCentrePar : d.verifieRegionPar;
    const date = le ? `${dateFr(le)} à ${le.substring(11, 16)}` : '';
    return `Vérifié${par ? ' par ' + par : ''}${date ? ' le ' + date : ''}`;
  }

  /** Coche (ou décoche) « vérifié » le patient : toutes ses visites du mois ensemble. */
  pointer() {
    const echelon = this.echelonPointage;
    const dossierIds = this.visitesDuPatient.map(v => v.dossier?.id).filter((id): id is string => !!id);
    if (!echelon || !this.facture || !dossierIds.length || this.occupe) return;
    this.executer(() => this.structureService.pointerPatient(this.facture!.id, dossierIds, !this.estVerifie(echelon)));
  }

  /** Patient rejeté à cet échelon : toutes ses visites du mois le sont. */
  estRejete(echelon: EchelonPointage | null): boolean {
    if (!echelon) return false;
    const dossiers = this.visitesDuPatient.map(v => v.dossier).filter((d): d is DossierPatient => !!d);
    return dossiers.length > 0 && dossiers.every(d => echelon === 'centre' ? !!d.rejeteCentreLe : !!d.rejeteRegionLe);
  }

  /** Rejette (ou annule le rejet) ce patient, avec un motif : toutes ses visites du mois ensemble. */
  rejeter() {
    const echelon = this.echelonPointage;
    const dossierIds = this.visitesDuPatient.map(v => v.dossier?.id).filter((id): id is string => !!id);
    if (!echelon || !this.facture || !dossierIds.length || this.occupe) return;
    if (this.estRejete(echelon)) {
      this.executer(() => this.structureService.rejeterPatient(this.facture!.id, dossierIds, '', false), 'Rejet du patient annulé.');
      return;
    }
    this.confirm.prompt({
      title: 'Rejeter ce patient',
      message: 'Indiquez le motif. La facture sera renvoyée à la structure pour correction de ce patient.',
      label: 'Motif du rejet',
      placeholder: 'Ex : pièce manquante, montant non conforme…',
      confirmText: 'Rejeter', danger: true, required: true, maxLength: 500
    }).subscribe(motif => {
      if (motif) this.executer(() => this.structureService.rejeterPatient(this.facture!.id, dossierIds, motif, true), 'Patient rejeté.');
    });
  }

  /** Rejet de ce patient (quel que soit l'échelon), pour l'afficher à la structure qui corrige. */
  get rejetDuPatient(): { par: string; motif: string } | null {
    const d = this.visitesDuPatient.map(v => v.dossier)
      .filter((x): x is DossierPatient => !!x).find(x => x.rejeteCentreLe || x.rejeteRegionLe);
    if (!d) return null;
    const region = !!d.rejeteRegionLe;
    return {
      par: region ? (d.rejeteRegionPar || 'le service régional') : (d.rejeteCentrePar || 'le district'),
      motif: (region ? d.rejeteRegionMotif : d.rejeteCentreMotif) || ''
    };
  }

  // ─────────────── navigation ───────────────

  lienVisite(v: VisiteFacture): any[] {
    return [...cheminFacture(this.contexte, this.factureId), 'patients', v.cle];
  }

  /** État transmis d'un patient à l'autre, pour que « Retour » revienne toujours à la liste. */
  get etatNavigation(): { depuisFacture: boolean } {
    return { depuisFacture: this.depuisFacture };
  }

  /** Autre patient de la facture : remplace l'écran courant dans l'historique. */
  allerA(v: VisiteFacture | null) {
    if (!v) return;
    this.router.navigate(this.lienVisite(v), { replaceUrl: true, state: this.etatNavigation });
  }

  /** Retour à la facture, si possible à la page quittée. */
  retour() {
    if (this.depuisFacture) {
      this.location.back();
      return;
    }
    this.router.navigate(cheminFacture(this.contexte, this.factureId));
  }

  /** Fiche du bénéficiaire (lettres, bons, factures), quand la ligne le rattache au référentiel. */
  ouvrirFicheBeneficiaire() {
    if (!this.visite?.patientId) return;
    this.dialog.open(PatientDetailComponent, {
      data: { patientId: this.visite.patientId },
      width: '95vw',
      maxWidth: '1200px',
      height: '95vh',
      autoFocus: false
    });
  }

  // ─────────────── modification (Espace PS) ───────────────

  editer() {
    if (!this.peutModifierDossier) return;
    this.edition = true;
    this.enCompletion = this.aCompleter;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Fin de l'assistant : la facture renvoyée par le serveur fait foi. Après avoir complété un
   * dossier, on enchaîne sur le suivant à compléter (demande du 19/10/2026) ; après une
   * simple modification, on reste sur le patient.
   */
  editionTerminee(facture: FactureStructure) {
    this.facture = facture;
    this.edition = false;
    const enchainer = this.enCompletion;
    this.enCompletion = false;
    this.construire();
    if (enchainer) this.allerAuSuivantACompleter();
  }

  /**
   * Patient suivant « à compléter » dans l'ordre de la liste (à défaut, le premier qui reste),
   * ouvert directement sur son formulaire ; s'il n'en reste aucun, retour à la facture. Le
   * patient qu'on vient d'enregistrer est sauté, même laissé « à compléter » exprès.
   */
  private allerAuSuivantACompleter() {
    const position = this.visites.findIndex(v => v.cle === this.cleVisite);
    const restants = this.visites.filter(v => v.cle !== this.cleVisite && !!v.dossier && visiteACompleter(v));
    const suivant = restants.find(v => this.visites.indexOf(v) > position) || restants[0];
    if (suivant) {
      this.snackBar.open(`Dossier enregistré. Patient suivant à compléter : ${suivant.nomComplet}.`, 'Fermer', { duration: 4000 });
      this.allerA(suivant);
      return;
    }
    this.snackBar.open('Dossier enregistré. Plus aucun patient à compléter sur cette facture.', 'Fermer', { duration: 4000 });
    this.retour();
  }

  fermerEdition() {
    this.edition = false;
    this.charger();
  }

  // ─────────────── corrections de la structure émettrice ───────────────

  corrigerLigne(ligne: LigneIndexee) {
    this.ligneEditee = ligne;
    this.modeleLigne = {
      designation: ligne.designation || '',
      quantite: ligne.quantite || 1,
      prixUnitaire: ligne.prixUnitaire || 0,
      codeActe: ligne.codeActe || ''
    };
  }

  enregistrerLigne() {
    const ligne = this.ligneEditee;
    const m = this.modeleLigne;
    if (!this.facture || !ligne) return;
    if (!m.designation.trim() || m.quantite < 1 || m.prixUnitaire < 0) {
      this.snackBar.open('Renseignez une désignation, une quantité (≥ 1) et un prix valide.', 'Fermer', { duration: 4000 });
      return;
    }
    this.executer(() => this.structureService.updateFactureLigne(this.facture!.id, ligne._index, {
      designation: m.designation.trim(),
      quantite: m.quantite,
      prixUnitaire: m.prixUnitaire,
      codeActe: m.codeActe || undefined
    }), 'Prestation modifiée.', () => this.ligneEditee = null);
  }

  supprimerLigne(ligne: LigneIndexee) {
    this.confirm.ask({
      title: 'Supprimer la prestation',
      message: `Supprimer « ${ligne.designation} » de la facture ? La suppression est historisée.`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (ok) this.executer(() => this.structureService.deleteFactureLigne(this.facture!.id, ligne._index), 'Prestation supprimée.');
    });
  }

  // ─────────────── retrait ───────────────

  retirer() {
    const v = this.visite;
    if (!v || !this.facture || !this.peutRetirer) return;
    this.confirm.ask({
      title: 'Retirer le patient',
      message: `Retirer la visite du ${dateFr(v.date)} de ${v.nomComplet} et ses ${v.lignes.length} `
        + 'prestation(s) de la facture ? Ses autres visites restent. Le retrait est historisé.',
      confirmText: 'Retirer',
      danger: true
    }).subscribe(ok => {
      if (!ok || !this.facture) return;
      const id = this.facture.id;
      this.executer(() => v.dossier
        ? this.structureService.supprimerDossier(id, v.dossier.id)
        : this.structureService.deleteFacturePatient(id, v.lettreNumero || ''),
        'Patient retiré de la facture.', () => this.retour());
    });
  }

  /**
   * La dernière prestation est partie : le serveur a supprimé la facture vide (23/10/2026). On
   * quitte ses écrans — sa page n'existe plus — pour la liste d'où on l'avait ouverte.
   */
  private quitterFactureSupprimee() {
    this.snackBar.open('Plus aucune prestation : la facture a été supprimée.', 'Fermer', { duration: 5000 });
    const f = this.facture;
    if (this.contexte === 'espace-ps') {
      const poste = this.auth.isPosteDeSante();
      this.router.navigate([poste ? '/dashboard/espace-poste' : '/dashboard/espace-centre'], {
        queryParams: f ? { tab: poste ? 2 : 3, regime: f.regime, annee: f.annee } : { tab: poste ? 2 : 3 }
      });
    } else if (this.depuisFacture) {
      // Patient ouvert depuis la facture : on remonte d'un cran de plus, à l'écran d'avant elle.
      history.go(-2);
    } else {
      this.location.back();
    }
  }

  /** Appel au serveur qui renvoie la facture à jour ; un seul traitement d'erreur. */
  private executer(appel: () => Observable<FactureStructure | null>, message?: string, apres?: () => void) {
    this.occupe = true;
    appel().subscribe({
      next: facture => {
        this.occupe = false;
        if (!facture) {
          this.quitterFactureSupprimee();
          return;
        }
        this.facture = facture;
        this.construire();
        if (message) this.snackBar.open(message, 'Fermer', { duration: 3000 });
        apres?.();
      },
      error: err => {
        this.occupe = false;
        this.snackBar.open(err?.error?.message || 'Opération impossible.', 'Fermer',
          { duration: 6000, panelClass: 'error-snackbar' });
      }
    });
  }
}
