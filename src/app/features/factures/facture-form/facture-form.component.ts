import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  templateUrl: './facture-form.component.html',
  styleUrls: ['./facture-form.component.css']
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
