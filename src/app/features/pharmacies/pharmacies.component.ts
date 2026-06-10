import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
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
    <div class="page-fade">
      <!-- Header -->
      <div class="page-header-row">
        <div>
          <h1>Gestion des Pharmacies</h1>
          <p>Gérez les pharmacies partenaires de la CSU.</p>
        </div>
        <button class="btn btn-primary" (click)="openModal()">
          <mat-icon>add_business</mat-icon> Ajouter une pharmacie
        </button>
      </div>

      <!-- Table -->
      <mat-card class="table-card">
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
        <mat-paginator [pageSizeOptions]="[10, 25, 50]" *ngIf="pharmacies.length > 0"></mat-paginator>
      </mat-card>
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
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Code</mat-label>
                <input matInput formControlName="code" placeholder="Ex: PH001">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Région</mat-label>
                <mat-select formControlName="regionId">
                  <mat-option *ngFor="let r of regions" [value]="r.id">{{ r.nom }}</mat-option>
                </mat-select>
                <mat-hint *ngIf="isRegional">Limitée à votre région</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>Nom de la pharmacie</mat-label>
                <input matInput formControlName="nom" placeholder="Ex: Pharmacie Guigon">
              </mat-form-field>
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>Adresse</mat-label>
                <input matInput formControlName="adresse" placeholder="Ex: Plateau, Dakar">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Téléphone</mat-label>
                <input matInput formControlName="telephone" placeholder="33 800 00 00">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput formControlName="email" placeholder="contact@pharma.sn">
              </mat-form-field>
              <mat-form-field appearance="outline" class="span-2">
                <mat-label>{{ editMode ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe du compte' }}</mat-label>
                <input matInput type="password" formControlName="password" placeholder="Min. 6 caractères">
                <mat-error *ngIf="pharmacieForm.get('password')?.hasError('required')">
                  Le mot de passe est obligatoire.
                </mat-error>
                <mat-error *ngIf="pharmacieForm.get('password')?.hasError('minlength')">
                  Au moins 6 caractères.
                </mat-error>
              </mat-form-field>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" type="button" (click)="closeModal()">Annuler</button>
            <button class="btn btn-primary" type="submit" [disabled]="pharmacieForm.invalid">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .page-fade { animation: fadeIn 0.3s ease; }

    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .page-header-row h1 { font-size: 26px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.02em; }
    .page-header-row p { margin: 0; color: var(--text-secondary); font-size: 15px; }

    .table-card { padding: 0 !important; overflow: hidden; }
    .w-100 { width: 100%; }
    .text-muted { color: var(--text-muted); font-size: 12px; }

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

    /* Modal */
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(4px);
      z-index: 1000; display: flex; align-items: center; justify-content: center;
      padding: 16px; animation: fadeIn 0.2s ease;
    }
    .modal-card {
      width: 100%; max-width: 560px; background: #fff;
      border-radius: var(--radius-lg); border: 1px solid var(--border);
      box-shadow: var(--shadow-lg); overflow: hidden;
      max-height: 92vh; display: flex; flex-direction: column;
    }
    .modal-header {
      background: #F8FAFC; padding: 18px 24px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .modal-header h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); }
    .close-btn {
      background: transparent; border: none; cursor: pointer; color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center; border-radius: 8px;
      width: 34px; height: 34px;
    }
    .close-btn:hover { background: var(--border-light); color: var(--text-primary); }
    .modal-body { padding: 24px; overflow-y: auto; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
    .form-grid mat-form-field { width: 100%; }
    .span-2 { grid-column: span 2; }
    .modal-footer {
      padding: 16px 24px; border-top: 1px solid var(--border);
      display: flex; justify-content: flex-end; gap: 12px; background: #F8FAFC;
    }

    @media (max-width: 560px) {
      .form-grid { grid-template-columns: 1fr; }
      .span-2 { grid-column: span 1; }
    }
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
}
