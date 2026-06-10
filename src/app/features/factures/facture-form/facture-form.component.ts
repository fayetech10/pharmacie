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

        <hr class="divider">

        <!-- Saisie des Médicaments -->
        <form [formGroup]="medicamentForm" (ngSubmit)="ajouterMedicamentLigne()" class="form-row-multi mt-3">
          <mat-form-field appearance="outline" class="flex-2">
            <mat-label>Médicament</mat-label>
            <input type="text" matInput formControlName="medicament" [matAutocomplete]="auto" (input)="onMedicamentInput($event)">
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
            <mat-label>Code Produit</mat-label>
            <input matInput formControlName="codeProduit" readonly>
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

        <!-- Liste temporaire des médicaments préparés pour le patient -->
        <div *ngIf="patientLignes.length > 0" class="mt-4 patient-temp-list">
          <h3 class="mb-2">Médicaments préparés pour ce patient</h3>
          <table class="temp-table">
            <thead>
              <tr>
                <th>Médicament</th>
                <th>Code</th>
                <th>Qté</th>
                <th>Prix Unit.</th>
                <th>Total</th>
                <th style="width: 80px;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let pl of patientLignes; let i = index">
                <td>{{ pl.medicament }}</td>
                <td>{{ pl.codeProduit }}</td>
                <td>{{ pl.quantite }}</td>
                <td>{{ pl.prixUnitaire | number }}</td>
                <td><strong>{{ pl.quantite * pl.prixUnitaire | number }}</strong></td>
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
    .commit-section { display: flex; justify-content: flex-end; }
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
            this.snackBar.open("Attention: Le médicament saisi n'est pas éligible et ne peut être facturé.", 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
          } else {
            this.medicamentForm.get('medicament')?.setErrors(null);
          }
        } else {
          // Si pas de match exact, on vide le codeProduit et on force une erreur
          this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
          this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
        }
      });
    } else {
      this.suggestions = [];
      this.medicamentForm.patchValue({ codeProduit: '' }, { emitEvent: false });
      this.medicamentForm.get('medicament')?.setErrors({ notFound: true });
    }
  }

  onMedicamentSelected(event: any) {
    const nom = event.option.value;
    const med = this.suggestions.find(m => m.nom === nom);
    if (med) {
      this.medicamentForm.patchValue({ codeProduit: med.code });
      if (med.statut === StatutMedicament.EXCLU) {
        this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
        this.snackBar.open("Attention: Ce médicament n'est pas éligible.", 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      } else {
        this.medicamentForm.get('medicament')?.setErrors(null);
      }
    }
  }

  ajouterMedicamentLigne() {
    if (this.medicamentForm.invalid) return;

    const val = this.medicamentForm.value;
    this.patientLignes.push({
      medicament: val.medicament,
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });

    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.suggestions = [];
    this.snackBar.open('Médicament préparé pour le patient', 'Fermer', { duration: 2000 });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
  }

  enregistrerPatientFacture() {
    if (this.patientForm.invalid || this.patientLignes.length === 0) return;

    this.isSubmitting = true;
    const patientVal = this.patientForm.value;

    const nouvellesLignes = this.patientLignes.map(pl => ({
      ...pl,
      patientNomPrenom: patientVal.patientNomPrenom,
      patientMatricule: patientVal.patientMatricule
    }));

    if (!this.isEditMode) {
      // Saisie rapide pour le mois en cours
      this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
        next: (res) => {
          this.facture = res;
          this.patientForm.reset();
          this.patientLignes = [];
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
