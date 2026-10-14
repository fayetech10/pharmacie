import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { StructureService } from '../../../core/services/structure.service';
import { FeuilleSoinsService } from '../../../core/services/feuille-soins.service';
import { LettreGarantie, REGIME_LABELS, Regime, tauxBeneficiaire, tauxSencsu, REGIME_OPTIONS, REGIME_OPTIONS_POSTE, REGIME_LABELS_POSTE, exigeCarteCsu } from '../../../core/models/bcsu.model';
import { LigneFactureStructure, DocumentComplementaire, FactureStructureRequest } from '../../../core/models/structure.model';
import { CarteCsu, ResultatCarteCsu, VerificationCarte } from '../../../core/models/carte-csu.model';
import { RegimeTuilesComponent } from '../../../shared/regime-tuiles/regime-tuiles.component';
import { CarteCsuDialogComponent, CarteCsuDialogData } from '../../../shared/carte-csu-dialog/carte-csu-dialog.component';
import { renderCarteAssureToDataUrl } from '../../../core/utils/carte-assure-image';
import { FeuilleSoins } from '../../../core/models/feuille-soins.model';
import { LISTE_PRESTATIONS } from '../../../core/models/prestations';
import { HorsCsuService } from '../../../core/services/hors-csu.service';
import { TarifHorsCsu } from '../../../core/models/referentiel.model';
import { compressImageToDataUrl } from '../../../core/utils/image-compression';
import { QrScannerComponent } from '../../../shared/qr-scanner/qr-scanner.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { versIsoDate } from '../../../core/utils/date-formulaire';
import { AuthService } from '../../../core/services/auth.service';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

/**
 * Types de prestation facturables par un poste de santé.
 *
 * <p>« ICP » (infirmier chef de poste) et « Consultation » sont facturés tels quels : le
 * type EST la désignation de la ligne. « Dépositaire » ouvre le dépôt de médicaments du
 * poste — la désignation devient alors celle du médicament servi, et son prix vient du
 * tarif que le poste s'est fixé dans l'écran « Paramètres ».</p>
 */
export const TYPES_PRESTATION_POSTE = ['ICP', 'Consultation', 'Dépositaire'] as const;

/** Catégorie du référentiel qui range un tarif dans le dépôt du poste. */
export const CATEGORIE_DEPOSITAIRE = 'Dépositaire';

export const LISTE_DIAGNOSTIQUES = [
  'Paludisme',
  'Infection respiratoire aiguë (IRA)',
  'Hypertension artérielle (HTA)',
  'Diabète',
  'Gastro-entérite / Diarrhée',
  'Anémie',
  'Malnutrition',
  'Grossesse (Suivi prénatal)',
  'Appendicite',
  'Fièvre typhoïde',
  'Infection urinaire',
  'Dermatose',
  'Traumatisme / Fracture',
  'Insuffisance rénale'
];


/**
 * Champs affichés/exigés selon la catégorie (classeur « GESTION DES FACTURES CS_EPS » :
 * un onglet par catégorie, chacun avec ses colonnes propres).
 */
interface CategorieChamps {
  /** Libellé de l'identifiant bénéficiaire (colonne « N° Matricule / … » de l'onglet). */
  matriculeLabel: string;
  /** SESAME : le N° CNI est demandé EN PLUS du matricule. */
  cniSeparee?: boolean;
  /** Colonne « Service » présente (Classique, 0-5 ans, BSF, CEC, Sésame, Ndongo Dara). */
  service?: boolean;
  /** Colonne « Diagnostic / Motif de consultation » (0-5 ans). */
  diagnostic?: boolean;
  /** Colonne « N° dans le registre » (0-5 ans). */
  numeroRegistre?: boolean;
  /** Colonne « IRC/IRA » (dialyses). */
  ircIra?: boolean;
  /** Bloc césarienne : indication CBT, n° registre bloc, date+heure, durée hospitalisation. */
  cesarienne?: boolean;
  /** Champ « Code acte (SITFAC) » proposé. */
  codeActe?: boolean;
  /** 0-5 ans : facturation au forfait (quantité fixée à 1, P.U libellé « Forfait »). */
  forfait?: boolean;
  /** Dialyses : la désignation est déduite de la catégorie (pas de colonne dans l'onglet). */
  designationAuto?: string;
  designationLabel: string;
  qteLabel: string;
  puLabel: string;
  /** Libellé sexe : « H/F » partout, « M/F » pour les enfants 0-5 ans. */
  sexeOptions: string[];
}

const CHAMPS_COMMUNS = {
  designationLabel: 'Prestation / Acte',
  qteLabel: 'Quantité',
  puLabel: 'P.U (FCFA)',
  sexeOptions: ['H', 'F']
};

const CHAMPS_PAR_REGIME: Record<string, CategorieChamps> = {
  [Regime.CONTRIBUTIF]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / Code bénéficiaire',
    service: true, codeActe: true
  },
  [Regime.NDONGO_DARA]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule',
    service: true, codeActe: true
  },
  [Regime.BSF]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / CNI',
    service: true, codeActe: true
  },
  [Regime.CEC]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / CNI',
    service: true, codeActe: true
  },
  [Regime.SESAME]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule',
    cniSeparee: true, service: true, codeActe: true
  },
  [Regime.ZERO_CINQ_ANS]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Extrait / N° Carnet / N° PEV',
    service: true, diagnostic: true, numeroRegistre: true, forfait: true, codeActe: true,
    sexeOptions: ['M', 'F']
  },
  [Regime.CESARIENNE]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° CNI',
    cesarienne: true
  },
  [Regime.DIALYSE_PERITONEALE]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / N° CNI patient / N° accompagnant',
    ircIra: true,
    designationAuto: 'Dialyse péritonéale',
    designationLabel: 'Prestation',
    qteLabel: 'Nbre de poches',
    puLabel: 'Prix unitaire (FCFA)'
  },
  [Regime.HEMODIALYSE]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / N° CNI patient / N° accompagnant',
    ircIra: true,
    designationAuto: 'Hémodialyse',
    designationLabel: 'Prestation',
    qteLabel: 'Nbre de séances',
    puLabel: 'Prix unitaire (FCFA)'
  },
  // Régimes hérités (données existantes) : mêmes champs que leur équivalent actuel.
  [Regime.DIALYSE]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / N° CNI patient / N° accompagnant',
    ircIra: true,
    designationAuto: 'Dialyse',
    designationLabel: 'Prestation',
    qteLabel: 'Nbre de séances / poches',
    puLabel: 'Prix unitaire (FCFA)'
  },
  [Regime.BSF_CEC]: {
    ...CHAMPS_COMMUNS,
    matriculeLabel: 'N° Matricule / CNI',
    service: true, codeActe: true
  }
};

@Component({
  selector: 'app-facture-structure-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatCardModule, MatInputModule,
    MatButtonModule, MatIconModule, MatSelectModule, MatSnackBarModule, MatAutocompleteModule,
    MatDatepickerModule,
    QrScannerComponent, RegimeTuilesComponent
  ],
  templateUrl: './facture-structure-form.component.html'
})
export class FactureStructureFormComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  /** Au Poste : liste restreinte de catégories (cf. REGIME_OPTIONS_POSTE). */
  readonly regimeOptionsPoste = REGIME_OPTIONS_POSTE;

  /** Libellé d'un régime, avec les intitulés spécifiques au Poste quand on y est. */
  labelRegime(regime: Regime): string {
    return (this.isPosteDeSante && REGIME_LABELS_POSTE[regime]) || REGIME_LABELS[regime];
  }

  readonly listDiagnostiques = LISTE_DIAGNOSTIQUES;
  readonly listPrestations = LISTE_PRESTATIONS;
  readonly typesPrestationPoste = TYPES_PRESTATION_POSTE;

  /** Dépôt du poste : tarifs de catégorie « Dépositaire » applicables à sa structure. */
  medicamentsDepot: TarifHorsCsu[] = [];

  // « G- » et non « LG- » : le serveur numérote {TYPE_DOC}-{INITIALES}-{NNNN}, avec G pour
  // une lettre de garantie (G-THCS-0001) et C pour un bon de commande. Le préfixe « LG- »
  // hérité de l'ancienne codification fabriquait des numéros introuvables.
  searchNumero = 'G-';
  searching = false;
  lettre: LettreGarantie | null = null;
  
  isPosteDeSante = false;

  /** Forfait imposé « Gratuité 0-5 ans » au niveau poste de santé (FCFA). */
  readonly FORFAIT_0_5_ANS_POSTE = 1400;

  /** Feuille de soins déposée par le patient, rattachée à la facture (circuit feuille de soins). */
  feuilleSoins: FeuilleSoins | null = null;

  factureForm!: FormGroup;
  patientForm!: FormGroup;
  prestationForm!: FormGroup;
  lignes: LigneFactureStructure[] = [];

  ticketCaisse: string | null = null;
  documents: DocumentComplementaire[] = [];
  docTitre = '';
  /** Carte d'assuré générée depuis la vérification CSU, jointe d'office aux documents. */
  docCarte: DocumentComplementaire | null = null;

  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private structureService: StructureService,
    private horsCsuService: HorsCsuService,
    private feuilleSoinsService: FeuilleSoinsService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.isPosteDeSante = this.authService.isPosteDeSante();
    
    this.factureForm = this.fb.group({
      diagnostique: ['']
    });
    
    this.patientForm = this.fb.group({
      nom: ['', this.isPosteDeSante ? Validators.required : null],
      prenom: ['', this.isPosteDeSante ? Validators.required : null],
      telephone: ['', this.isPosteDeSante ? Validators.required : null],
      // Poste : aucun régime présélectionné — c'est le premier choix de l'agent, et il
      // décide du parcours (vérification de carte ou non).
      regime: [null as Regime | null, this.isPosteDeSante ? Validators.required : null],
      sexe: [''],
      dateNaissance: [''],
      matricule: [''],
      numeroCni: ['']
    });
    
    this.prestationForm = this.fb.group({
      // Poste de santé : le type pilote la désignation (cf. TYPES_PRESTATION_POSTE).
      typePrestation: [''],
      designation: ['', Validators.required],
      codeActe: [''],
      datePriseEnCharge: [this.today(), Validators.required],
      quantite: [1, [Validators.required, Validators.min(1)]],
      prixUnitaire: [0, [Validators.required, Validators.min(0)]],
      motifCesarienne: ['']
    });
  }

  ngOnInit() {
    // Si l'utilisateur est un Poste de Santé, on écoute le changement de régime pour appliquer les règles
    if (this.isPosteDeSante) {
      this.patientForm.get('regime')?.valueChanges.subscribe(regime => {
        this.appliquerReglesCategoriePourRegime(regime);
      });
      // Appliquer les règles initialement
      this.appliquerReglesCategoriePourRegime(this.patientForm.get('regime')?.value);
      this.chargerDepot();
    }
    
    // Arrivée depuis une feuille de soins (« Facturer cette feuille ») : préremplissage complet.
    const feuilleNumero = this.route.snapshot.queryParamMap.get('feuille');
    if (feuilleNumero && !this.isPosteDeSante) {
      this.feuilleSoinsService.searchByNumero(feuilleNumero).subscribe({
        next: (feuille) => this.appliquerFeuilleSoins(feuille),
        error: (err) => this.snackBar.open(err.error?.message || 'Feuille de soins introuvable', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' })
      });
    }
  }

  /**
   * Rattache la feuille de soins déposée par le patient : retrouve sa lettre de
   * garantie puis reprend le diagnostic et les prestations de la prise en charge.
   */
  private appliquerFeuilleSoins(feuille: FeuilleSoins) {
    this.feuilleSoins = feuille;
    if (!feuille.lettreGarantieNumero) {
      this.snackBar.open('Cette feuille de soins n\'est rattachée à aucune lettre de garantie : recherchez la lettre manuellement', 'Fermer', { duration: 6000 });
      return;
    }
    this.searchNumero = feuille.lettreGarantieNumero;
    this.searching = true;
    this.structureService.rechercherLettre(feuille.lettreGarantieNumero).subscribe({
      next: (lettre) => {
        this.searching = false;
        this.lettre = lettre;
        this.lignes = [];
        this.appliquerReglesCategoriePourRegime(lettre.regime);
        // La structure reprend uniquement les prestations deja indiquees sur la feuille.
        this.lignes = (feuille.prestations || []).map(p => ({
          designation: p.designation,
          datePriseEnCharge: p.date,
          quantite: 1,
          prixUnitaire: p.montant,
          montant: p.montant,
          montantBeneficiaire: p.montant * tauxBeneficiaire(lettre.regime),
          montantSencsu: p.montant * tauxSencsu(lettre.regime)
        }));
        this.snackBar.open(`Feuille de soins ${feuille.numero} rattachée : facture préremplie`, 'Fermer', { duration: 4000 });
      },
      error: (err) => {
        this.searching = false;
        this.snackBar.open(err.error?.message || 'Lettre de garantie de la feuille introuvable', 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  // ────────────────────────── dépôt de médicaments (poste) ──────────────────────────

  /**
   * Charge le dépôt du poste. La liste vient du même référentiel que la caisse Hors CSU :
   * le catalogue national fournit les désignations, la structure y superpose SES prix
   * (cf. l'écran « Paramètres »). Un dépôt vide n'est pas une erreur — c'est un poste
   * qui n'a pas encore tarifé ses médicaments, et l'écran le dit.
   */
  private chargerDepot() {
    this.horsCsuService.getTarifsApplicables().subscribe({
      next: tarifs => {
        this.medicamentsDepot = (tarifs || [])
          .filter(t => t.actif && t.categorie === CATEGORIE_DEPOSITAIRE);
      },
      error: () => { this.medicamentsDepot = []; }
    });
  }

  /** Le type « Dépositaire » remplace la liste des actes par celle des médicaments. */
  get estDepositaire(): boolean {
    return this.prestationForm?.get('typePrestation')?.value === CATEGORIE_DEPOSITAIRE;
  }

  /**
   * Le sélecteur de type n'a de sens que pour un poste, et seulement quand la catégorie
   * ne fixe pas déjà la désignation (les dialyses la déduisent du régime).
   */
  get afficherTypePrestation(): boolean {
    return this.isPosteDeSante && !this.champs.designationAuto;
  }

  /** ICP / Consultation : le type EST la désignation. Dépositaire : on attend le médicament. */
  onTypePrestationChange(type: string) {
    if (type === CATEGORIE_DEPOSITAIRE) {
      this.prestationForm.patchValue({ designation: '', prixUnitaire: this.prixUnitaireInitial(this.regime) });
      return;
    }
    this.prestationForm.patchValue({ designation: type || '' });
  }

  /** Médicament choisi : sa désignation et le prix que le poste s'est fixé font foi. */
  onMedicamentChange(code: string) {
    const medicament = this.medicamentsDepot.find(m => m.code === code);
    if (!medicament) return;
    this.prestationForm.patchValue({
      designation: medicament.designation,
      prixUnitaire: medicament.prix
    });
    if (!medicament.prix) {
      this.snackBar.open(
        `« ${medicament.designation} » n'a pas encore de prix. Fixez-le dans Hors CSU → Paramètres, ou saisissez-le ici.`,
        'Fermer', { duration: 6000 });
    }
  }

  /** Code du médicament actuellement retenu (la désignation seule ne suffit pas à le retrouver). */
  get medicamentSelectionne(): string {
    const designation = this.prestationForm?.get('designation')?.value;
    return this.medicamentsDepot.find(m => m.designation === designation)?.code || '';
  }

  /** La feuille stocke M/F ; le classeur CS_EPS attend H/F (M/F pour les 0-5 ans). */
  private normaliserSexe(sexe?: string): string {
    if (!sexe) return '';
    const options = this.champs.sexeOptions;
    if (sexe.toUpperCase() === 'M' || sexe.toUpperCase() === 'H') {
      return options.includes('M') ? 'M' : 'H';
    }
    return 'F';
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  get regime(): Regime | null {
    if (this.isPosteDeSante) {
      return this.patientForm?.get('regime')?.value || null;
    }
    return this.lettre?.regime ?? null;
  }
  get isCesarienne(): boolean {
    return this.regime === Regime.CESARIENNE;
  }

  /**
   * Poste de santé + régime 0-5 ans : le P.U est un forfait imposé (1400 F), non modifiable.
   * (Enforcé aussi côté serveur : le montant ne dépend pas de la saisie du client.)
   */
  get puForfaitImpose(): boolean {
    return this.isPosteDeSante && this.regime === Regime.ZERO_CINQ_ANS;
  }

  /** P.U initial d'une nouvelle prestation : forfait imposé si applicable, sinon 0. */
  private prixUnitaireInitial(regime: string | null | undefined): number {
    return (this.isPosteDeSante && regime === Regime.ZERO_CINQ_ANS) ? this.FORFAIT_0_5_ANS_POSTE : 0;
  }

  /** Configuration des champs pour la catégorie de la lettre rattachée ou du formulaire PS. */
  get champs(): CategorieChamps {
    return CHAMPS_PAR_REGIME[this.regime ?? Regime.CONTRIBUTIF] ?? CHAMPS_PAR_REGIME[Regime.CONTRIBUTIF];
  }

  /** QR code scanné sur la lettre de garantie : lance directement la recherche. */
  onQrScanne(code: string) {
    this.searchNumero = code;
    this.rechercher();
  }

  // ----- Régime puis carte CSU (poste de santé) -----

  /** Issue de la vérification de la carte du patient en cours (régimes à carte uniquement). */
  verification: VerificationCarte | null = null;

  /** Le régime choisi exige-t-il une carte CSU vérifiée (Classique, BSF / CEC) ? */
  get carteRequise(): boolean {
    return exigeCarteCsu(this.regime);
  }

  /**
   * Le reste du patient ne s'ouvre qu'une fois le régime choisi et, pour un régime à
   * carte, la carte vérifiée — ou le site de vérification constaté en panne.
   */
  get patientAffiche(): boolean {
    return !!this.regime && (!this.carteRequise || this.verification !== null);
  }

  /** Libellés du poste pour les tuiles (« Classique », « BSF / CEC »). */
  readonly libelleTuile = (r: Regime) => this.labelRegime(r);

  /** Changer de régime remet la vérification à zéro : le parcours n'est plus le même. */
  choisirRegime(regime: Regime) {
    if (regime === this.regime) return;
    this.annulerVerification();
    this.patientForm.get('regime')?.setValue(regime);
  }

  /** Autre carte pour ce patient : on repart du matricule, identité effacée. */
  changerDeCarte() {
    this.annulerVerification();
    this.patientForm.reset({ regime: this.regime });
  }

  private annulerVerification() {
    // Le matricule venait de la carte : il ne vaut plus pour un autre parcours.
    if (this.verification === 'VERIFIEE') {
      this.patientForm.get('matricule')?.setValue('');
    }
    this.verification = null;
    if (this.docCarte) {
      this.documents = this.documents.filter(d => d !== this.docCarte);
      this.docCarte = null;
    }
  }

  onEntreeMatricule(event: Event) {
    event.preventDefault();
    if (this.carteRequise && this.verification === null) this.verifierCarteCsu();
  }

  /** Vérifie la carte du matricule saisi ; seule une carte valide préremplit le patient. */
  verifierCarteCsu() {
    const code = (this.patientForm.get('matricule')?.value || '').trim();
    if (!code) {
      this.snackBar.open('Saisissez d\'abord le matricule figurant sur la carte CSU.', 'Fermer', { duration: 3000 });
      return;
    }
    this.dialog.open<CarteCsuDialogComponent, CarteCsuDialogData, ResultatCarteCsu>(CarteCsuDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      // Seuls les boutons ferment : le constat « carte invalide » ne doit pas se perdre.
      disableClose: true,
      data: { code, regime: this.regime, regimeLibelle: this.regime ? this.labelRegime(this.regime) : undefined }
    }).afterClosed().subscribe(resultat => {
      if (!resultat) return;
      if ('invalide' in resultat) {
        // Une carte reconnue invalide annule toute dérogation (panne) accordée avant.
        this.annulerVerification();
        this.snackBar.open('Carte non valide : la prise en charge CSU est impossible avec cette carte.', 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        return;
      }
      if ('carte' in resultat) this.appliquerCarteCsu(resultat.carte);
      else this.continuerSansVerification();
    });
  }

  /** Site de vérification en panne : seule dérogation, consignée sur la facture. */
  private continuerSansVerification() {
    this.annulerVerification();
    this.verification = 'NON_VERIFIEE_PANNE';
    this.snackBar.open(
      'Saisie sans vérification (site indisponible) : la facture portera la mention « carte non vérifiée ». Joignez une photo de la carte.',
      'Fermer', { duration: 7000 });
  }

  private appliquerCarteCsu(carte: CarteCsu) {
    // Le modal ne rend qu'une carte valide ; la garde protège d'un autre appelant.
    if (!carte.carteValide) return;
    this.annulerVerification();
    this.verification = 'VERIFIEE';

    // Seuls les champs renseignés sur la carte écrasent la saisie.
    const valeurs: Record<string, unknown> = { matricule: carte.codeImmatriculation };
    if (carte.prenom) valeurs['prenom'] = carte.prenom;
    if (carte.nom) valeurs['nom'] = carte.nom;
    if (carte.telephone) valeurs['telephone'] = carte.telephone;
    if (carte.sexe) valeurs['sexe'] = carte.sexe;
    if (carte.numeroPiece) valeurs['numeroCni'] = carte.numeroPiece;
    if (carte.dateNaissance) {
      const [annee, mois, jour] = carte.dateNaissance.substring(0, 10).split('-').map(Number);
      valeurs['dateNaissance'] = new Date(annee, mois - 1, jour);
    }
    this.patientForm.patchValue(valeurs);

    // Les données vérifiées constituent la carte d'assuré du dossier de ce patient.
    renderCarteAssureToDataUrl(carte)
      .then(image => {
        if (this.verification !== 'VERIFIEE') return; // vérification annulée entre-temps
        this.documents = this.documents.filter(d => d !== this.docCarte);
        this.docCarte = { titre: "Carte d'assuré (vérifiée)", image, patientMatricule: carte.codeImmatriculation };
        this.documents.unshift(this.docCarte);
      })
      .catch(() => this.snackBar.open(
        "La carte d'assuré n'a pas pu être générée : joignez-en une photo.", 'Fermer', { duration: 5000 }));

    this.snackBar.open('Informations du patient reprises de la carte CSU.', 'Fermer', { duration: 4000 });
  }

  rechercher() {
    if (this.isPosteDeSante) return;
    if (!this.searchNumero.trim()) return;
    if (this.lignes.length > 0) {
      if (!window.confirm("Attention, vous avez des prestations non enregistrées pour ce patient. Si vous recherchez un nouveau patient, elles seront perdues. Voulez-vous vraiment continuer sans enregistrer ?")) {
        return;
      }
    }
    this.searching = true;
    this.structureService.rechercherLettre(this.normaliserNumero(this.searchNumero)).subscribe({
      next: (lettre) => {
        this.searching = false;
        this.lettre = lettre;
        this.lignes = [];
        this.appliquerReglesCategoriePourRegime(lettre.regime);
      },
      error: (err) => {
        this.searching = false;
        this.snackBar.open(err.error?.message || 'Aucune lettre trouvée', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      }
    });
  }

  /**
   * Tolère le « LG- » que l'ancienne codification affichait — et que les agents ont pris
   * l'habitude de taper : « LG-G-THCS-0001 » comme « LG-THCS-0001 » retrouvent la lettre
   * G-THCS-0001. Une recherche qui échoue sur un préfixe de trop coûte plus cher qu'une
   * ligne de nettoyage.
   */
  private normaliserNumero(saisie: string): string {
    const numero = (saisie || '').trim().toUpperCase();
    const sansPrefixe = numero.startsWith('LG-') ? numero.slice(3) : numero;
    return sansPrefixe.startsWith('G-') ? sansPrefixe : `G-${sansPrefixe}`;
  }

  /**
   * Applique les règles de la catégorie.
   */
  private appliquerReglesCategoriePourRegime(regime: string | undefined | null) {
    if (!regime) return;
    const c = CHAMPS_PAR_REGIME[regime] ?? CHAMPS_PAR_REGIME[Regime.CONTRIBUTIF];

    // Dialyses : la désignation de la prestation est déduite de la catégorie.
    // 0-5 ans au niveau poste : le P.U est préréglé sur le forfait imposé (1400 F).
    this.prestationForm.reset({
      typePrestation: '',
      designation: c.designationAuto || '',
      codeActe: '',
      datePriseEnCharge: this.today(),
      quantite: 1,
      prixUnitaire: this.prixUnitaireInitial(regime),
      motifCesarienne: ''
    });
  }

  reset() {
    this.lettre = null;
    this.feuilleSoins = null;
    this.lignes = [];
    this.ticketCaisse = null;
    this.documents = [];
    this.docCarte = null;
    this.searchNumero = 'G-';
    if (this.isPosteDeSante) {
      this.patientForm.reset({ regime: null });
      this.verification = null;
      this.appliquerReglesCategoriePourRegime(Regime.CONTRIBUTIF);
    }
  }

  // ----- Prestations -----
  ajouterLigne() {
    if (this.prestationForm.invalid || !this.regime) return;
    if (this.isPosteDeSante && this.patientForm.invalid) {
      this.snackBar.open('Veuillez remplir les informations obligatoires du patient.', 'Fermer', { duration: 3000 });
      return;
    }
    const c = this.champs;
    const v = this.prestationForm.value;
    const quantite = c.forfait ? 1 : (Number(v.quantite) || 1);
    const montant = quantite * (Number(v.prixUnitaire) || 0);
    this.lignes.push({
      designation: v.designation,
      codeActe: undefined,
      datePriseEnCharge: v.datePriseEnCharge,
      quantite,
      prixUnitaire: v.prixUnitaire,
      montant,
      motifCesarienne: undefined,
      montantBeneficiaire: montant * tauxBeneficiaire(this.regime),
      montantSencsu: montant * tauxSencsu(this.regime)
    });
    // Le type est conservé d'une ligne à l'autre : servir plusieurs médicaments de suite
    // est le cas courant au dépôt, et le reposer à chaque fois serait une friction inutile.
    // Seule la désignation repart à vide — sauf pour ICP/Consultation, où elle EST le type.
    const typeConserve = this.afficherTypePrestation ? this.prestationForm.value.typePrestation : '';
    this.prestationForm.reset({
      typePrestation: typeConserve,
      designation: c.designationAuto || (typeConserve === CATEGORIE_DEPOSITAIRE ? '' : (typeConserve || '')),
      codeActe: '',
      datePriseEnCharge: this.today(),
      quantite: 1,
      prixUnitaire: this.prixUnitaireInitial(this.regime),
      motifCesarienne: ''
    });
  }

  retirerLigne(i: number) {
    this.lignes.splice(i, 1);
  }

  ligneMontant(l: LigneFactureStructure): number {
    return l.quantite * l.prixUnitaire;
  }
  get montantTotal(): number {
    return this.lignes.reduce((s, l) => s + this.ligneMontant(l), 0);
  }
  get montantBeneficiaireTotal(): number {
    const reg = this.regime;
    if (!reg) return 0;
    return this.montantTotal * tauxBeneficiaire(reg);
  }
  get montantSencsuTotal(): number {
    const reg = this.regime;
    if (!reg) return 0;
    return this.montantTotal * tauxSencsu(reg);
  }

  // ----- Pièces -----
  onTicketSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner une image', 'Fermer', { duration: 3000 });
      return;
    }
    compressImageToDataUrl(file, 50 * 1024)
      .then(url => { this.ticketCaisse = url; })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    (event.target as HTMLInputElement).value = '';
  }
  removeTicket() { this.ticketCaisse = null; }

  onDocSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner une image', 'Fermer', { duration: 3000 });
      return;
    }
    const titre = this.docTitre.trim() || `Document ${this.documents.length + 1}`;
    compressImageToDataUrl(file, 50 * 1024)
      .then(url => { this.documents.push({ titre, image: url }); this.docTitre = ''; })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    (event.target as HTMLInputElement).value = '';
  }
  removeDoc(i: number) { this.documents.splice(i, 1); }

  // ----- Enregistrement -----
  enregistrer(ajouterUnAutre: boolean) {
    if ((!this.lettre && !this.isPosteDeSante) || this.lignes.length === 0) return;
    
    if (this.isPosteDeSante && this.patientForm.invalid) {
      this.snackBar.open('Veuillez remplir les informations obligatoires du patient.', 'Fermer', { duration: 3000 });
      return;
    }
    
    this.isSubmitting = true;
    
    const req: FactureStructureRequest = {
      // Le régime doit accompagner TOUTE saisie : c'est lui qui range le bénéficiaire dans
      // la facture mensuelle du bon régime, côté serveur. Le getter le prend là où il se
      // trouve — sur la lettre de garantie pour un centre (l'agent BCSU l'a fixé, l'écran
      // n'a pas à le redemander), dans le formulaire patient pour un poste de santé.
      //
      // Il n'était envoyé que par les postes : un centre facturant depuis une lettre se
      // voyait donc refuser sa saisie avec « Le régime du bénéficiaire est obligatoire ».
      regime: this.regime ?? undefined,
      lettreGarantieNumero: this.lettre?.numero,
      feuilleSoinsId: this.feuilleSoins?.id,
      diagnostique: this.factureForm.value.diagnostique || undefined,
      lignes: this.lignes,
      ticketCaisse: this.ticketCaisse || undefined,
      documentsComplementaires: this.documents.length ? this.documents : undefined
    };
    
    if (this.isPosteDeSante) {
      const p = this.patientForm.value;
      req.patientNom = p.nom;
      req.patientPrenom = p.prenom;
      req.patientTelephone = p.telephone;
      // Le datepicker rend une Date ; l'API attend un LocalDate « yyyy-MM-dd ».
      req.patientDateNaissance = versIsoDate(p.dateNaissance);
      req.patientSexe = p.sexe || undefined;
      req.patientMatricule = p.matricule || undefined;
      req.patientNumeroCni = p.numeroCni || undefined;
      req.verificationCarte = this.carteRequise ? (this.verification ?? undefined) : undefined;
      // Sans lettre de garantie, seul le matricule range les pièces dans le dossier du
      // patient (la facture mensuelle en regroupe plusieurs) : une saisie de poste ne
      // concerne qu'un patient, toutes ses pièces portent donc son matricule.
      if (req.documentsComplementaires && p.matricule) {
        req.documentsComplementaires = req.documentsComplementaires
          .map(d => d.patientMatricule ? d : { ...d, patientMatricule: p.matricule });
      }
    }
    // Facturation depuis une lettre de garantie : rien à envoyer sur le bénéficiaire ni sur
    // le régime. Le serveur relit la lettre et impose ses valeurs — l'écran ne pourrait de
    // toute façon pas faire autorité sur ce que l'agent BCSU a accordé.
    
    this.structureService.createFacture(req).subscribe({
      next: (facture) => {
        this.isSubmitting = false;
        if (ajouterUnAutre) {
          this.snackBar.open('Saisie ajoutée à la facture mensuelle (non envoyée). Vous pouvez ajouter un autre patient.', 'Fermer', { duration: 4000 });
          this.reset();
        } else {
          this.snackBar.open('Saisie compilée dans la facture mensuelle ' + facture.numero + ' — pensez à l\'envoyer en fin de mois depuis « Mes factures ».', 'Fermer', { duration: 5000 });
          this.router.navigate(['/dashboard/factures-structure', facture.id]);
        }
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }
}
