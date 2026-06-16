import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FactureService } from '../../core/services/facture.service';
import { FactureEventsService } from '../../core/services/facture-events.service';
import { AuthService } from '../../core/services/auth.service';
import { MedicamentService } from '../../core/services/medicament.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { Medicament, StatutMedicament } from '../../core/models/medicament.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { compressImageToDataUrl } from '../../core/utils/image-compression';
import { BreakpointObserver } from '@angular/cdk/layout';

type PhotoKey = 'ticketCaisse' | 'bonCommande' | 'ordonnance';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatIconModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatTooltipModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  currentUser: any;
  /** Factures rejetées (SR + central) à corriger — alimente l'alerte en tête. */
  facturesRejetees = 0;

  // Saisie rapide
  patientForm!: FormGroup;
  medicamentForm!: FormGroup;
  patientLignes: any[] = [];
  currentFacture: Facture | null = null;
  isSubmitting = false;
  /** Affichage mobile : enregistrement en 2 étapes (wizard). */
  isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  /** Étape du wizard mobile : 0 = médicaments, 1 = patient + dossier. */
  wizardStep: 0 | 1 = 0;
  suggestions: Medicament[] = [];
  // Info d'exclusion affichée quand un médicament exclu est saisi/sélectionné
  excludedInfo: { nom: string; motif?: string; description?: string } | null = null;

  // Dossier patient : pièces justificatives (data URL base64)
  readonly photoFields: { key: PhotoKey; label: string }[] = [
    { key: 'ticketCaisse', label: 'Ticket de caisse' },
    { key: 'bonCommande', label: 'Bon de commande' },
    { key: 'ordonnance', label: 'Ordonnance' }
  ];
  photos: Record<PhotoKey, string | null> = { ticketCaisse: null, bonCommande: null, ordonnance: null };
  viewerImage: string | null = null;

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private medicamentService: MedicamentService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    private breakpoints: BreakpointObserver
  ) {
    this.currentUser = this.authService.getCurrentUser();

    this.patientForm = this.fb.group({
      patientNomPrenom: ['', Validators.required],
      patientMatricule: ['', Validators.required]
    });

    this.medicamentForm = this.fb.group({
      medicament: ['', Validators.required],
      codeProduit: ['', Validators.required],
      quantite: [1, [Validators.required, Validators.min(1)]],
      prixUnitaire: [0, [Validators.required, Validators.min(0)]]
    });
  }

  private destroyRef = inject(DestroyRef);
  private factureEvents = inject(FactureEventsService);

  ngOnInit() {
    // Wizard mobile : suit le point de rupture (≤768px). Sur desktop, tout est visible.
    this.breakpoints.observe('(max-width: 768px)')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        this.isMobile = state.matches;
        if (!this.isMobile) this.wizardStep = 0;
      });
    this.loadData();
    this.loadCurrentFacture();
    // Précharge le cache des médicaments pour une autocomplétion instantanée dès la 1ʳᵉ frappe
    this.medicamentService.getAllCached().subscribe();
    // Rafraîchit le tableau de bord sans recharger la page après toute modification de facture.
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadData();
        this.loadCurrentFacture();
      });
  }

  loadData() {
    this.factureService.getAll().subscribe((factures: Facture[]) => {
      this.facturesRejetees = factures.filter(
        (f: Facture) => f.statut === StatutFacture.REJETEE_SR || f.statut === StatutFacture.REJETEE_NC
      ).length;
    });
  }

  loadCurrentFacture() {
    this.factureService.getCurrent().subscribe(res => {
      this.currentFacture = res;
    });
  }

  get todayLabel(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // === Saisie Rapide Methods ===

  onMedicamentInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    if (query.length >= 2) {
      this.medicamentService.search(query).subscribe(res => {
        this.suggestions = res;
        const exactMatch = res.find(m => m.nom.toLowerCase() === query.trim().toLowerCase());
        if (exactMatch) {
          this.medicamentForm.patchValue({ codeProduit: exactMatch.code }, { emitEvent: false });
          this.applyMedicamentStatut(exactMatch);
        } else {
          this.excludedInfo = null;
        }
      });
    } else {
      this.suggestions = [];
      this.excludedInfo = null;
    }
  }

  onMedicamentSelected(event: any) {
    const nom = event.option.value;
    const med = this.suggestions.find(m => m.nom === nom);
    if (med) {
      this.medicamentForm.patchValue({ codeProduit: med.code });
      this.applyMedicamentStatut(med);
    }
  }

  /** Applique le statut du médicament : bloque + affiche motif/description si EXCLU. */
  private applyMedicamentStatut(med: Medicament) {
    if (med.statut === StatutMedicament.EXCLU) {
      this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
      this.excludedInfo = { nom: med.nom, motif: med.motif, description: med.description };
    } else {
      this.medicamentForm.get('medicament')?.setErrors(null);
      this.excludedInfo = null;
    }
  }

  ajouterMedicamentLigne() {
    if (this.medicamentForm.invalid) return;
    const val = this.medicamentForm.value;
    this.patientLignes.push({
      medicament: (val.medicament || '').toString().toUpperCase(),
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });
    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.suggestions = [];
    this.excludedInfo = null;
    this.snackBar.open('Médicament préparé', 'OK', { duration: 2000 });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
  }

  /** Wizard mobile : passe à l'étape « patient + dossier » (au moins un médicament requis). */
  goToPatientStep() {
    if (this.patientLignes.length === 0) return;
    this.wizardStep = 1;
    this.scrollToFormTop();
  }

  /** Wizard mobile : revient à l'étape « médicaments ». */
  goToMedicamentStep() {
    this.wizardStep = 0;
    this.scrollToFormTop();
  }

  private scrollToFormTop() {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
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
  }

  enregistrerPatientFacture() {
    if (this.patientForm.invalid || this.patientLignes.length === 0) return;

    this.isSubmitting = true;
    const patientVal = this.patientForm.value;
    const nouvellesLignes = this.patientLignes.map(pl => ({
      ...pl,
      patientNomPrenom: patientVal.patientNomPrenom,
      patientMatricule: patientVal.patientMatricule,
      ticketCaisse: this.photos.ticketCaisse || undefined,
      bonCommande: this.photos.bonCommande || undefined,
      ordonnance: this.photos.ordonnance || undefined
    }));

    this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
      next: (res) => {
        this.currentFacture = res;
        this.patientForm.reset();
        this.patientLignes = [];
        this.resetPhotos();
        this.wizardStep = 0; // retour à l'étape « médicaments » pour le patient suivant
        this.isSubmitting = false;
        this.snackBar.open('Patient et médicaments ajoutés à la facture', 'OK', { duration: 3000 });
        this.loadData();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  envoyerFacture() {
    if (!this.currentFacture) return;
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.',
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.envoyer(this.currentFacture!.id).subscribe({
        next: () => {
          this.snackBar.open('Facture envoyée avec succès', 'OK', { duration: 3000 });
          this.loadData();
          this.loadCurrentFacture();
        },
        error: (err) => {
          this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
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

  get currentMonthLabel(): string {
    const mois = this.currentFacture?.mois ?? (new Date().getMonth() + 1);
    const annee = this.currentFacture?.annee ?? new Date().getFullYear();
    return `${this.getMonthName(mois)} ${annee}`;
  }

  get tempTotal(): number {
    return this.patientLignes.reduce((sum, pl) => sum + (pl.quantite * pl.prixUnitaire), 0);
  }

  get currentStatut(): StatutFacture {
    return this.currentFacture?.statut ?? StatutFacture.BROUILLON;
  }

  get canSendFacture(): boolean {
    return (this.currentFacture?.lignes?.length || 0) > 0 && this.currentStatut === StatutFacture.BROUILLON;
  }

  // === Résumé du mois (pharmacien) — calculé depuis la facture courante ===
  get nbLignesMois(): number {
    return this.currentFacture?.lignes?.length || 0;
  }
  /** Nombre de patients distincts facturés ce mois (matricule, sinon nom). */
  get nbPatientsMois(): number {
    const lignes = this.currentFacture?.lignes || [];
    const ids = new Set(
      lignes
        .map(l => (l.patientMatricule || l.patientNomPrenom || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return ids.size;
  }
  get montantMois(): number {
    return this.currentFacture?.montantTotal || 0;
  }
  get partCsuMois(): number {
    return Math.round(this.montantMois / 2);
  }
  get pharmacieNom(): string {
    return this.currentFacture?.pharmacieNom || 'Ma pharmacie';
  }
}
