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
  template: `
    <div class="fade-in">
      <!-- En-tête -->
      <div class="page-head">
        <div>
          <h1>Gestion des Pharmacies</h1>
          <p>Gérez les pharmacies partenaires de la CSU.</p>
        </div>
        <div class="page-head-actions">
          <button class="btn btn-ghost" (click)="downloadModele()" type="button" title="Télécharger le modèle Excel">
            <mat-icon>download</mat-icon> Modèle
          </button>
          <button class="btn btn-outline" (click)="importInput.click()" type="button" [disabled]="importing" title="Importer des pharmacies depuis un fichier Excel">
            <mat-icon>upload_file</mat-icon> {{ importing ? 'Import…' : 'Importer' }}
          </button>
          <input type="file" #importInput hidden (change)="onImportFileSelected($event)" accept=".xlsx, .xls">
          <button class="btn btn-primary" (click)="openModal()">
            <mat-icon>add_business</mat-icon> Ajouter
          </button>
        </div>
      </div>

      <!-- Recherche -->
      <div class="filter-strip">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input (keyup)="applyFilter($event)" placeholder="Rechercher par nom, code, adresse…">
        </div>
      </div>

      <!-- Récapitulatif du dernier import -->
      <div class="import-result" *ngIf="importResult" [class.has-errors]="importResult.echecs > 0">
        <div class="import-result-head">
          <mat-icon>{{ importResult.echecs > 0 ? 'warning_amber' : 'check_circle' }}</mat-icon>
          <span>
            <strong>{{ importResult.importes }}</strong> pharmacie(s) importée(s)
            <ng-container *ngIf="importResult.echecs > 0"> · <strong>{{ importResult.echecs }}</strong> échec(s)</ng-container>
          </span>
          <button class="close-inline" (click)="importResult = null" type="button" aria-label="Fermer">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <ul class="import-errors" *ngIf="importResult.erreurs.length > 0">
          <li *ngFor="let err of importResult.erreurs">{{ err }}</li>
        </ul>
      </div>

      <!-- Tableau (desktop) -->
      <mat-card class="table-card desktop-only">
        <table mat-table [dataSource]="dataSource" matSort class="w-100">
          <ng-container matColumnDef="nom">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Pharmacie </th>
            <td mat-cell *matCellDef="let p">
              <div class="pharma-cell">
                <div class="pharma-icon"><mat-icon>local_pharmacy</mat-icon></div>
                <div>
                  <span class="pharma-name">{{ p.nom }}</span>
                  <span class="pharma-code">{{ p.code }}</span>
                </div>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="adresse">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Adresse </th>
            <td mat-cell *matCellDef="let p"> {{ p.adresse }} </td>
          </ng-container>

          <ng-container matColumnDef="telephone">
            <th mat-header-cell *matHeaderCellDef> Contact </th>
            <td mat-cell *matCellDef="let p">
              <div class="contact-cell">
                <span>{{ p.telephone }}</span>
                <span class="text-muted">{{ p.email }}</span>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="regionId">
            <th mat-header-cell *matHeaderCellDef mat-sort-header> Région </th>
            <td mat-cell *matCellDef="let p">
              <span class="region-chip">{{ getRegionName(p.regionId) }}</span>
            </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let p">
              <div class="action-group">
                <button class="action-btn" (click)="openModal(p)" title="Modifier">
                  <mat-icon>edit</mat-icon>
                </button>
                <button class="action-btn danger" (click)="deletePharmacie(p.id)" title="Supprimer">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        <div class="empty-state" *ngIf="pharmacies.length === 0">
          <mat-icon>local_pharmacy</mat-icon>
          <p>Aucune pharmacie enregistrée</p>
        </div>
      </mat-card>

      <!-- Cartes (mobile) -->
      <div class="m-cards">
        <div class="m-card" *ngFor="let p of pagedPharmacies">
          <div class="m-card-top">
            <span class="m-title">{{ p.nom }}</span>
            <div class="m-actions">
              <button class="action-btn" (click)="openModal(p)" title="Modifier">
                <mat-icon>edit</mat-icon>
              </button>
              <button class="action-btn danger" (click)="deletePharmacie(p.id)" title="Supprimer">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
          <div class="m-sub">{{ p.code }}</div>
          <div class="m-meta"><mat-icon>location_on</mat-icon> {{ p.adresse }}</div>
          <div class="m-meta"><mat-icon>call</mat-icon> {{ p.telephone }}</div>
          <div class="m-meta" *ngIf="p.email"><mat-icon>mail</mat-icon> {{ p.email }}</div>
          <div class="m-foot">
            <span class="region-chip">{{ getRegionName(p.regionId) }}</span>
          </div>
        </div>
        <div class="empty-state" *ngIf="dataSource.filteredData.length === 0">
          <mat-icon>local_pharmacy</mat-icon>
          <p>Aucune pharmacie enregistrée</p>
        </div>
      </div>

      <mat-paginator [pageSizeOptions]="[10, 25, 50]" showFirstLastButtons aria-label="Pagination des pharmacies"></mat-paginator>
    </div>

    <!-- Modal -->
    <div class="modal-overlay" *ngIf="showModal">
      <div class="modal-card">
        <div class="modal-header">
          <h2>{{ editMode ? 'Modifier la' : 'Nouvelle' }} pharmacie</h2>
          <button class="close-btn" (click)="closeModal()" type="button">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <form [formGroup]="pharmacieForm" (ngSubmit)="savePharmacie()">
          <div class="modal-body">
            <!-- Section 1 : informations de la pharmacie -->
            <div class="form-section-title">
              <mat-icon>local_pharmacy</mat-icon> Informations de la pharmacie
            </div>
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Code</mat-label>
                <mat-icon matPrefix>tag</mat-icon>
                <input matInput formControlName="code" placeholder="Ex: PH001">
                <mat-error *ngIf="pharmacieForm.get('code')?.hasError('required')">Code obligatoire.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Région</mat-label>
                <mat-icon matPrefix>map</mat-icon>
                <mat-select formControlName="regionId">
                  <mat-option *ngFor="let r of regions" [value]="r.id">{{ r.nom }}</mat-option>
                </mat-select>
                <mat-hint *ngIf="isRegional">Limitée à votre région</mat-hint>
                <mat-error *ngIf="pharmacieForm.get('regionId')?.hasError('required')">Région obligatoire.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>Nom de la pharmacie</mat-label>
                <mat-icon matPrefix>storefront</mat-icon>
                <input matInput formControlName="nom" placeholder="Ex: Pharmacie Guigon">
                <mat-error *ngIf="pharmacieForm.get('nom')?.hasError('required')">Nom obligatoire.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>Adresse</mat-label>
                <mat-icon matPrefix>location_on</mat-icon>
                <input matInput formControlName="adresse" placeholder="Ex: Plateau, Dakar">
                <mat-error *ngIf="pharmacieForm.get('adresse')?.hasError('required')">Adresse obligatoire.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Téléphone</mat-label>
                <mat-icon matPrefix>call</mat-icon>
                <input matInput formControlName="telephone" placeholder="33 800 00 00">
                <mat-error *ngIf="pharmacieForm.get('telephone')?.hasError('required')">Téléphone obligatoire.</mat-error>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <mat-icon matPrefix>mail</mat-icon>
                <input matInput formControlName="email" placeholder="contact@pharma.sn">
                <mat-error *ngIf="pharmacieForm.get('email')?.hasError('required')">Email obligatoire.</mat-error>
                <mat-error *ngIf="pharmacieForm.get('email')?.hasError('email')">Email invalide.</mat-error>
              </mat-form-field>
            </div>

            <!-- Section 2 : compte de connexion du pharmacien -->
            <div class="form-section-title">
              <mat-icon>account_circle</mat-icon> Compte du pharmacien (connexion)
            </div>
            <p class="form-note">
              <mat-icon>info</mat-icon>
              L'email ci-dessus sert d'identifiant. Un compte Pharmacien est créé automatiquement avec ce mot de passe.
            </p>
            <div class="form-grid">
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>{{ editMode ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe du compte' }}</mat-label>
                <mat-icon matPrefix>lock</mat-icon>
                <input matInput [type]="hidePassword ? 'password' : 'text'" formControlName="password" placeholder="Min. 6 caractères">
                <button type="button" matSuffix class="suffix-btn" (click)="hidePassword = !hidePassword"
                        [attr.aria-label]="hidePassword ? 'Afficher' : 'Masquer'">
                  <mat-icon>{{ hidePassword ? 'visibility' : 'visibility_off' }}</mat-icon>
                </button>
                <mat-error *ngIf="pharmacieForm.get('password')?.hasError('required')">
                  Le mot de passe est obligatoire.
                </mat-error>
                <mat-error *ngIf="pharmacieForm.get('password')?.hasError('minlength')">
                  Au moins 6 caractères.
                </mat-error>
              </mat-form-field>
              <button type="button" class="btn btn-ghost span-2 generate-btn" (click)="generatePassword()">
                <mat-icon>autorenew</mat-icon> Générer un mot de passe
              </button>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" type="button" (click)="closeModal()">Annuler</button>
            <button class="btn btn-primary" type="submit" [disabled]="pharmacieForm.invalid">
              <mat-icon>{{ editMode ? 'save' : 'add_business' }}</mat-icon>
              {{ editMode ? 'Enregistrer' : 'Créer la pharmacie' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    /* Récapitulatif d'import */
    .import-result {
      margin-bottom: 20px; border-radius: var(--radius-md, 10px);
      border: 1px solid #BBF7D0; background: #F0FDF4; overflow: hidden;
    }
    .import-result.has-errors { border-color: #FED7AA; background: #FFFBEB; }
    .import-result-head {
      display: flex; align-items: center; gap: 10px; padding: 12px 16px;
      font-size: 14px; color: #166534; font-weight: 500;
    }
    .import-result.has-errors .import-result-head { color: #B45309; }
    .import-result-head mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .close-inline {
      margin-left: auto; background: transparent; border: none; cursor: pointer;
      color: inherit; display: flex; align-items: center; border-radius: 6px; padding: 2px;
    }
    .close-inline:hover { background: rgba(0,0,0,0.06); }
    .import-errors {
      margin: 0; padding: 4px 16px 14px 40px; list-style: disc;
      font-size: 13px; color: #92400E; max-height: 180px; overflow-y: auto;
    }
    .import-errors li { margin: 2px 0; }

    .text-muted { font-size: 12px; }

    /* Pharmacy cell */
    .pharma-cell { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
    .pharma-icon {
      width: 38px; height: 38px; border-radius: 10px;
      background: var(--accent-light); color: var(--accent);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .pharma-icon mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .pharma-name { font-weight: 600; color: var(--text-primary); display: block; }
    .pharma-code { font-size: 12px; color: var(--text-secondary); display: block; }

    .contact-cell { display: flex; flex-direction: column; }
    .contact-cell span:first-child { color: var(--text-primary); }

    .region-chip {
      display: inline-flex; padding: 4px 12px; border-radius: var(--radius-full);
      background: var(--primary-light); color: var(--primary);
      font-size: 12.5px; font-weight: 600;
    }

    .form-section-title {
      display: flex; align-items: center; gap: 8px;
      font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--primary); margin: 4px 0 14px;
    }
    .form-section-title:not(:first-child) {
      margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--border);
    }
    .form-section-title mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .form-note {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 0 0 14px; padding: 10px 12px; border-radius: 8px;
      background: var(--primary-light); color: var(--text-secondary); font-size: 12.5px; line-height: 1.4;
    }
    .form-note mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--primary); flex-shrink: 0; }
    .suffix-btn {
      background: transparent; border: none; cursor: pointer; color: var(--text-muted);
      display: inline-flex; align-items: center; padding: 0 4px;
    }
    .suffix-btn:hover { color: var(--text-primary); }
    .generate-btn { justify-content: center; margin-top: -4px; }
    mat-form-field mat-icon[matPrefix] { margin-right: 8px; color: var(--text-muted); }
  `]
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
