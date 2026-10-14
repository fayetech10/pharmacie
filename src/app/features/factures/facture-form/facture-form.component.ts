import { Component, OnInit, DestroyRef, inject, Output, EventEmitter } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FactureService } from '../../../core/services/facture.service';
import { BcsuService } from '../../../core/services/bcsu.service';
import { Facture, FactureRequest } from '../../../core/models/facture.model';
import { BonCommande, REGIME_LABELS } from '../../../core/models/bcsu.model';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MedicamentService } from '../../../core/services/medicament.service';
import { Medicament, StatutMedicament } from '../../../core/models/medicament.model';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmService } from '../../../core/services/confirm.service';
import { renderBonCommandeToDataUrl } from '../../../core/utils/bon-commande-image';
import { finDuMoisAtteinte, libelleEnvoiPossible } from '../../../core/utils/fin-de-mois';
import { QrScannerComponent } from '../../../shared/qr-scanner/qr-scanner.component';
import { PhotoPieceComponent } from '../../../shared/photo-piece/photo-piece.component';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

type PhotoKey = 'ticketCaisse' | 'bonCommande' | 'ordonnance';

/**
 * Saisie de la facture mensuelle d'une pharmacie, au gabarit de la facturation du
 * poste de santé : un patient à la fois, en trois étapes (patient, médicaments,
 * dossier et validation).
 */
@Component({
  selector: 'app-facture-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, RouterModule,
    MatIconModule, MatSnackBarModule, MatProgressSpinnerModule, MatTooltipModule,
    QrScannerComponent, PhotoPieceComponent, StatusBadgeComponent
  ],
  templateUrl: './facture-form.component.html'
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
  /** Équivalences (même DCI) du médicament saisi, le moins cher en premier. */
  equivalents: Medicament[] = [];

  /**
   * Nom du médicament saisi qui n'est ni éligible ni exclu : quand renseigné, l'écran
   * propose de l'ajouter comme « non répertorié » (après avertissement + validation SEN-CSU).
   */
  medicamentNonRepertorie: string | null = null;
  /** Classes thérapeutiques exclues (dérivées du référentiel) rappelées lors d'un ajout manuel. */
  excludedClasses: string[] = [];

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
  /** Comme au poste de santé : le patient d'abord, puis ses médicaments, puis le dossier. */
  readonly etapes = ['Patient', 'Médicaments', 'Dossier et validation'];
  currentStep = 1; // 1: Patient, 2: Médicaments, 3: Dossier et validation
  /** Dernier patient enregistré, rappelé en tête de la saisie suivante. */
  dernierEnregistrement: { nom: string; lignes: number; total: number } | null = null;

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
   * Circuit d'officine : prise en charge 50 % (cf. formulaire papier).
   */
  get bonMontantTiersPayant(): number { return this.patientCsu; }
  get bonMontantPatient(): number { return this.patientTotal - this.patientCsu; }

  nextStep() {
    if (this.currentStep < 3 && this.canGoNext()) {
      this.currentStep++;
      this.dernierEnregistrement = null;
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  canGoNext(): boolean {
    return this.peutAller(this.currentStep + 1);
  }

  /** Une étape est accessible dès que les précédentes sont renseignées. */
  peutAller(etape: number): boolean {
    if (etape <= 1) return true;
    if (!this.patientForm.valid) return false;
    return etape === 2 || this.patientLignes.length > 0;
  }

  allerA(etape: number) {
    if (etape !== this.currentStep && this.peutAller(etape)) {
      this.currentStep = etape;
    }
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
  /** QR code scanné sur le bon de commande : rattache directement le bon. */
  onQrScanne(code: string) {
    this.searchBcNumero = code;
    this.rechercherEtPrefiltrerBon(code);
  }

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
    // Précharge le cache des médicaments pour une autocomplétion instantanée, et en
    // extrait les classes thérapeutiques exclues (rappelées lors d'un ajout manuel).
    this.medicamentService.getAllCached().subscribe(list => {
      this.excludedClasses = Array.from(new Set(
        (list || [])
          .filter(m => m.statut === StatutMedicament.EXCLU)
          .map(m => (m.motif || m.classeTherapeutique || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'fr'));
    });
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

  // ===== Totaux courants du patient en cours de saisie =====
  get patientTotal(): number {
    return this.patientLignes.reduce((s, pl) => s + pl.quantite * pl.prixUnitaire, 0);
  }
  get patientCsu(): number { return Math.round(this.patientTotal / 2); }

  // ===== Synthèse de la facture du mois (en-tête de contexte) =====
  get factureLignesCount(): number { return this.facture?.lignes?.length ?? 0; }
  /** « Envoyer la facture » n'apparaît qu'à la fin du mois facturé. */
  get finDuMois(): boolean { return finDuMoisAtteinte(this.facture?.mois, this.facture?.annee); }
  get envoiPossibleLe(): string { return libelleEnvoiPossible(this.facture?.mois, this.facture?.annee); }
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
    this.medicamentNonRepertorie = null;
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
          } else if (exactMatch.statut === StatutMedicament.NON_REPERTORIE) {
            // Déjà signalé par un pharmacien, pas encore validé : ajout via le bouton dédié.
            this.medicamentForm.get('medicament')?.setErrors({ nonRepertorie: true });
            this.excludedInfo = null;
            this.medicamentNonRepertorie = exactMatch.nom;
          } else {
            this.medicamentForm.get('medicament')?.setErrors(null);
            this.excludedInfo = null;
            this.chargerEquivalents(exactMatch.nom);
          }
        } else {
          // Aucun médicament répertorié ne correspond exactement : on vide le codeProduit et
          // on force une erreur (bouton « Ajouter » standard désactivé). Le pharmacien peut
          // toutefois l'ajouter comme « non répertorié » via le bouton dédié.
          this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
          this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
          this.excludedInfo = null;
          this.equivalents = [];
          this.medicamentNonRepertorie = query.trim().toUpperCase();
        }
      });
    } else {
      this.suggestions = [];
      this.showSuggestions = false;
      this.activeIndex = -1;
      this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
      this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
      this.excludedInfo = null;
      this.equivalents = [];
    }
  }

  /** Sélection d'une suggestion (clic/tap ou Entrée) — remplace l'overlay Material (fiable sur iOS). */
  selectMedicament(med: Medicament) {
    this.medicamentForm.patchValue({ medicament: med.nom, codeProduit: med.code });
    this.isMedicamentSelected = true;
    this.showSuggestions = false;
    this.activeIndex = -1;
    this.medicamentNonRepertorie = null;
    if (med.statut === StatutMedicament.EXCLU) {
      this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
      this.excludedInfo = { nom: med.nom, motif: med.motif, description: med.description };
      this.snackBar.open("Attention: Ce médicament n'est pas éligible.", 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
    } else if (med.statut === StatutMedicament.NON_REPERTORIE) {
      this.medicamentForm.get('medicament')?.setErrors({ nonRepertorie: true });
      this.excludedInfo = null;
      this.medicamentNonRepertorie = med.nom;
    } else {
      this.medicamentForm.get('medicament')?.setErrors(null);
      this.excludedInfo = null;
      this.chargerEquivalents(med.nom);
    }
  }

  /**
   * Charge les équivalences (même DCI) du médicament saisi, le moins cher en tête,
   * pour que le pharmacien puisse proposer une alternative moins coûteuse.
   */
  private chargerEquivalents(nom: string) {
    this.equivalents = [];
    this.medicamentService.getEquivalents(nom).subscribe({
      next: res => this.equivalents = res || [],
      error: () => this.equivalents = []
    });
  }

  /** Remplace le médicament en cours de saisie par l'équivalent choisi. */
  choisirEquivalent(med: Medicament) {
    this.selectMedicament(med);
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
    this.medicamentNonRepertorie = null;
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
    const nom = (val.medicament || '').toString().toUpperCase();

    // Deux garde-fous successifs avant d'inscrire la ligne : le médicament a-t-il déjà
    // été délivré ce mois-ci (toutes pharmacies), et la quantité demandée dépasse-t-elle
    // le traitement mensuel ? Chacun peut annuler l'ajout.
    this.controleDelivranceMensuelle(nom).pipe(
      switchMap(ok => ok ? this.confirmerQuantiteMensuelle(val.quantite) : of(false))
    ).subscribe(ok => {
      if (!ok) return;
      this.inscrireLigne(val);
    });
  }

  /**
   * Contrôle national « médicament déjà délivré durant le mois » : le bénéficiaire est
   * identifié par son matricule et, à défaut, par son nom (bon de commande physique).
   * En cas de doublon, la quantité déjà délivrée est précisée et le pharmacien
   * confirme ou annule. Une erreur réseau ne bloque pas la facturation.
   */
  private controleDelivranceMensuelle(nom: string) {
    const matricule = (this.patientForm.get('patientMatricule')?.value || '').toString().trim();
    const nomPatient = (this.patientForm.get('patientNomPrenom')?.value || '').toString().trim();
    if (!matricule && !nomPatient) return of(true);

    return this.factureService.controlerDelivrance({ matricule, nom: nomPatient, medicament: nom }).pipe(
      switchMap(res => {
        if (!res || res.quantiteDejaDelivree <= 0) return of(true);
        const detail = (res.delivrances || [])
          .map(d => `${d.quantite} par ${d.pharmacieNom || 'une autre pharmacie'}`)
          .join(', ');
        return this.confirm.ask({
          title: 'Médicament déjà délivré durant le mois',
          message:
            `« ${nom} » a déjà été délivré à ce bénéficiaire ce mois-ci : `
            + `${res.quantiteDejaDelivree} unité(s) au total${detail ? ' (' + detail + ')' : ''}. `
            + `Vérifiez le respect du traitement mensuel avant de poursuivre.`,
          confirmText: 'Confirmer',
          cancelText: 'Annuler',
          danger: true
        });
      }),
      catchError(() => of(true))
    );
  }

  /** Quantité ≥ 2 : confirmation explicite que la prescription reste dans le traitement mensuel. */
  private confirmerQuantiteMensuelle(quantite: number) {
    if (!quantite || quantite < 2) return of(true);
    return this.confirm.ask({
      title: 'Quantité supérieure ou égale à 2',
      message: `Confirmer si la prescription n'excède pas le traitement mensuel (quantité saisie : ${quantite}).`,
      confirmText: 'Confirmer',
      cancelText: 'Annuler'
    });
  }

  /** Inscrit la ligne validée dans la saisie en cours et réarme le formulaire. */
  private inscrireLigne(val: any) {
    this.patientLignes.push({
      medicament: (val.medicament || '').toString().toUpperCase(),
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });

    // Bon rattaché : sa photo constituée reflète les lignes remplies.
    if (this.rattacheBon) this.refreshBonCommandePhoto();
    this.currentLinesChange.emit([...this.patientLignes]);

    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.isMedicamentSelected = false;
    this.suggestions = [];
    this.showSuggestions = false;
    this.activeIndex = -1;
    this.excludedInfo = null;
    this.equivalents = [];
    this.medicamentNonRepertorie = null;

    this.snackBar.open('Médicament préparé pour le patient', 'Fermer', { duration: 2000 });
  }

  /**
   * Ajoute un médicament « non répertorié » (ni éligible ni exclu) saisi manuellement par le
   * pharmacien. Un avertissement rappelle d'abord les classes thérapeutiques exclues et le fait
   * que la SEN-CSU se réserve le droit de contrôler le médicament ajouté. La ligne est marquée
   * « ajoutée par le pharmacien » (colonne Observation des factures).
   */
  ajouterMedicamentNonRepertorie() {
    const nom = (this.medicamentForm.get('medicament')?.value || '').toString().trim();
    if (!nom) return;

    const quantiteCtrl = this.medicamentForm.get('quantite');
    const prixCtrl = this.medicamentForm.get('prixUnitaire');
    if (quantiteCtrl?.invalid || prixCtrl?.invalid) {
      quantiteCtrl?.markAsTouched();
      prixCtrl?.markAsTouched();
      this.snackBar.open('Renseignez une quantité et un prix unitaire valides.', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      return;
    }

    if (this.bonLimitAtteinte) {
      const dispo = this.lignesDisponibles;
      this.snackBar.open(
        `Ce bon de commande n'a que ${dispo} ligne(s) disponible(s). Le patient peut se rendre dans une autre pharmacie avec ce bon pour les médicaments restants.`,
        'Fermer', { duration: 6000, panelClass: 'error-snackbar' }
      );
      return;
    }

    const classesExclues = this.excludedClasses.length
      ? ` Classes thérapeutiques exclues : ${this.excludedClasses.join(', ')}.`
      : '';
    this.confirm.ask({
      title: 'Médicament non répertorié',
      message:
        `« ${nom.toUpperCase()} » n'est pas répertorié : il ne figure ni dans les médicaments éligibles `
        + `ni dans les exclusions. Vous pouvez l'ajouter, mais il ne doit appartenir à AUCUNE des classes `
        + `thérapeutiques exclues.${classesExclues} Il sera ajouté puis signalé à la SEN-CSU, qui se réserve `
        + `le droit de le contrôler et de valider son intégration ou de l'exclure définitivement.`,
      confirmText: 'Confirmer',
      cancelText: 'Annuler',
      danger: true
    }).pipe(
      // Les mêmes garde-fous que pour un médicament répertorié s'appliquent ensuite.
      switchMap(ok => ok ? this.controleDelivranceMensuelle(nom.toUpperCase()) : of(false)),
      switchMap(ok => ok ? this.confirmerQuantiteMensuelle(this.medicamentForm.get('quantite')?.value) : of(false))
    ).subscribe(ok => {
      if (!ok) return;

      const val = this.medicamentForm.value;
      // Aucun code officiel : code temporaire pour satisfaire la validation, le backend
      // enregistre le médicament en « non répertorié » pour validation par la SEN-CSU.
      const codeProduit = (val.codeProduit || '').toString().trim() || ('NR-' + Date.now());
      this.patientLignes.push({
        medicament: nom.toUpperCase(),
        codeProduit,
        quantite: val.quantite,
        prixUnitaire: val.prixUnitaire,
        ajouteParPharmacien: true
      });

      if (this.rattacheBon) this.refreshBonCommandePhoto();
      this.currentLinesChange.emit([...this.patientLignes]);

      this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
      this.isMedicamentSelected = false;
      this.suggestions = [];
      this.showSuggestions = false;
      this.activeIndex = -1;
      this.excludedInfo = null;
      this.medicamentNonRepertorie = null;

      this.snackBar.open('Médicament non répertorié ajouté — à valider par la SEN-CSU.', 'Fermer', { duration: 4000 });
    });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
    // Bon rattaché : on régénère sa photo après retrait d'une ligne.
    if (this.rattacheBon) this.refreshBonCommandePhoto();
    this.currentLinesChange.emit([...this.patientLignes]);
  }

  /**
   * Remet une ligne préparée dans le formulaire de saisie pour correction :
   * la ligne est retirée de la liste et ses valeurs rechargées. Le pharmacien
   * la réajoute ensuite, ce qui rejoue les contrôles (délivrance, quantité).
   */
  modifierMedicamentTemp(index: number) {
    const ligne = this.patientLignes[index];
    if (!ligne) return;

    this.medicamentForm.patchValue({
      medicament: ligne.medicament,
      codeProduit: ligne.codeProduit,
      quantite: ligne.quantite,
      prixUnitaire: ligne.prixUnitaire
    });
    this.isMedicamentSelected = true;
    this.medicamentNonRepertorie = ligne.ajouteParPharmacien ? ligne.medicament : null;

    this.retirerMedicamentTemp(index);
    this.snackBar.open('Ligne rechargée dans le formulaire — corrigez puis réajoutez-la.', 'Fermer', { duration: 4000 });
  }

  /**
   * Déclenché quand le pharmacien quitte le champ « Numéro matricule ».
   * Filet de sécurité pour le cas où le matricule est renseigné APRÈS l'ajout des
   * médicaments : le contrôle bloquant à l'ajout n'avait alors pas de quoi identifier
   * le bénéficiaire. Purement informatif ici — les lignes sont déjà saisies.
   */
  onMatriculeBlur() {
    const matricule = (this.patientForm.get('patientMatricule')?.value || '').toString().trim();
    if (!matricule || this.patientLignes.length === 0) return;

    const controles = this.patientLignes.map(l =>
      this.factureService.controlerDelivrance({ matricule, medicament: l.medicament }).pipe(
        map(res => ({ nom: l.medicament, quantite: res?.quantiteDejaDelivree ?? 0 })),
        catchError(() => of({ nom: l.medicament, quantite: 0 }))
      )
    );

    forkJoin(controles).subscribe(resultats => {
      const doublons = resultats.filter(r => r.quantite > 0);
      if (doublons.length === 0) return;

      const detail = doublons.map(d => `${d.nom} (${d.quantite} déjà délivré(s))`).join(', ');
      this.confirm.ask({
        title: 'Médicament déjà délivré durant le mois',
        message: `Ce bénéficiaire a déjà reçu ce mois-ci : ${detail}. `
          + `Vérifiez le respect du traitement mensuel avant d'enregistrer.`,
        confirmText: 'Continuer',
        hideCancel: true
      }).subscribe();
    });
  }

  /** Photo acceptée par le contrôle de qualité (compressée à 50 Ko), ou retirée (null). */
  onPhoto(key: PhotoKey, image: string | null) {
    this.photos[key] = image;
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
          this.memoriserEnregistrement();
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

  /** Garde la trace du patient qui vient d'être enregistré (bandeau de confirmation). */
  private memoriserEnregistrement() {
    this.dernierEnregistrement = {
      nom: (this.patientForm.get('patientNomPrenom')?.value || '').toString().trim(),
      lignes: this.patientLignes.length,
      total: this.patientTotal
    };
  }

  supprimerLigne(index: number) {
    if (!this.facture) return;
    const nouvellesLignes = this.facture.lignes.filter((_, i) => i !== index);
    this.mettreAJourLignes(nouvellesLignes, false);
  }

  /** Corrige la quantité puis le prix unitaire d'une ligne déjà enregistrée. */
  modifierLigne(index: number) {
    if (!this.facture) return;
    const ligne = this.facture.lignes[index];
    if (!ligne) return;

    this.confirm.prompt({
      title: `Modifier « ${ligne.medicament} »`,
      label: 'Quantité',
      initialValue: String(ligne.quantite ?? 1),
      required: true,
      confirmText: 'Suivant'
    }).pipe(
      switchMap(qte => {
        if (qte === null) return of(null);
        const quantite = Number(qte);
        if (!Number.isFinite(quantite) || quantite <= 0) {
          this.snackBar.open('Quantité invalide', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
          return of(null);
        }
        return this.confirm.prompt({
          title: `Modifier « ${ligne.medicament} »`,
          label: 'Prix unitaire (FCFA)',
          initialValue: String(ligne.prixUnitaire ?? 0),
          required: true,
          confirmText: 'Enregistrer'
        }).pipe(map(prix => prix === null ? null : { quantite, prix: Number(prix) }));
      })
    ).subscribe(res => {
      if (!res) return;
      if (!Number.isFinite(res.prix) || res.prix < 0) {
        this.snackBar.open('Prix unitaire invalide', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
        return;
      }
      const lignes = [...this.facture!.lignes];
      lignes[index] = {
        ...lignes[index],
        quantite: res.quantite,
        prixUnitaire: res.prix,
        montant: res.quantite * res.prix
      };
      this.mettreAJourLignes(lignes, false);
    });
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
          this.memoriserEnregistrement();
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
          this.router.navigate(['/dashboard/espace-pharmacie/factures']);
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
