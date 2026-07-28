import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MedicamentService } from '../../core/services/medicament.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Medicament, StatutMedicament } from '../../core/models/medicament.model';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';

@Component({
  selector: 'app-medicaments',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTableModule, MatPaginatorModule, MatSortModule,
    MatButtonModule, MatIconModule, MatCardModule, MatInputModule, MatSelectModule,
    MatFormFieldModule, MatSnackBarModule, MatMenuModule
  ],
  templateUrl: './medicaments.component.html'
})
export class MedicamentsComponent implements OnInit {
  displayedColumns: string[] = ['nom', 'dci', 'classeTherapeutique', 'liste', 'prixReference', 'statut', 'motif', 'actions'];
  dataSource!: MatTableDataSource<Medicament>;
  medicaments: Medicament[] = [];

  /** Référentiel affiché : tous, éligibles ou exclusions. */
  filtreStatut: '' | 'ELIGIBLE' | 'EXCLU' = '';
  private rechercheTexte = '';

  /** Formulaire d'ajout / modification d'un médicament du référentiel. */
  modalOuverte = false;
  medicamentEnEdition: Medicament | null = null;
  form!: FormGroup;
  readonly statuts = [StatutMedicament.ELIGIBLE, StatutMedicament.EXCLU];

  /** Médicaments non répertoriés (ajoutés par des pharmaciens), à classer par la SEN-CSU. */
  nonRepertories: Medicament[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private medicamentService: MedicamentService,
    private confirm: ConfirmService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.form = this.fb.group({
      nom: ['', Validators.required],
      dci: [''],
      classeTherapeutique: [''],
      liste: [''],
      prixReference: [null],
      statut: [StatutMedicament.ELIGIBLE, Validators.required],
      motif: ['']
    });
    this.loadMedicaments();
    this.loadNonRepertories();
  }

  // ----- Référentiels : éligibles / exclusions -----

  choisirReferentiel(statut: '' | 'ELIGIBLE' | 'EXCLU') {
    this.filtreStatut = statut;
    this.appliquerFiltres();
  }

  /**
   * Le filterPredicate de MatTable combine la recherche texte ET le référentiel choisi :
   * `filter` doit changer de valeur pour que la table se rafraîchisse, d'où la clé composite.
   */
  private appliquerFiltres() {
    if (!this.dataSource) return;
    this.dataSource.filterPredicate = (m: Medicament, _filtre: string) => {
      if (this.filtreStatut && String(m.statut) !== this.filtreStatut) return false;
      if (!this.rechercheTexte) return true;
      const t = this.rechercheTexte;
      return (m.nom || '').toLowerCase().includes(t)
        || (m.dci || '').toLowerCase().includes(t)
        || (m.classeTherapeutique || '').toLowerCase().includes(t);
    };
    this.dataSource.filter = `${this.filtreStatut}|${this.rechercheTexte}`;
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  // ----- Création / modification / suppression -----

  ouvrirCreation() {
    this.medicamentEnEdition = null;
    this.form.reset({ statut: this.filtreStatut === 'EXCLU' ? StatutMedicament.EXCLU : StatutMedicament.ELIGIBLE });
    this.modalOuverte = true;
  }

  ouvrirEdition(med: Medicament) {
    this.medicamentEnEdition = med;
    this.form.reset({
      nom: med.nom,
      dci: med.dci || '',
      classeTherapeutique: med.classeTherapeutique || '',
      liste: med.liste || '',
      prixReference: med.prixReference ?? null,
      statut: med.statut,
      motif: med.motif || ''
    });
    this.modalOuverte = true;
  }

  fermerModal() {
    this.modalOuverte = false;
    this.medicamentEnEdition = null;
  }

  enregistrer() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const valeur = { ...this.form.value };
    const requete = this.medicamentEnEdition
      ? this.medicamentService.update(this.medicamentEnEdition.id, valeur)
      : this.medicamentService.create(valeur);

    requete.subscribe({
      next: () => {
        this.snackBar.open(this.medicamentEnEdition ? 'Médicament modifié' : 'Médicament ajouté au référentiel',
          'Fermer', { duration: 3000 });
        this.fermerModal();
        this.loadMedicaments();
      },
      error: (err) => this.snackBar.open(this.classementErreur(err), 'Fermer',
        { duration: 6000, panelClass: 'error-snackbar' })
    });
  }

  supprimer(med: Medicament) {
    this.confirm.ask({
      title: 'Supprimer ce médicament',
      message: `« ${med.nom} » sera retiré du référentiel. Cette action est irréversible.`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.medicamentService.delete(med.id).subscribe({
        next: () => {
          this.snackBar.open('Médicament supprimé', 'Fermer', { duration: 3000 });
          this.loadMedicaments();
        },
        error: (err) => this.snackBar.open(this.classementErreur(err), 'Fermer',
          { duration: 6000, panelClass: 'error-snackbar' })
      });
    });
  }

  loadNonRepertories() {
    this.medicamentService.getNonRepertories().subscribe({
      next: (data) => (this.nonRepertories = data),
      error: () => (this.nonRepertories = [])
    });
  }

  /** Intègre définitivement un médicament non répertorié dans la liste des éligibles. */
  classerEligible(med: Medicament) {
    this.medicamentService.classer(med.id, StatutMedicament.ELIGIBLE).subscribe({
      next: () => {
        this.snackBar.open(`« ${med.nom} » ajouté à la liste des médicaments éligibles.`, 'Fermer', { duration: 3500 });
        this.afterClassement(med.id);
      },
      error: (err) => this.snackBar.open(this.classementErreur(err), 'Fermer', { duration: 6000, panelClass: 'error-snackbar' })
    });
  }

  /** Exclut définitivement un médicament non répertorié (motif facultatif). */
  classerExclu(med: Medicament) {
    this.confirm.prompt({
      title: 'Exclure ce médicament',
      message: `« ${med.nom} » sera ajouté définitivement à la liste des exclusions et ne pourra plus être facturé.`,
      label: "Motif d'exclusion (facultatif)",
      placeholder: 'Ex : Classe thérapeutique exclue',
      confirmText: 'Exclure',
      multiline: true,
      required: false
    }).subscribe(motif => {
      if (motif === null) return; // annulé
      this.medicamentService.classer(med.id, StatutMedicament.EXCLU, motif || undefined).subscribe({
        next: () => {
          this.snackBar.open(`« ${med.nom} » ajouté à la liste des exclusions.`, 'Fermer', { duration: 3500 });
          this.afterClassement(med.id);
        },
        error: (err) => this.snackBar.open(this.classementErreur(err), 'Fermer', { duration: 6000, panelClass: 'error-snackbar' })
      });
    });
  }

  /** Retire l'élément classé de la liste et rafraîchit les compteurs éligibles / exclus. */
  private afterClassement(id: string) {
    this.nonRepertories = this.nonRepertories.filter(m => m.id !== id);
    this.loadMedicaments();
  }

  private classementErreur(err: any): string {
    if (err?.error?.message) return err.error.message;
    if (err?.status === 403) return "Accès refusé. Vous n'avez pas les droits pour classer un médicament.";
    if (err?.status === 0) return 'Impossible de contacter le serveur.';
    return 'Erreur lors du classement du médicament.';
  }

  /** Page courante pour la vue cartes mobile (suit le paginator). */
  get pagedMedicaments(): Medicament[] {
    const data = this.dataSource?.filteredData ?? [];
    if (!this.paginator) return data.slice(0, 10);
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    return data.slice(start, start + this.paginator.pageSize);
  }

  // ----- Synthèse -----
  get sumMeds(): number { return this.dataSource?.filteredData?.length ?? 0; }
  get sumEligibles(): number { return (this.dataSource?.filteredData ?? []).filter(m => String(m.statut) === 'ELIGIBLE').length; }
  get sumExclus(): number { return (this.dataSource?.filteredData ?? []).filter(m => String(m.statut) === 'EXCLU').length; }

  loadMedicaments() {
    this.medicamentService.getAll().subscribe(data => {
      this.medicaments = data;
      this.dataSource = new MatTableDataSource(this.medicaments);
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      this.appliquerFiltres();
    });
  }

  applyFilter(event: Event) {
    this.rechercheTexte = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.appliquerFiltres();
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.snackBar.open('Importation en cours...', '', { duration: 0 });
      this.medicamentService.importEligibles(file).subscribe({
        next: () => {
          this.snackBar.open('Import réussi ! Les médicaments éligibles ont été mis à jour.', 'Fermer', { duration: 3000 });
          this.loadMedicaments();
          this.loadNonRepertories();
          // Réinitialiser l'input file pour pouvoir réimporter le même fichier
          event.target.value = '';
        },
        error: (err: any) => {
          let errorMsg = 'Erreur lors de l\'importation.';
          if (err.error && err.error.message) {
            errorMsg = err.error.message;
          } else if (err.error && err.error.cause) {
            errorMsg = err.error.cause;
          } else if (err.status === 403) {
            errorMsg = 'Accès refusé. Vous n\'avez pas les droits pour effectuer cette action.';
          } else if (err.status === 0) {
            errorMsg = 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
          }
          this.snackBar.open(errorMsg, 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
          // Réinitialiser l'input file
          event.target.value = '';
        }
      });
    }
  }

  onExclusionFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.snackBar.open('Importation des exclusions en cours...', '', { duration: 0 });
      this.medicamentService.importExclusions(file).subscribe({
        next: () => {
          this.snackBar.open('Import réussi ! La liste des exclusions a été mise à jour.', 'Fermer', { duration: 3000 });
          this.loadMedicaments();
          this.loadNonRepertories();
          event.target.value = '';
        },
        error: (err: any) => {
          let errorMsg = 'Erreur lors de l\'importation des exclusions.';
          if (err.error && err.error.message) {
            errorMsg = err.error.message;
          } else if (err.error && err.error.cause) {
            errorMsg = err.error.cause;
          } else if (err.status === 403) {
            errorMsg = 'Accès refusé. Vous n\'avez pas les droits pour effectuer cette action.';
          } else if (err.status === 0) {
            errorMsg = 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
          }
          this.snackBar.open(errorMsg, 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
          event.target.value = '';
        }
      });
    }
  }
}
