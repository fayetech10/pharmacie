import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BcsuService } from '../../../core/services/bcsu.service';
import { Patient, PrestationGarantie, Regime, REGIME_LABELS, REGIME_OPTIONS, tauxBeneficiaire, tauxSencsu, LettreGarantieRequest } from '../../../core/models/bcsu.model';
import { compressImageToDataUrl } from '../../../core/utils/image-compression';
import { ocrCni, ocrCarteAssure } from '../../../core/utils/document-ocr';

type PhotoKey = 'cniRecto' | 'cniVerso' | 'carteAssureRecto' | 'autreDocument';

interface PhotoField {
  key: PhotoKey;
  label: string;
}

@Component({
  selector: 'app-lettre-garantie-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, MatCardModule, MatInputModule,
    MatButtonModule, MatIconModule, MatSelectModule, MatSnackBarModule
  ],
  templateUrl: './lettre-garantie-form.component.html',
  styleUrls: ['./lettre-garantie-form.component.css']
})
export class LettreGarantieFormComponent implements OnInit {
  /** Catégories du classeur CS_EPS (les régimes hérités DIALYSE / BSF_CEC sont exclus de la saisie). */
  readonly regimeOptions = REGIME_OPTIONS;
  readonly regimeLabels = REGIME_LABELS;

  patientForm!: FormGroup;
  prestationForm!: FormGroup;

  selectedPatientId: string | null = null;
  searchQuery = '';
  searchResults: Patient[] = [];
  searching = false;

  prestationsLignes: PrestationGarantie[] = [];

  /**
   * Pièces à photographier selon le régime (cahier BCSU) — références stables
   * (mêmes tableaux) pour ne pas faire churner le *ngFor à chaque cycle :
   *  - Classique / BSF-CEC : carte d'assuré, RECTO uniquement ;
   *  - 0-5 ans : extrait de naissance uniquement ;
   *  - autres (Sésame, Césarienne, Dialyse) : pièce d'identité (CNI).
   */
  private readonly PHOTOS_CARTE_ASSURE: PhotoField[] = [
    { key: 'carteAssureRecto', label: "Carte d'assuré (recto)" }
  ];
  private readonly PHOTOS_EXTRAIT: PhotoField[] = [
    { key: 'autreDocument', label: 'Extrait de naissance' }
  ];
  private readonly PHOTOS_CNI: PhotoField[] = [
    { key: 'cniRecto', label: "Pièce d'identité (recto)" },
    { key: 'cniVerso', label: "Pièce d'identité (verso)" }
  ];

  /** Liste des pièces affichées, déterminée par la liste déroulante « Régime ». */
  get photoFields(): PhotoField[] {
    switch (this.regime) {
      case Regime.CONTRIBUTIF:
      case Regime.BSF:
      case Regime.CEC:
      case Regime.BSF_CEC: // ancien régime combiné (données existantes)
        return this.PHOTOS_CARTE_ASSURE;
      case Regime.ZERO_CINQ_ANS:
        return this.PHOTOS_EXTRAIT;
      default: // SESAME, CESARIENNE, DIALYSE_PERITONEALE, HEMODIALYSE, NDONGO_DARA (+ ancien DIALYSE)
        return this.PHOTOS_CNI;
    }
  }

  /** Consigne affichée au-dessus des photos, selon le régime choisi. */
  get photoHint(): string {
    switch (this.regime) {
      case Regime.CONTRIBUTIF:
      case Regime.BSF:
      case Regime.CEC:
      case Regime.BSF_CEC:
        return `Régime ${this.regimeLabels[this.regime]} : photographiez la carte d'assuré — recto uniquement. La lecture automatique (OCR) préremplit nom, prénom et n° d'immatriculation.`;
      case Regime.ZERO_CINQ_ANS:
        return "Régime Enfants 0-5 ans : photographiez l'extrait de naissance uniquement.";
      default:
        return "Photographiez la pièce d'identité — la lecture automatique (OCR) préremplit les informations.";
    }
  }

  photos: Record<PhotoKey, string | null> = {
    cniRecto: null, cniVerso: null, carteAssureRecto: null, autreDocument: null
  };
  /** Titre du document « autre » (extrait de naissance pour le régime 0-5 ans). */
  autreDocumentTitre = '';
  /** Photo en cours de lecture OCR (affiche l'indicateur sur la vignette). */
  ocrEnCours: PhotoKey | null = null;

  /** Contrôle « Régime » exposé pour la liste déroulante placée avant les photos. */
  get regimeControl(): FormControl {
    return this.patientForm.get('regime') as FormControl;
  }

  currentStep = 1; // 1: Patient, 2: Prestations, 3: Pièces
  isSubmitting = false;

  isEditMode = false;
  private editingId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private bcsuService: BcsuService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar
  ) {
    this.patientForm = this.fb.group({
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      telephone: ['', Validators.required],
      regime: [Regime.CONTRIBUTIF, Validators.required],
      sexe: ['', Validators.required],
      numeroCni: [''],
      numeroAssure: [''],
      dateNaissance: ['']
    });

    this.prestationForm = this.fb.group({
      designation: ['', Validators.required],
      datePriseEnCharge: [this.today(), Validators.required],
      montant: [0, [Validators.required, Validators.min(0)]],
      motifCesarienne: ['']
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode = true;
      this.editingId = id;
      this.bcsuService.getLettreGarantie(id).subscribe(lettre => {
        this.selectedPatientId = lettre.patientId;
        this.patientForm.patchValue({
          nom: lettre.patientNom,
          prenom: lettre.patientPrenom,
          telephone: lettre.patientTelephone,
          regime: lettre.regime,
          sexe: lettre.patientSexe || '',
          numeroCni: lettre.cniNumeroOcr || '',
          numeroAssure: lettre.patientNumeroAssure || '',
          dateNaissance: lettre.patientDateNaissance || ''
        });
        this.prestationsLignes = [...lettre.prestations];
        // Pas de nettoyage ici : les pièces d'un dossier existant sont préservées
        // telles quelles, même si les règles par régime ont évolué depuis.
        this.photos = {
          cniRecto: lettre.cniRecto || null,
          cniVerso: lettre.cniVerso || null,
          carteAssureRecto: lettre.carteAssureRecto || null,
          autreDocument: lettre.autreDocument || null
        };
        this.autreDocumentTitre = lettre.autreDocumentTitre || '';
      });
    }
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  get regime(): Regime {
    return this.patientForm.get('regime')?.value;
  }

  private readonly SEXE_OPTIONS_ADULTE = [
    { value: 'M', label: 'Homme (H)' },
    { value: 'F', label: 'Femme (F)' }
  ];
  private readonly SEXE_OPTIONS_ENFANT = [
    { value: 'M', label: 'Masculin (M)' },
    { value: 'F', label: 'Féminin (F)' }
  ];

  /**
   * Options de sexe. Valeurs stockées de façon canonique ("M"/"F") ; le libellé s'adapte
   * au régime : le classeur CS_EPS utilise H/F partout sauf pour les enfants de 0-5 ans (M/F).
   */
  get sexeOptions(): { value: string; label: string }[] {
    const enfants = this.regime === Regime.ZERO_CINQ_ANS;
    return enfants ? this.SEXE_OPTIONS_ENFANT : this.SEXE_OPTIONS_ADULTE;
  }

  /** Intitulé du champ Sexe selon le régime (H/F ou M/F pour les enfants). */
  get sexeLabel(): string {
    return this.regime === Regime.ZERO_CINQ_ANS ? 'Sexe (M/F)' : 'Sexe (H/F)';
  }

  /** Libellé des photos jointes pour l'écran de validation. */
  get photosJointesLabel(): string {
    const parts: string[] = [];
    if (this.photos.carteAssureRecto) parts.push("Carte d'assuré (recto)");
    if (this.photos.autreDocument) parts.push(this.autreDocumentTitre || 'Extrait de naissance');
    if (this.photos.cniRecto) parts.push("Pièce d'identité (recto)");
    if (this.photos.cniVerso) parts.push("Pièce d'identité (verso)");
    return parts.join(', ') || 'Aucune';
  }

  get isCesarienne(): boolean {
    return this.regime === Regime.CESARIENNE;
  }

  nextStep() {
    if (this.currentStep < 2 && this.canGoNext()) {
      this.currentStep++;
    }
  }

  prevStep() {
    if (this.currentStep > 1) this.currentStep--;
  }

  canGoNext(): boolean {
    if (this.currentStep === 1) return this.patientForm.valid;
    return true;
  }

  get ageCalcule(): string {
    const dob = this.patientForm?.get('dateNaissance')?.value;
    if (!dob) return '';
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return '';
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < 0) return '';
    if (age === 0) {
      let months = today.getMonth() - birthDate.getMonth();
      if (months < 0) {
        months += 12;
        age--;
      }
      if (today.getDate() < birthDate.getDate()) {
         months--;
      }
      if (months < 0) months += 12;
      return `${months} mois`;
    }
    return `${age} an${age > 1 ? 's' : ''}`;
  }

  // ===== Recherche patient =====
  onSearchInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery = query;
    if (query.length < 2) {
      this.searchResults = [];
      return;
    }
    this.searching = true;
    this.bcsuService.searchPatients(query).subscribe({
      next: (res) => { this.searchResults = res; this.searching = false; },
      error: () => { this.searching = false; }
    });
  }

  selectPatient(patient: Patient) {
    this.selectedPatientId = patient.id || null;
    this.patientForm.patchValue({
      nom: patient.nom,
      prenom: patient.prenom,
      telephone: patient.telephone,
      regime: patient.regime,
      sexe: patient.sexe || '',
      numeroCni: patient.numeroCni || '',
      numeroAssure: patient.numeroAssure || '',
      dateNaissance: patient.dateNaissance || ''
    });
    this.searchResults = [];
    this.searchQuery = `${patient.prenom} ${patient.nom}`;
    // Le régime du patient sélectionné peut changer les pièces demandées.
    this.nettoyerPhotosHorsRegime();
  }

  clearSelectedPatient() {
    this.selectedPatientId = null;
    this.searchQuery = '';
    this.patientForm.reset({ regime: Regime.CONTRIBUTIF });
    this.nettoyerPhotosHorsRegime();
  }


  // ===== Photos =====
  /**
   * Changement de régime par l'agent : les photos qui ne correspondent plus aux
   * pièces demandées sont retirées (on ne soumet jamais un document du mauvais type).
   */
  onRegimeChange() {
    this.nettoyerPhotosHorsRegime();
  }

  private nettoyerPhotosHorsRegime() {
    const visibles = new Set(this.photoFields.map(f => f.key));
    (Object.keys(this.photos) as PhotoKey[]).forEach(k => {
      if (!visibles.has(k)) this.photos[k] = null;
    });
    if (!visibles.has('autreDocument')) this.autreDocumentTitre = '';
  }

  onPhotoSelected(key: PhotoKey, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner une image', 'Fermer', { duration: 3000 });
      input.value = '';
      return;
    }
    compressImageToDataUrl(file, 50 * 1024)
      .then(dataUrl => {
        this.photos[key] = dataUrl;
        // Extrait de naissance (régime 0-5 ans) : le titre du document est connu.
        if (key === 'autreDocument' && !this.autreDocumentTitre) {
          this.autreDocumentTitre = 'Extrait de naissance';
        }
        // L'OCR travaille sur le fichier original (meilleure résolution que la version compressée).
        if (key === 'cniRecto' || key === 'cniVerso') {
          this.lancerOcrCni(key, file);
        } else if (key === 'carteAssureRecto') {
          this.lancerOcrCarteAssure(key, file);
        }
      })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    input.value = '';
  }

  /** Ne remplit que les champs encore vides : la saisie de l'agent reste prioritaire. */
  private patchChampsVides(valeurs: Record<string, string | undefined>): string[] {
    const remplis: string[] = [];
    for (const [champ, valeur] of Object.entries(valeurs)) {
      const ctrl = this.patientForm.get(champ);
      if (valeur && ctrl && !ctrl.value) {
        ctrl.setValue(valeur);
        remplis.push(champ);
      }
    }
    return remplis;
  }

  private lancerOcrCni(key: PhotoKey, file: File) {
    this.ocrEnCours = key;
    this.snackBar.open('Lecture automatique de la CNI (OCR)...', 'Fermer', { duration: 3000 });
    ocrCni(file)
      .then(res => {
        if (res.numeroCni) {
          this.rechercherPatientEtRemplir(res.numeroCni, res, 'CNI');
        } else {
          this.appliquerOcr(res, 'CNI');
        }
      })
      .catch(() => this.snackBar.open('La lecture automatique a échoué : saisissez les informations manuellement', 'Fermer', { duration: 5000 }))
      .finally(() => { this.ocrEnCours = null; });
  }

  /** Carte d'assuré (régimes Classique / BSF / CEC) : nom, prénom, n° d'immatriculation. */
  private lancerOcrCarteAssure(key: PhotoKey, file: File) {
    this.ocrEnCours = key;
    this.snackBar.open("Lecture automatique de la carte d'assuré (OCR)...", 'Fermer', { duration: 3000 });
    ocrCarteAssure(file)
      .then(res => {
        if (res.numeroAssure) {
          this.rechercherPatientEtRemplir(res.numeroAssure, res, "carte d'assuré");
        } else {
          this.appliquerOcr(res, "carte d'assuré");
        }
      })
      .catch(() => this.snackBar.open('La lecture automatique a échoué : saisissez les informations manuellement', 'Fermer', { duration: 5000 }))
      .finally(() => { this.ocrEnCours = null; });
  }

  private rechercherPatientEtRemplir(numeroId: string, ocrData: any, type: string) {
    this.bcsuService.searchPatients(numeroId).subscribe({
      next: (patients) => {
        if (patients && patients.length > 0) {
          this.appliquerPatient(patients[0], ocrData, type);
        } else {
          // Aucun patient trouvé par ID, on tente par le nom et prénom
          if (ocrData.nom && ocrData.prenom) {
            const queryNom = `${ocrData.prenom} ${ocrData.nom}`;
            this.bcsuService.searchPatients(queryNom).subscribe({
              next: (patientsNom) => {
                if (patientsNom && patientsNom.length > 0) {
                  this.appliquerPatient(patientsNom[0], ocrData, type);
                } else {
                  this.appliquerOcr(ocrData, type);
                }
              },
              error: () => this.appliquerOcr(ocrData, type)
            });
          } else {
            this.appliquerOcr(ocrData, type);
          }
        }
      },
      error: (err) => {
        console.error('Erreur lors de la recherche du patient par ID', err);
        this.appliquerOcr(ocrData, type);
      }
    });
  }

  private appliquerPatient(patient: Patient, ocrData: any, type: string) {
    this.selectPatient(patient);
    this.patchChampsVides({
      nom: ocrData.nom, prenom: ocrData.prenom, dateNaissance: ocrData.dateNaissance, numeroCni: ocrData.numeroCni, numeroAssure: ocrData.numeroAssure, sexe: ocrData.sexe
    });
    this.snackBar.open("Patient existant trouvé à partir du document. Formulaire prérempli.", "Fermer", { duration: 5000 });
  }

  private appliquerOcr(res: any, type: string) {
    const remplis = this.patchChampsVides({
      nom: res.nom, prenom: res.prenom, dateNaissance: res.dateNaissance, numeroCni: res.numeroCni, numeroAssure: res.numeroAssure, sexe: res.sexe
    });
    this.snackBar.open(
      remplis.length
        ? `OCR ${type} : ${remplis.length} champ(s) rempli(s) automatiquement — vérifiez et complétez si besoin`
        : 'Lecture OCR incomplète : veuillez saisir les informations manuellement',
      'Fermer', { duration: 5000 });
  }



  removePhoto(key: PhotoKey) {
    this.photos[key] = null;
  }

  // ===== Enregistrement =====
  enregistrer() {
    if (this.patientForm.invalid) return;
    this.isSubmitting = true;
    const val = this.patientForm.value;

    const req: LettreGarantieRequest = {
      patientId: this.selectedPatientId || undefined,
      nom: val.nom,
      prenom: val.prenom,
      telephone: val.telephone,
      regime: val.regime,
      sexe: val.sexe || undefined,
      numeroCni: val.numeroCni || undefined,
      numeroAssure: val.numeroAssure || undefined,
      dateNaissance: val.dateNaissance || undefined,
      prestations: this.prestationsLignes,
      cniRecto: this.photos.cniRecto || undefined,
      cniVerso: this.photos.cniVerso || undefined,
      carteAssureRecto: this.photos.carteAssureRecto || undefined,
      autreDocument: this.photos.autreDocument || undefined,
      autreDocumentTitre: this.photos.autreDocument ? (this.autreDocumentTitre || 'Extrait de naissance') : undefined
    };

    const obs = this.isEditMode && this.editingId
      ? this.bcsuService.updateLettreGarantie(this.editingId, req)
      : this.bcsuService.createLettreGarantie(req);

    obs.subscribe({
      next: (lettre) => {
        this.isSubmitting = false;
        this.snackBar.open(this.isEditMode ? 'Dossier modifié' : 'Dossier créé : ' + lettre.numero, 'Fermer', { duration: 3000 });
        this.router.navigate(['/dashboard/lettres-garantie', lettre.id]);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }
}
