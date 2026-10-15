import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FeuilleSoinsService } from '../../core/services/feuille-soins.service';
import { PatientService } from '../../core/services/patient.service';
import { BcsuService } from '../../core/services/bcsu.service';
import { Patient, Regime, REGIME_LABELS, REGIME_OPTIONS, StatutLettreGarantie } from '../../core/models/bcsu.model';
import { FeuilleSoinsRequest } from '../../core/models/feuille-soins.model';

/**
 * Délivrance d'une feuille de soins par l'agent bureau (BCSU) :
 * recherche du patient, informations du formulaire papier (régime, code assuré,
 * sexe, âge, accompagnant), rattachement facultatif à une lettre de
 * garantie. La prise en charge sera remplie par la structure sanitaire.
 */
@Component({
  selector: 'app-feuille-soins-form',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, RouterModule, MatCardModule,
    MatInputModule, MatButtonModule, MatIconModule, MatSelectModule, MatSnackBarModule
  ],
  templateUrl: './feuille-soins-form.component.html'
})
export class FeuilleSoinsFormComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;

  form!: FormGroup;
  selectedPatientId: string | null = null;

  searchQuery = '';
  searchResults: Patient[] = [];
  searching = false;

  isSubmitting = false;

  constructor(
    private fb: FormBuilder,
    private feuilleService: FeuilleSoinsService,
    private patientService: PatientService,
    private bcsuService: BcsuService,
    private route: ActivatedRoute,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      regime: [Regime.CONTRIBUTIF, Validators.required],
      telephone: [''],
      codeAssure: [''],
      sexe: [''],
      age: [null],
      accompagnantPrenomNom: [''],
      lettreGarantieNumero: ['']
    });
  }

  ngOnInit() {
    // Arrivée depuis le dossier patient : préremplissage complet.
    const patientId = this.route.snapshot.queryParamMap.get('patientId');
    if (patientId) {
      this.patientService.getDossierCsu(patientId).subscribe({
        next: (dossier) => {
          this.appliquerPatient(dossier.patient);
          // Suggère la lettre de garantie émise la plus récente.
          const lettreEmise = [...dossier.lettresGarantie]
            .filter(l => l.statut === StatutLettreGarantie.EMISE)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
          if (lettreEmise) {
            this.form.patchValue({ lettreGarantieNumero: lettreEmise.numero });
          }
        },
        error: () => this.snackBar.open('Impossible de charger le patient', 'Fermer', { duration: 3000 })
      });
    }
  }

  private appliquerPatient(patient: Patient) {
    this.selectedPatientId = patient.id || null;
    this.searchQuery = `${patient.prenom} ${patient.nom}`;
    this.form.patchValue({
      nom: patient.nom,
      prenom: patient.prenom,
      regime: patient.regime,
      telephone: patient.telephone || '',
      codeAssure: patient.numeroAssure || patient.numeroCni || '',
      // Récupère le sexe et l'âge saisis à la création du patient (lettre de garantie).
      sexe: patient.sexe || '',
      age: this.ageFromDateNaissance(patient.dateNaissance)
    });
  }

  /** Âge en années révolues, calculé depuis la date de naissance (yyyy-MM-dd ou [yyyy, mm, dd]). */
  private ageFromDateNaissance(dateNaissance?: any): number | null {
    if (!dateNaissance) return null;
    let birth: Date;
    if (Array.isArray(dateNaissance)) {
      birth = new Date(dateNaissance[0], dateNaissance[1] - 1, dateNaissance[2]);
    } else {
      birth = new Date(dateNaissance);
    }
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age >= 0 ? age : null;
  }

  // ----- Recherche patient -----
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
    this.appliquerPatient(patient);
    this.searchResults = [];
  }

  clearPatient() {
    this.selectedPatientId = null;
    this.searchQuery = '';
    this.form.reset({ regime: Regime.CONTRIBUTIF });
  }

  delivrer() {
    if (this.form.invalid || this.isSubmitting) return;
    const v = this.form.value;
    const req: FeuilleSoinsRequest = {
      patientId: this.selectedPatientId || undefined,
      lettreGarantieNumero: v.lettreGarantieNumero || undefined,
      nom: v.nom,
      prenom: v.prenom,
      regime: v.regime,
      telephone: v.telephone || undefined,
      codeAssure: v.codeAssure || undefined,
      sexe: v.sexe || undefined,
      age: v.age != null && v.age !== '' ? Number(v.age) : undefined,
      accompagnantPrenomNom: v.accompagnantPrenomNom || undefined
    };
    this.isSubmitting = true;
    this.feuilleService.delivrer(req).subscribe({
      next: (feuille) => {
        this.isSubmitting = false;
        this.snackBar.open('Feuille de soins délivrée : ' + feuille.numero, 'Fermer', { duration: 4000 });
        this.router.navigate(['/dashboard/feuilles-soins', feuille.id], { queryParams: { imprimer: 1 } });
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }
}
