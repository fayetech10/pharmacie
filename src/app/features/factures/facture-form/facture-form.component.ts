import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { FactureService } from '../../../core/services/facture.service';
import { Facture, FactureRequest } from '../../../core/models/facture.model';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTableModule } from '@angular/material/table';
import { MedicamentService } from '../../../core/services/medicament.service';
import { Medicament, StatutMedicament } from '../../../core/models/medicament.model';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmService } from '../../../core/services/confirm.service';
import { compressImageToDataUrl } from '../../../core/utils/image-compression';

type PhotoKey = 'ticketCaisse' | 'bonCommande' | 'ordonnance';

@Component({
  selector: 'app-facture-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatInputModule, 
    MatButtonModule, MatIconModule, MatSnackBarModule, MatAutocompleteModule,
    MatTableModule, MatTooltipModule, RouterModule
  ],
  template: `
    <div class="page-header flex-header">
      <div>
        <h1>{{ facture ? ('Facture de ' + getMonthName(facture.mois) + ' ' + facture.annee) : 'Saisie Rapide de Facture' }}</h1>
        <p>Saisissez les informations du patient et ses médicaments, puis ajoutez-les à la facture du mois.</p>
      </div>
      <button mat-flat-button color="primary" *ngIf="facture && facture.lignes && facture.lignes.length > 0" (click)="envoyerFacture()">
        <mat-icon>send</mat-icon> Envoyer la facture
      </button>
    </div>

    <!-- Étape 1 : Saisie par Patient -->
    <mat-card class="mb-4">
      <mat-card-header>
        <mat-card-title>Saisie par Patient</mat-card-title>
      </mat-card-header>
      <mat-card-content class="mt-3">
        <!-- Informations du Patient -->
        <form [formGroup]="patientForm" class="form-row-multi mb-3">
          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>Nom & Prénom du Patient</mat-label>
            <input matInput formControlName="patientNomPrenom" placeholder="Ex: Diop Ousmane">
          </mat-form-field>
          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>Numéro Matricule</mat-label>
            <input matInput formControlName="patientMatricule" placeholder="Ex: PAT-2026-987">
          </mat-form-field>
        </form>

        <!-- Dossier du patient : prise de photo des pièces justificatives -->
        <div class="dossier-section">
          <h3 class="dossier-title"><mat-icon>folder_open</mat-icon> Dossier du patient</h3>
          <p class="dossier-hint">Prenez en photo les pièces justificatives (appareil photo ou fichier).</p>
          <div class="photo-grid">
            <div class="photo-slot" *ngFor="let p of photoFields">
              <span class="photo-label">{{ p.label }}</span>
              <div class="photo-drop" *ngIf="!photos[p.key]; else preview">
                <input type="file" accept="image/*" capture="environment" hidden
                       #photoInput (change)="onPhotoSelected(p.key, $event)">
                <button type="button" class="photo-btn" (click)="photoInput.click()">
                  <mat-icon>photo_camera</mat-icon>
                  <span>Prendre une photo</span>
                </button>
              </div>
              <ng-template #preview>
                <div class="photo-preview">
                  <img [src]="photos[p.key]" [alt]="p.label" (click)="openViewer(photos[p.key]!)">
                  <button type="button" class="photo-remove" (click)="removePhoto(p.key)" matTooltip="Supprimer">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              </ng-template>
            </div>
          </div>
        </div>

        <hr class="divider">

        <!-- Saisie des Médicaments -->
        <form [formGroup]="medicamentForm" (ngSubmit)="ajouterMedicamentLigne()" class="form-row-multi mt-3">
          <mat-form-field appearance="outline" class="flex-2">
            <mat-label>Médicament</mat-label>
            <input type="text" matInput formControlName="medicament" [matAutocomplete]="auto" (input)="onMedicamentInput($event)" style="text-transform: uppercase;">
            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onMedicamentSelected($event)">
              <mat-option *ngFor="let med of suggestions" [value]="med.nom">
                {{ med.nom }} <span *ngIf="med.statut === 'EXCLU'" class="text-warn">(Non Éligible)</span>
              </mat-option>
            </mat-autocomplete>
            <mat-error *ngIf="medicamentForm.get('medicament')?.hasError('exclu')">
              Ce médicament n'est pas éligible.
            </mat-error>
            <mat-error *ngIf="medicamentForm.get('medicament')?.hasError('notFound')">
              Sélectionnez un médicament de la liste.
            </mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Quantité</mat-label>
            <input matInput type="number" formControlName="quantite">
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Prix Unit.</mat-label>
            <input matInput type="number" formControlName="prixUnitaire">
          </mat-form-field>

          <button mat-stroked-button color="primary" type="submit" [disabled]="medicamentForm.invalid" class="add-btn">
            <mat-icon>add</mat-icon> Préparer
          </button>
        </form>

        <!-- Alerte médicament exclu : motif + description -->
        <div class="exclu-alert" *ngIf="excludedInfo">
          <mat-icon>block</mat-icon>
          <div class="exclu-body">
            <span class="exclu-title">« {{ excludedInfo.nom }} » est exclu de la couverture CSU</span>
            <span class="exclu-line"><strong>Motif :</strong> {{ excludedInfo.motif || 'Non précisé' }}</span>
            <span class="exclu-line" *ngIf="excludedInfo.description"><strong>Description :</strong> {{ excludedInfo.description }}</span>
          </div>
        </div>

        <!-- Liste temporaire des médicaments préparés pour le patient -->
        <div *ngIf="patientLignes.length > 0" class="mt-4 patient-temp-list">
          <h3 class="mb-2">Médicaments préparés pour ce patient</h3>
          <table class="temp-table">
            <thead>
              <tr>
                <th>Médicament</th>
                <th>Qté</th>
                <th>Prix Unit.</th>
                <th>Total</th>
                <th>Part CSU (50%)</th>
                <th>Part bénéf. (50%)</th>
                <th style="width: 80px;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let pl of patientLignes; let i = index">
                <td>{{ pl.medicament }}</td>
                <td>{{ pl.quantite }}</td>
                <td>{{ pl.prixUnitaire | number }}</td>
                <td><strong>{{ pl.quantite * pl.prixUnitaire | number }}</strong></td>
                <td class="part-csu">{{ (pl.quantite * pl.prixUnitaire) / 2 | number:'1.0-0':'fr' }}</td>
                <td class="part-benef">{{ (pl.quantite * pl.prixUnitaire) / 2 | number:'1.0-0':'fr' }}</td>
                <td>
                  <button mat-icon-button color="warn" type="button" (click)="retirerMedicamentTemp(i)">
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div class="commit-section mt-3">
            <button mat-flat-button color="accent" [disabled]="patientForm.invalid || isSubmitting" (click)="enregistrerPatientFacture()">
              <mat-icon>save_alt</mat-icon> Enregistrer les médicaments pour ce patient
            </button>
          </div>
        </div>
      </mat-card-content>
    </mat-card>

    <!-- Lignes déjà enregistrées sur la facture (utile en correction) -->
    <mat-card class="mb-4" *ngIf="isEditMode && facture && facture.lignes && facture.lignes.length > 0">
      <mat-card-header>
        <mat-card-title>
          Lignes de la facture ({{ facture.lignes.length }})
        </mat-card-title>
      </mat-card-header>
      <mat-card-content class="mt-3">
        <div class="correction-hint" *ngIf="facture.statut === 'REJETEE_SR' || facture.statut === 'REJETEE_NC'">
          <mat-icon>build</mat-icon>
          Corrigez les lignes rejetées (supprimez-les puis ressaisissez-les correctement ci-dessus), puis cliquez sur « Envoyer la facture ».
        </div>
        <table class="temp-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Médicament</th>
              <th>Qté</th>
              <th>Prix Unit.</th>
              <th>Total</th>
              <th>Statut</th>
              <th style="width: 80px;">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let l of facture.lignes; let i = index" [class.row-rejected]="l.statutLigne === 'REJETEE'">
              <td>{{ l.patientNomPrenom || '-' }}</td>
              <td>{{ l.medicament }}</td>
              <td>{{ l.quantite }}</td>
              <td>{{ l.prixUnitaire | number }}</td>
              <td><strong>{{ l.montant | number }}</strong></td>
              <td>
                <span class="ligne-tag tag-ko" *ngIf="l.statutLigne === 'REJETEE'" [matTooltip]="l.motifRejet || ''">
                  Rejetée
                </span>
                <span class="ligne-tag tag-ok" *ngIf="l.statutLigne === 'ACCEPTEE'">Acceptée</span>
              </td>
              <td>
                <button mat-icon-button color="warn" type="button" (click)="supprimerLigne(i)" matTooltip="Supprimer cette ligne">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </mat-card-content>
    </mat-card>

    <!-- Visionneuse plein écran d'une pièce justificative -->
    <div class="img-viewer" *ngIf="viewerImage" (click)="viewerImage = null">
      <button type="button" class="viewer-close"><mat-icon>close</mat-icon></button>
      <img [src]="viewerImage" alt="Pièce justificative" (click)="$event.stopPropagation()">
    </div>
  `,
  styles: [`
    .mb-2 { margin-bottom: 8px; }
    .mb-3 { margin-bottom: 16px; }
    .mb-4 { margin-bottom: 24px; }
    .mt-3 { margin-top: 16px; }
    .mt-4 { margin-top: 24px; }
    .flex-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
    .form-row-multi { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
    .flex-1 { flex: 1; min-width: 200px; }
    .flex-2 { flex: 2; min-width: 240px; }
    mat-form-field { flex: 1; min-width: 120px; }
    .add-btn { height: 56px; margin-top: 4px; }
    .total-display { display: flex; align-items: center; gap: 8px; font-size: 18px; }
    .total-display strong { color: var(--primary); font-size: 24px; }
    .w-100 { width: 100%; }
    th.mat-header-cell { font-weight: 600; color: var(--text-secondary); background: #F8FAFC; }
    .text-warn { color: #f44336; font-weight: bold; margin-left: 8px; }
    
    .divider { border: 0; border-top: 1px solid var(--border); margin: 20px 0; }
    .patient-temp-list { background: #F8FAFC; padding: 16px; border-radius: 8px; border: 1px solid var(--border); }
    .temp-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    .temp-table th { text-align: left; padding: 8px; border-bottom: 2px solid var(--border); color: var(--text-secondary); font-size: 13px; }
    .temp-table td { padding: 8px; border-bottom: 1px solid var(--border); font-size: 14px; }
    .temp-table td.part-csu { color: var(--primary); font-weight: 600; }
    .temp-table td.part-benef { color: var(--accent); font-weight: 600; }
    .exclu-alert { display: flex; gap: 12px; align-items: flex-start; margin-top: 16px; padding: 14px 16px; background: var(--warn-light); border: 1px solid #FCA5A5; border-radius: 8px; }
    .exclu-alert > mat-icon { color: var(--warn); flex-shrink: 0; }
    .exclu-body { display: flex; flex-direction: column; gap: 3px; }
    .exclu-title { font-weight: 700; color: #B91C1C; font-size: 14px; }
    .exclu-line { font-size: 13px; color: var(--text-primary); }
    .exclu-line strong { color: var(--text-secondary); }
    .commit-section { display: flex; justify-content: flex-end; }
    .row-rejected td { background: #FEF2F2; }
    .ligne-tag { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; cursor: default; }
    .ligne-tag.tag-ok { background: #DCFCE7; color: #15803D; }
    .ligne-tag.tag-ko { background: #FEE2E2; color: #B91C1C; }
    .correction-hint { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 12px 16px; background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 8px; color: #9A3412; font-size: 14px; }
    .correction-hint mat-icon { color: #EA580C; }

    /* Dossier patient : pièces justificatives */
    .dossier-section { margin-top: 8px; }
    .dossier-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; margin: 0 0 4px; }
    .dossier-title mat-icon { color: var(--primary); }
    .dossier-hint { margin: 0 0 12px; font-size: 13px; color: var(--text-secondary); }
    .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .photo-slot { display: flex; flex-direction: column; gap: 6px; }
    .photo-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
    .photo-drop { border: 1.5px dashed var(--border); border-radius: 10px; background: #F8FAFC; transition: border-color 0.2s ease, background 0.2s ease; }
    .photo-drop:hover { border-color: var(--primary); background: var(--primary-light); }
    .photo-btn { width: 100%; height: 96px; border: none; background: transparent; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-secondary); font-size: 13px; font-weight: 500; }
    .photo-btn mat-icon { font-size: 26px; width: 26px; height: 26px; color: var(--primary); }
    .photo-preview { position: relative; height: 96px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
    .photo-preview img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; display: block; }
    .photo-remove { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: none; background: rgba(17,24,39,0.65); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .photo-remove mat-icon { font-size: 16px; width: 16px; height: 16px; }
    @media (max-width: 600px) { .photo-grid { grid-template-columns: 1fr; } }

    /* Visionneuse plein écran */
    .img-viewer { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .img-viewer img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
    .viewer-close { position: absolute; top: 18px; right: 18px; width: 44px; height: 44px; border-radius: 50%; border: none; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  `]
})
export class FactureFormComponent implements OnInit {
  patientForm!: FormGroup;
  medicamentForm!: FormGroup;
  patientLignes: any[] = [];
  facture: Facture | null = null;
  isEditMode = false;
  isSubmitting = false;
  suggestions: Medicament[] = [];
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
    private fb: FormBuilder,
    private factureService: FactureService,
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
      prixUnitaire: [0, [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit() {
    // Précharge le cache des médicaments pour une autocomplétion instantanée
    this.medicamentService.getAllCached().subscribe();
    this.route.paramMap.subscribe(params => {
      if (params.has('id')) {
        this.isEditMode = true;
        this.loadSpecificFacture(params.get('id')!);
      } else {
        this.isEditMode = false;
        this.loadCurrentFacture();
      }
    });
  }

  loadCurrentFacture() {
    this.factureService.getCurrent().subscribe(res => {
      this.facture = res;
    });
  }

  loadSpecificFacture(id: string) {
    this.factureService.getById(id).subscribe(res => {
      this.facture = res;
    });
  }

  onMedicamentInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    if (query.length >= 2) {
      this.medicamentService.search(query).subscribe(res => {
        this.suggestions = res;
        
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
      this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
      this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
      this.excludedInfo = null;
    }
  }

  onMedicamentSelected(event: any) {
    const nom = event.option.value;
    const med = this.suggestions.find(m => m.nom === nom);
    if (med) {
      this.medicamentForm.patchValue({ codeProduit: med.code });
      if (med.statut === StatutMedicament.EXCLU) {
        this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
        this.excludedInfo = { nom: med.nom, motif: med.motif, description: med.description };
        this.snackBar.open("Attention: Ce médicament n'est pas éligible.", 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      } else {
        this.medicamentForm.get('medicament')?.setErrors(null);
        this.excludedInfo = null;
      }
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
    this.snackBar.open('Médicament préparé pour le patient', 'Fermer', { duration: 2000 });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
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

    if (!this.isEditMode) {
      // Saisie rapide pour le mois en cours
      this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
        next: (res) => {
          this.facture = res;
          this.patientForm.reset();
          this.patientLignes = [];
          this.resetPhotos();
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
        if (clearForm) {
          this.patientForm.reset();
          this.patientLignes = [];
          this.resetPhotos();
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
          this.router.navigate(['/dashboard/factures']);
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
