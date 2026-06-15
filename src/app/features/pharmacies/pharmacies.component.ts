import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie, PharmacieImportResult } from '../../core/models/pharmacie.model';
import { RegionService, Region } from '../../core/services/region.service';
import { AuthService } from '../../core/services/auth.service';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfirmService } from '../../core/services/confirm.service';

@Component({
  selector: 'app-pharmacies',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatTableModule, MatPaginatorModule,
    MatSortModule, MatIconModule, MatCardModule,
    MatInputModule, MatSelectModule, MatSnackBarModule
  ],
  templateUrl: './pharmacies.component.html',
  styleUrls: ['./pharmacies.component.css']
})
export class PharmaciesComponent implements OnInit {
  displayedColumns: string[] = ['nom', 'adresse', 'telephone', 'regionId', 'actions'];
  dataSource: MatTableDataSource<Pharmacie> = new MatTableDataSource<Pharmacie>([]);
  pharmacies: Pharmacie[] = [];
  regions: Region[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  pharmacieForm!: FormGroup;
  editMode = false;
  currentId: string | null = null;
  showModal = false;
  hidePassword = true;

  // Import Excel
  importing = false;
  importResult: PharmacieImportResult | null = null;

  // Un Service Régional est restreint à sa propre région (l'Admin garde le choix libre)
  isRegional = false;
  private userRegionId: string | null = null;

  constructor(
    private pharmacieService: PharmacieService,
    private regionService: RegionService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    private authService: AuthService
  ) {
    this.isRegional = this.authService.isServiceRegional();
    this.userRegionId = this.authService.getCurrentUser()?.regionId ?? null;
    this.pharmacieForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required],
      adresse: ['', Validators.required],
      telephone: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      regionId: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    this.loadRegions();
    this.loadPharmacies();
  }

  /** Page courante pour la vue cartes mobile (suit le paginator). */
  get pagedPharmacies(): Pharmacie[] {
    const data = this.dataSource?.filteredData ?? [];
    if (!this.paginator) return data;
    const start = this.paginator.pageIndex * this.paginator.pageSize;
    return data.slice(start, start + this.paginator.pageSize);
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  loadRegions() {
    this.regionService.getAll().subscribe(data => this.regions = data);
  }

  loadPharmacies() {
    this.pharmacieService.getAll().subscribe(data => {
      this.pharmacies = data;
      this.dataSource.data = this.pharmacies;
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  getRegionName(id: string): string {
    const r = this.regions.find(x => x.id === id);
    return r ? r.nom : id;
  }

  openModal(pharmacie?: Pharmacie) {
    this.editMode = !!pharmacie;
    this.currentId = pharmacie ? pharmacie.id : null;
    this.hidePassword = true;

    if (pharmacie) {
      this.pharmacieForm.patchValue({
        code: pharmacie.code,
        nom: pharmacie.nom,
        adresse: pharmacie.adresse,
        telephone: pharmacie.telephone,
        email: pharmacie.email,
        regionId: pharmacie.regionId,
        password: ''
      });
      this.pharmacieForm.get('password')?.setValidators([]);
    } else {
      this.pharmacieForm.reset();
      this.pharmacieForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    }
    this.pharmacieForm.get('password')?.updateValueAndValidity();

    // Le Service Régional ne peut créer/modifier que dans sa propre région : champ verrouillé
    const regionCtrl = this.pharmacieForm.get('regionId');
    if (this.isRegional && this.userRegionId) {
      regionCtrl?.setValue(this.userRegionId);
      regionCtrl?.disable();
    } else {
      regionCtrl?.enable();
    }

    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  savePharmacie() {
    if (this.pharmacieForm.invalid) return;

    // getRawValue() inclut le champ région même lorsqu'il est verrouillé (disabled)
    const req = this.pharmacieForm.getRawValue();
    const obs$ = this.editMode && this.currentId
      ? this.pharmacieService.update(this.currentId, req)
      : this.pharmacieService.create(req);

    obs$.subscribe({
      next: () => {
        this.snackBar.open(`Pharmacie ${this.editMode ? 'modifiée' : 'ajoutée'} avec succès`, 'Fermer', { duration: 3000 });
        this.closeModal();
        this.loadPharmacies();
      },
      error: (err) => {
        const errorMsg = err.error?.message || 'Erreur lors de la sauvegarde';
        this.snackBar.open(errorMsg, 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  deletePharmacie(id: string) {
    this.confirm.ask({
      title: 'Supprimer la pharmacie',
      message: 'Êtes-vous sûr de vouloir supprimer cette pharmacie ? Cette action est irréversible.',
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.pharmacieService.delete(id).subscribe(() => {
        this.snackBar.open('Pharmacie supprimée', 'Fermer', { duration: 3000 });
        this.loadPharmacies();
      });
    });
  }

  /** Génère un mot de passe aléatoire et le place dans le formulaire (visible). */
  generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.pharmacieForm.get('password')?.setValue(pwd);
    this.hidePassword = false;
  }

  /** Télécharge le fichier Excel modèle pour l'import. */
  downloadModele() {
    this.pharmacieService.downloadTemplate().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modele_import_pharmacies.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.snackBar.open('Impossible de télécharger le modèle.', 'Fermer', { duration: 4000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Importe les pharmacies depuis le fichier Excel sélectionné. */
  onImportFileSelected(event: any) {
    const file: File = event.target.files?.[0];
    if (!file) return;

    this.importing = true;
    this.importResult = null;
    this.pharmacieService.importPharmacies(file).subscribe({
      next: (result) => {
        this.importing = false;
        this.importResult = result;
        const msg = result.echecs > 0
          ? `${result.importes} importée(s), ${result.echecs} échec(s)`
          : `${result.importes} pharmacie(s) importée(s) avec succès`;
        this.snackBar.open(msg, 'Fermer', { duration: 4000 });
        this.loadPharmacies();
        event.target.value = ''; // permet de réimporter le même fichier
      },
      error: (err) => {
        this.importing = false;
        let errorMsg = 'Erreur lors de l\'import.';
        if (err.error?.message) errorMsg = err.error.message;
        else if (err.status === 403) errorMsg = 'Accès refusé. Seul un Service Régional (ou l\'Admin) peut importer des pharmacies.';
        else if (err.status === 0) errorMsg = 'Impossible de contacter le serveur. Vérifiez que le backend est démarré.';
        this.snackBar.open(errorMsg, 'Fermer', { duration: 8000, panelClass: 'error-snackbar' });
        event.target.value = '';
      }
    });
  }
}
