import { Component, OnInit, DestroyRef, inject, Output, EventEmitter } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FactureService } from '../../../core/services/facture.service';
import { BcsuService } from '../../../core/services/bcsu.service';
import { Facture, FactureRequest } from '../../../core/models/facture.model';
import { BonCommande, REGIME_LABELS } from '../../../core/models/bcsu.model';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MedicamentService } from '../../../core/services/medicament.service';
import { Medicament, StatutMedicament } from '../../../core/models/medicament.model';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmService } from '../../../core/services/confirm.service';
import { compressImageToDataUrl } from '../../../core/utils/image-compression';
import { renderBonCommandeToDataUrl } from '../../../core/utils/bon-commande-image';

type PhotoKey = 'ticketCaisse' | 'bonCommande' | 'ordonnance';

@Component({
  selector: 'app-facture-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatInputModule,
    MatButtonModule, MatIconModule, MatSnackBarModule,
    MatTableModule, MatTooltipModule, RouterModule, FormsModule
  ],
  templateUrl: './facture-form.component.html',
  styleUrls: ['./facture-form.component.css']
})
export class FactureFormComponent implements OnInit {
  searchBcNumero = 'BC-';
  patientForm!: FormGroup;
  medicamentForm!: FormGroup;
  patientLignes: any[] = [];
  facture: Facture | null = null;
  isEditMode = false;
  isSubmitting = false;
  suggestions: Medicament[] = [];
  /** Affiche la liste de suggestions inline (autocomplétion maison, sans overlay CDK : fiable sur iOS). */
  showSuggestions = false;
  /** Index de la suggestion surlignée pour la navigation clavier (-1 = aucune). */
  activeIndex = -1;
  excludedInfo: { nom: string; motif?: string; description?: string } | null = null;

  // Dossier patient : pièces justificatives (data URL base64)
  readonly photoFields: { key: PhotoKey; label: string }[] = [
    { key: 'ticketCaisse', label: 'Ticket de caisse' },
    { key: 'bonCommande', label: 'Bon de commande' },
    { key: 'ordonnance', label: 'Ordonnance' }
  ];
  photos: Record<PhotoKey, string | null> = { ticketCaisse: null, bonCommande: null, ordonnance: null };
  viewerImage: string | null = null;
  /**
   * Vrai quand la « photo » du bon de commande a été constituée automatiquement
   * (un bon a été recherché et rattaché) : le pharmacien n'ajoute alors que le
   * ticket de caisse et l'ordonnance.
   */
  bonCommandeAuto = false;

  /** Émet la liste de lignes du patient en cours à chaque modification (ajout / retrait). */
  @Output() currentLinesChange = new EventEmitter<any[]>();
  /** Émet la facture à chaque chargement ou mise à jour. */
  @Output() factureChange = new EventEmitter<any>();

  /** Pièces à photographier manuellement : le bon de commande est retiré s'il est constitué automatiquement. */
  get manualPhotoFields(): { key: PhotoKey; label: string }[] {
    if (this.bonCommandeAuto) {
      if (!this._cachedManualPhotoFields) {
        this._cachedManualPhotoFields = this.photoFields.filter(p => p.key !== 'bonCommande');
      }
      return this._cachedManualPhotoFields;
    }
    return this.photoFields;
  }
  private _cachedManualPhotoFields: { key: PhotoKey; label: string }[] | null = null;
  isMedicamentSelected = false;
  currentStep = 1; // 1: Médicaments, 2: Patient, 3: Dossier

  // Bon de commande recherché et rattaché (affiché comme le formulaire papier ASCSU)
  rattacheBon: BonCommande | null = null;
  readonly regimeLabels = REGIME_LABELS;

  get rattacheBonNumero(): string | null {
    return this.rattacheBon?.numero ?? null;
  }

  /**
   * Nombre de lignes encore disponibles sur le bon rattaché pour cette pharmacie.
   * Prend en compte les lignes déjà consommées par d'autres pharmacies.
   */
  get lignesDisponibles(): number {
    if (!this.rattacheBon) return Infinity;
    return (this.rattacheBon.nombreLignes ?? 0) - (this.rattacheBon.lignesUtilisees ?? 0);
  }

  /** Vrai si le nombre de médicaments ajoutés atteint la limite du bon. */
  get bonLimitAtteinte(): boolean {
    return !!this.rattacheBon && this.patientLignes.length >= this.lignesDisponibles;
  }

  /**
   * Lignes du bon de commande affichées comme sur le formulaire papier :
   * autant de lignes que disponibles pour cette pharmacie, remplies au fur et
   * à mesure que le pharmacien ajoute des médicaments (null = ligne vide).
   */
  get bonRows(): (any | null)[] {
    // Sans bon rattaché, aucune ligne « papier » à afficher (le bloc est déjà masqué
    // par *ngIf="rattacheBon"). Garde-fou indispensable : `lignesDisponibles` vaut
    // Infinity tant qu'aucun bon n'est rattaché — sans ce retour anticipé, un appel
    // à ce getter construirait `Array.from({ length: Infinity })`, ce qui fige puis
    // fait planter l'onglet du navigateur.
    if (!this.rattacheBon) return [];
    const n = Math.max(this.lignesDisponibles, this.patientLignes.length);
    // Borne défensive : un `nombreLignes` absent/aberrant renvoyé par le backend ne
    // doit jamais provoquer la création d'un tableau démesuré.
    const safeN = Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : this.patientLignes.length;
    return Array.from({ length: safeN }, (_, i) => this.patientLignes[i] ?? null);
  }

  /** Circuit d'officine : prise en charge 50 % (cf. formulaire papier). */
  get bonMontantTiersPayant(): number { return this.patientCsu; }
  get bonMontantPatient(): number { return this.patientTotal - this.patientCsu; }

  nextStep() {
    if (this.currentStep < 3 && this.canGoNext()) {
      this.currentStep++;
      if (this.currentStep === 3) {
        this.dossierOpen = true;
      }
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  canGoNext(): boolean {
    if (this.currentStep === 1) {
      return this.patientLignes.length > 0;
    }
    if (this.currentStep === 2) {
      return this.patientForm.valid;
    }
    return true;
  }

  constructor(
    private fb: FormBuilder,
    private factureService: FactureService,
    private bcsuService: BcsuService,
    private medicamentService: MedicamentService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService
  ) {
    this.patientForm = this.fb.group({
      patientNomPrenom: ['', Validators.required],
      patientMatricule: ['', Validators.required]
    });

    this.medicamentForm = this.fb.group({
      medicament: ['', Validators.required],
      codeProduit: ['', Validators.required],
      quantite: [1, [Validators.required, Validators.min(1)]],
      prixUnitaire: [null, [Validators.required, Validators.min(1)]]
    });
  }

  /**
   * Recherche un bon de commande par numéro et l'affiche tel quel (lignes vides,
   * comme le formulaire papier) : les médicaments ajoutés viendront remplir ses lignes.
   */
  rechercherEtPrefiltrerBon(numero: string) {
    if (!numero || !numero.trim()) {
      this.snackBar.open('Veuillez saisir un numéro de bon', 'Fermer', { duration: 3000 });
      return;
    }
    this.bcsuService.searchBonCommandeByNumero(numero.trim()).subscribe({
      next: (bon) => {
        this.rattacheBon = bon;
        this.patientForm.patchValue({
          patientNomPrenom: `${bon.patientPrenom} ${bon.patientNom}`,
          patientMatricule: bon.patientMatricule || ''
        });
        // Constitue automatiquement la « photo » du bon de commande pour le dossier patient :
        // le pharmacien n'a plus qu'à ajouter le ticket de caisse et l'ordonnance.
        this.refreshBonCommandePhoto();
        const dispo = (bon.nombreLignes ?? 0) - (bon.lignesUtilisees ?? 0);
        const dejaUtilisees = bon.lignesUtilisees ?? 0;
        const msgPartiel = dejaUtilisees > 0
          ? ` (${dejaUtilisees} ligne(s) déjà utilisée(s) dans une autre pharmacie — ${dispo} disponible(s))`
          : '';
        this.snackBar.open(`Bon ${bon.numero} rattaché${msgPartiel} : complétez ses lignes puis ajoutez ticket de caisse et ordonnance`, 'Fermer', { duration: 6000 });
      },
      error: (err) => {
        // Message du backend (ex. « déjà utilisé ») si présent, sinon message générique.
        const msg = err?.error?.message || 'Bon de commande introuvable ou invalide';
        this.snackBar.open(msg, 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      }
    });
  }

  detacherBon() {
    this.rattacheBon = null;
    this.searchBcNumero = 'BC-';
    // Retire la photo du bon constituée automatiquement : le pharmacien reprend la main.
    if (this.bonCommandeAuto) {
      this.photos.bonCommande = null;
      this.bonCommandeAuto = false;
    }
  }

  /**
   * (Re)constitue la « photo » du bon de commande à partir du bon rattaché et des
   * médicaments saisis, et l'insère dans le dossier patient — sans photographie.
   */
  private refreshBonCommandePhoto() {
    const bon = this.rattacheBon;
    if (!bon) return;
    this.photos.bonCommande = renderBonCommandeToDataUrl(
      {
        numero: bon.numero,
        patientPrenom: bon.patientPrenom,
        patientNom: bon.patientNom,
        regimeLabel: this.regimeLabels[bon.regime] ?? '',
        lettreGarantieNumero: bon.lettreGarantieNumero,
        dateEmission: bon.createdAt ? new Date(bon.createdAt).toLocaleDateString('fr-FR') : '',
        nombreLignes: bon.nombreLignes ?? 0,
        total: this.patientTotal,
        montantPatient: this.bonMontantPatient,
        montantTiersPayant: this.bonMontantTiersPayant
      },
      this.patientLignes.map(pl => ({ medicament: pl.medicament, quantite: pl.quantite, prixUnitaire: pl.prixUnitaire }))
    );
    this.bonCommandeAuto = true;
  }

  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    // Précharge le cache des médicaments pour une autocomplétion instantanée
    this.medicamentService.getAllCached().subscribe();
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        if (params.has('id')) {
          this.isEditMode = true;
          this.loadSpecificFacture(params.get('id')!);
        } else {
          this.isEditMode = false;
          this.loadCurrentFacture();
        }
      });
    // L'avertissement « limite mensuelle ≥ 2 » est désormais affiché en ligne
    // (bloc calme près du champ Quantité) plutôt que via un snackbar à chaque frappe.
  }

  // ===== Dossier (pièces justificatives) : repliable pour alléger l'écran =====
  dossierOpen = false;
  toggleDossier() { this.dossierOpen = !this.dossierOpen; }
  get photosCount(): number {
    return this.photoFields.filter(p => !!this.photos[p.key]).length;
  }

  // ===== Totaux courants du patient en cours de saisie =====
  get patientTotal(): number {
    return this.patientLignes.reduce((s, pl) => s + pl.quantite * pl.prixUnitaire, 0);
  }
  get patientCsu(): number { return Math.round(this.patientTotal / 2); }

  // ===== Synthèse de la facture du mois (en-tête de contexte) =====
  get factureLignesCount(): number { return this.facture?.lignes?.length ?? 0; }
  get facturePatientsCount(): number {
    const ls = this.facture?.lignes ?? [];
    const ids = new Set(
      ls.map(l => (l.patientMatricule || l.patientNomPrenom || '').trim().toLowerCase()).filter(Boolean)
    );
    return ids.size;
  }

  /** Stepper de quantité (min 1). */
  adjustQuantite(delta: number) {
    const ctrl = this.medicamentForm.get('quantite');
    const next = Math.max(1, (Number(ctrl?.value) || 1) + delta);
    ctrl?.setValue(next);
  }

  loadCurrentFacture() {
    this.factureService.getCurrent().subscribe(res => {
      this.facture = res;
      this.factureChange.emit(res);
    });
  }

  loadSpecificFacture(id: string) {
    this.factureService.getById(id).subscribe(res => {
      this.facture = res;
      this.factureChange.emit(res);
    });
  }

  onMedicamentInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    if (query.length >= 2) {
      this.medicamentService.search(query).subscribe(res => {
        this.suggestions = res;
        this.activeIndex = -1;
        this.showSuggestions = res.length > 0;

        const exactMatch = res.find(m => m.nom.toLowerCase() === query.trim().toLowerCase());
        if (exactMatch) {
          this.medicamentForm.patchValue({ codeProduit: exactMatch.code }, { emitEvent: false });
          if (exactMatch.statut === StatutMedicament.EXCLU) {
            this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
            this.excludedInfo = { nom: exactMatch.nom, motif: exactMatch.motif, description: exactMatch.description };
            this.snackBar.open("Attention: Le médicament saisi n'est pas éligible et ne peut être facturé.", 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
          } else {
            this.medicamentForm.get('medicament')?.setErrors(null);
            this.excludedInfo = null;
          }
        } else {
          // Si pas de match exact, on vide le codeProduit et on force une erreur
          this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
          this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
          this.excludedInfo = null;
        }
      });
    } else {
      this.suggestions = [];
      this.showSuggestions = false;
      this.activeIndex = -1;
      this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
      this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
      this.excludedInfo = null;
    }
  }

  /** Sélection d'une suggestion (clic/tap ou Entrée) — remplace l'overlay Material (fiable sur iOS). */
  selectMedicament(med: Medicament) {
    this.medicamentForm.patchValue({ medicament: med.nom, codeProduit: med.code });
    this.isMedicamentSelected = true;
    this.showSuggestions = false;
    this.activeIndex = -1;
    if (med.statut === StatutMedicament.EXCLU) {
      this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
      this.excludedInfo = { nom: med.nom, motif: med.motif, description: med.description };
      this.snackBar.open("Attention: Ce médicament n'est pas éligible.", 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
    } else {
      this.medicamentForm.get('medicament')?.setErrors(null);
      this.excludedInfo = null;
    }
  }

  /** Rouvre la liste si on revient dans le champ et que des suggestions sont disponibles. */
  onMedicamentFocus() {
    if (!this.isMedicamentSelected && this.suggestions.length > 0) {
      this.showSuggestions = true;
    }
  }

  /** Ferme la liste au blur, avec un court délai pour laisser le tap/clic d'une option s'exécuter (iOS Safari). */
  onMedicamentBlur() {
    setTimeout(() => { this.showSuggestions = false; this.activeIndex = -1; }, 150);
  }

  /** Navigation clavier dans la liste de suggestions (flèches, Entrée, Échap). */
  onMedicamentKeydown(event: KeyboardEvent) {
    if (!this.showSuggestions || this.suggestions.length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex = (this.activeIndex + 1) % this.suggestions.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex = (this.activeIndex - 1 + this.suggestions.length) % this.suggestions.length;
        break;
      case 'Enter':
        if (this.activeIndex >= 0) {
          event.preventDefault();
          this.selectMedicament(this.suggestions[this.activeIndex]);
        }
        break;
      case 'Escape':
        this.showSuggestions = false;
        this.activeIndex = -1;
        break;
    }
  }

  clearMedicamentSelection() {
    this.medicamentForm.patchValue({ medicament: '', codeProduit: '' });
    this.isMedicamentSelected = false;
    this.suggestions = [];
    this.showSuggestions = false;
    this.activeIndex = -1;
    this.excludedInfo = null;
  }

  ajouterMedicamentLigne() {
    if (this.medicamentForm.invalid) return;

    // Vérifie la limite de lignes du bon de commande rattaché.
    if (this.bonLimitAtteinte) {
      const dispo = this.lignesDisponibles;
      this.snackBar.open(
        `Ce bon de commande n'a que ${dispo} ligne(s) disponible(s). Vous avez déjà ajouté ${this.patientLignes.length} médicament(s). Le patient peut se rendre dans une autre pharmacie avec ce bon pour les médicaments restants.`,
        'Fermer', { duration: 6000, panelClass: 'error-snackbar' }
      );
      return;
    }

    const val = this.medicamentForm.value;
    this.patientLignes.push({
      medicament: (val.medicament || '').toString().toUpperCase(),
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });

    // Bon rattaché : sa photo constituée reflète les lignes remplies.
    if (this.rattacheBon) this.refreshBonCommandePhoto();
    this.currentLinesChange.emit([...this.patientLignes]);

    const quantiteAjoutee = val.quantite;

    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.isMedicamentSelected = false;
    this.suggestions = [];
    this.showSuggestions = false;
    this.activeIndex = -1;
    this.excludedInfo = null;

    if (quantiteAjoutee >= 2) {
      this.snackBar.open('Avertissement : La quantité de ce médicament (' + quantiteAjoutee + ') atteint ou dépasse la limite mensuelle autorisée de 2 unités.', 'Fermer', { duration: 6000 });
    } else {
      this.snackBar.open('Médicament préparé pour le patient', 'Fermer', { duration: 2000 });
    }
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
    // Bon rattaché : on régénère sa photo après retrait d'une ligne.
    if (this.rattacheBon) this.refreshBonCommandePhoto();
    this.currentLinesChange.emit([...this.patientLignes]);
  }

  /**
   * Déclenché quand le pharmacien quitte le champ « Numéro matricule ».
   * Vérifie si le bénéficiaire a déjà reçu, ce mois-ci, un des médicaments en cours de saisie.
   */
  onMatriculeBlur() {
    const matricule = (this.patientForm.get('patientMatricule')?.value || '').toString().trim().toLowerCase();
    if (!matricule || this.patientLignes.length === 0) return;

    const lignesExistantes = (this.facture?.lignes ?? []).filter(
      l => (l.patientMatricule || '').toString().trim().toLowerCase() === matricule
    );
    if (lignesExistantes.length === 0) return;

    const codesDejaDelivres = new Set(lignesExistantes.map(l => l.codeProduit));
    const doublons = this.patientLignes.filter(pl => codesDejaDelivres.has(pl.codeProduit));
    if (doublons.length === 0) return;

    const noms = doublons.map(d => d.medicament).join(', ');
    this.confirm.ask({
      title: `Médicament déjà délivré : ${noms}`,
      message: 'Médicament déjà délivré durant le mois. Vérifier le respect du traitement mensuel.',
      confirmText: 'Continuer',
      hideCancel: true
    }).subscribe();
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
    // Compression côté client (≤ 50 Ko) avant envoi au serveur.
    compressImageToDataUrl(file, 50 * 1024)
      .then(dataUrl => { this.photos[key] = dataUrl; })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    input.value = '';
  }

  removePhoto(key: PhotoKey) {
    this.photos[key] = null;
  }

  openViewer(src: string) {
    this.viewerImage = src;
  }

  private resetPhotos() {
    this.photos = { ticketCaisse: null, bonCommande: null, ordonnance: null };
    this.bonCommandeAuto = false;
  }

  enregistrerPatientFacture() {
    if (this.patientForm.invalid || this.patientLignes.length === 0) return;

    this.isSubmitting = true;
    // Assure une photo du bon à jour (lignes + patient définitifs) avant enregistrement.
    if (this.rattacheBon) this.refreshBonCommandePhoto();
    const patientVal = this.patientForm.value;

    const nouvellesLignes = this.patientLignes.map(pl => ({
      ...pl,
      patientNomPrenom: patientVal.patientNomPrenom,
      patientMatricule: patientVal.patientMatricule,
      bonCommandeNumero: this.rattacheBonNumero || undefined,
      ticketCaisse: this.photos.ticketCaisse || undefined,
      bonCommande: this.photos.bonCommande || undefined,
      ordonnance: this.photos.ordonnance || undefined
    }));

    if (!this.isEditMode) {
      // Saisie rapide pour le mois en cours
      this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
        next: (res) => {
          this.facture = res;
          this.factureChange.emit(res);
          this.currentLinesChange.emit([]);
          this.patientForm.reset();
          this.patientLignes = [];
          this.rattacheBon = null;
          this.resetPhotos();
          this.currentStep = 1;
          this.isSubmitting = false;
          this.snackBar.open('Patient et médicaments ajoutés à la facture', 'Fermer', { duration: 3000 });
        },
        error: (err) => {
          this.isSubmitting = false;
          this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    } else {
      // Édition d'une facture spécifique
      if (!this.facture) return;
      const lignesCombines = [...this.facture.lignes, ...nouvellesLignes];
      this.mettreAJourLignes(lignesCombines, true);
    }
  }

  supprimerLigne(index: number) {
    if (!this.facture) return;
    const nouvellesLignes = this.facture.lignes.filter((_, i) => i !== index);
    this.mettreAJourLignes(nouvellesLignes, false);
  }

  private mettreAJourLignes(lignes: any[], clearForm: boolean) {
    if (!this.facture) return;
    
    this.isSubmitting = true;
    const req: FactureRequest = {
      mois: this.facture.mois,
      annee: this.facture.annee,
      lignes: lignes
    };

    this.factureService.update(this.facture.id, req).subscribe({
      next: (res) => {
        this.facture = res;
        this.factureChange.emit(res);
        if (clearForm) {
          this.patientForm.reset();
          this.patientLignes = [];
          this.rattacheBon = null;
          this.resetPhotos();
          this.currentStep = 1;
        }
        this.isSubmitting = false;
        this.snackBar.open('Facture mise à jour', 'Fermer', { duration: 2000 });
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur de mise à jour', 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  envoyerFacture() {
    if (!this.facture) return;
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.',
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.envoyer(this.facture!.id).subscribe({
        next: () => {
          this.snackBar.open('Facture envoyée avec succès', 'Fermer', { duration: 3000 });
          // Retour vers « Mes Factures » (la route /dashboard/factures n'existe pas).
          this.router.navigate(['/dashboard/espace-pharmacie'], { queryParams: { tab: 1 } });
        },
        error: (err) => {
          this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }
}
