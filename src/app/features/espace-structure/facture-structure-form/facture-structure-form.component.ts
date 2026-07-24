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
import { StructureService } from '../../../core/services/structure.service';
import { FeuilleSoinsService } from '../../../core/services/feuille-soins.service';
import { LettreGarantie, REGIME_LABELS, Regime, tauxBeneficiaire, tauxSencsu, REGIME_OPTIONS } from '../../../core/models/bcsu.model';
import { LigneFactureStructure, DocumentComplementaire, FactureStructureRequest } from '../../../core/models/structure.model';
import { FeuilleSoins } from '../../../core/models/feuille-soins.model';
import { compressImageToDataUrl } from '../../../core/utils/image-compression';
import { QrScannerComponent } from '../../../shared/qr-scanner/qr-scanner.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { AuthService } from '../../../core/services/auth.service';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

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

export const LISTE_PRESTATIONS = [
  'Consultation générale',
  'Consultation spécialiste',
  'Accouchement normal',
  'Césarienne',
  'Échographie',
  'Radiographie',
  'Analyse de sang (NFS, etc.)',
  'Goutte épaisse (GE)',
  'Hospitalisation (journée)',
  'Soins infirmiers / Pansement',
  'Hémodialyse',
  'Dialyse péritonéale',
  'Chirurgie mineure'
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
    matriculeLabel: 'N° Extrait de naissance',
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
    QrScannerComponent
  ],
  templateUrl: './facture-structure-form.component.html',
  styleUrls: ['./facture-structure-form.component.css']
})
export class FactureStructureFormComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;
  
  readonly listDiagnostiques = LISTE_DIAGNOSTIQUES;
  readonly listPrestations = LISTE_PRESTATIONS;

  searchNumero = 'LG-';
  searching = false;
  lettre: LettreGarantie | null = null;
  
  isPosteDeSante = false;

  /** Feuille de soins déposée par le patient, rattachée à la facture (circuit feuille de soins). */
  feuilleSoins: FeuilleSoins | null = null;

  factureForm!: FormGroup;
  patientForm!: FormGroup;
  prestationForm!: FormGroup;
  lignes: LigneFactureStructure[] = [];

  ticketCaisse: string | null = null;
  documents: DocumentComplementaire[] = [];
  docTitre = '';

  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private structureService: StructureService,
    private feuilleSoinsService: FeuilleSoinsService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {
    this.isPosteDeSante = this.authService.isPosteDeSante();
    
    this.factureForm = this.fb.group({
      diagnostique: ['']
    });
    
    this.patientForm = this.fb.group({
      nom: ['', this.isPosteDeSante ? Validators.required : null],
      prenom: ['', this.isPosteDeSante ? Validators.required : null],
      telephone: ['', this.isPosteDeSante ? Validators.required : null],
      regime: [Regime.CONTRIBUTIF, this.isPosteDeSante ? Validators.required : null],
      sexe: [''],
      dateNaissance: [''],
      matricule: [''],
      numeroCni: ['']
    });
    
    this.prestationForm = this.fb.group({
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

  /** Configuration des champs pour la catégorie de la lettre rattachée ou du formulaire PS. */
  get champs(): CategorieChamps {
    return CHAMPS_PAR_REGIME[this.regime ?? Regime.CONTRIBUTIF] ?? CHAMPS_PAR_REGIME[Regime.CONTRIBUTIF];
  }

  /** QR code scanné sur la lettre de garantie : lance directement la recherche. */
  onQrScanne(code: string) {
    this.searchNumero = code;
    this.rechercher();
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
    this.structureService.rechercherLettre(this.searchNumero.trim()).subscribe({
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
   * Applique les règles de la catégorie.
   */
  private appliquerReglesCategoriePourRegime(regime: string | undefined | null) {
    if (!regime) return;
    const c = CHAMPS_PAR_REGIME[regime] ?? CHAMPS_PAR_REGIME[Regime.CONTRIBUTIF];

    // Dialyses : la désignation de la prestation est déduite de la catégorie.
    this.prestationForm.reset({
      designation: c.designationAuto || '',
      codeActe: '',
      datePriseEnCharge: this.today(),
      quantite: 1,
      prixUnitaire: 0,
      motifCesarienne: ''
    });
  }

  reset() {
    this.lettre = null;
    this.feuilleSoins = null;
    this.lignes = [];
    this.ticketCaisse = null;
    this.documents = [];
    this.searchNumero = 'LG-';
    if (this.isPosteDeSante) {
      this.patientForm.reset({ regime: Regime.CONTRIBUTIF });
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
    this.prestationForm.reset({
      designation: c.designationAuto || '',
      codeActe: '',
      datePriseEnCharge: this.today(),
      quantite: 1,
      prixUnitaire: 0,
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
      lettreGarantieNumero: this.lettre?.numero,
      feuilleSoinsId: this.feuilleSoins?.id,
      diagnostique: this.factureForm.value.diagnostique || undefined,
      lignes: this.lignes,
      ticketCaisse: this.ticketCaisse || undefined,
      documentsComplementaires: this.documents.length ? this.documents : undefined
    };
    
    if (this.isPosteDeSante) {
      const p = this.patientForm.value;
      req.regime = p.regime;
      req.patientNom = p.nom;
      req.patientPrenom = p.prenom;
      req.patientTelephone = p.telephone;
      req.patientDateNaissance = p.dateNaissance || undefined;
      req.patientSexe = p.sexe || undefined;
      req.patientMatricule = p.matricule || undefined;
      req.patientNumeroCni = p.numeroCni || undefined;
    }
    
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
