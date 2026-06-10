import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { RegionService, Region } from '../../core/services/region.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { User, Role } from '../../core/models/user.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfirmService } from '../../core/services/confirm.service';

@Component({
  selector: 'app-utilisateurs',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  template: `
    <div class="users-page">
      <!-- Header -->
      <div class="page-header-row">
        <div>
          <h1>Gestion des Utilisateurs</h1>
          <p>Créez et gérez les comptes des pharmaciens et des services régionaux/centraux</p>
        </div>
        <button class="btn btn-primary" (click)="openAddModal()">
          <mat-icon>person_add</mat-icon> Ajouter un utilisateur
        </button>
      </div>

      <!-- Users Table -->
      <mat-card class="table-card">
        <table mat-table [dataSource]="users" class="w-100">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef> Utilisateur </th>
            <td mat-cell *matCellDef="let u">
              <div class="user-cell">
                <div class="user-avatar">
                  {{ u.prenom?.charAt(0) }}{{ u.nom?.charAt(0) }}
                </div>
                <div>
                  <span class="user-name">{{ u.prenom }} {{ u.nom }}</span>
                  <span class="user-email">{{ u.email }}</span>
                </div>
              </div>
            </td>
          </ng-container>

          <ng-container matColumnDef="role">
            <th mat-header-cell *matHeaderCellDef> Rôle </th>
            <td mat-cell *matCellDef="let u">
              <span class="role-badge" [ngClass]="u.role">
                {{ getRoleLabel(u.role) }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="region">
            <th mat-header-cell *matHeaderCellDef> Région </th>
            <td mat-cell *matCellDef="let u"> {{ getRegionNom(u.regionId) }} </td>
          </ng-container>

          <ng-container matColumnDef="pharmacie">
            <th mat-header-cell *matHeaderCellDef> Pharmacie </th>
            <td mat-cell *matCellDef="let u"> {{ getPharmacieNom(u.pharmacieId) }} </td>
          </ng-container>

          <ng-container matColumnDef="statut">
            <th mat-header-cell *matHeaderCellDef> Statut </th>
            <td mat-cell *matCellDef="let u">
              <span class="status-indicator" [ngClass]="{ 'active': u.actif, 'inactive': !u.actif }">
                {{ u.actif ? 'Actif' : 'Inactif' }}
              </span>
            </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef> </th>
            <td mat-cell *matCellDef="let u">
              <div class="action-group">
                <button class="action-btn" (click)="openEditModal(u)" title="Modifier">
                  <mat-icon>edit</mat-icon>
                </button>
                <button class="action-btn danger" (click)="deleteUser(u)" title="Supprimer">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="['name', 'role', 'region', 'pharmacie', 'statut', 'actions']"></tr>
          <tr mat-row *matRowDef="let row; columns: ['name', 'role', 'region', 'pharmacie', 'statut', 'actions'];"></tr>
        </table>
        <div class="empty-state" *ngIf="users.length === 0">
          <mat-icon>people_outline</mat-icon>
          <p>Aucun utilisateur enregistré</p>
        </div>
      </mat-card>

      <!-- Modal Form -->
      <div class="modal-overlay" *ngIf="showModal">
        <mat-card class="modal-card">
          <div class="modal-header">
            <h2>{{ isEditMode ? 'Modifier' : 'Ajouter' }} un utilisateur</h2>
            <button class="close-btn" (click)="closeModal()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <form [formGroup]="userForm" (ngSubmit)="onSubmit()">
            <div class="modal-body">
              <div class="form-row">
                <mat-form-field appearance="outline" class="flex-grow">
                  <mat-label>Prénom</mat-label>
                  <input matInput formControlName="prenom" placeholder="Ex: Ousmane">
                </mat-form-field>
                <mat-form-field appearance="outline" class="flex-grow">
                  <mat-label>Nom</mat-label>
                  <input matInput formControlName="nom" placeholder="Ex: Diop">
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline" class="w-100">
                <mat-label>Email</mat-label>
                <input matInput type="email" formControlName="email" placeholder="Ex: user@csu.sn">
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-100" *ngIf="!isEditMode">
                <mat-label>Mot de passe</mat-label>
                <input matInput type="password" formControlName="password">
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-100">
                <mat-label>Rôle</mat-label>
                <mat-select formControlName="role" (selectionChange)="onRoleChange($event.value)">
                  <mat-option *ngFor="let r of rolesList" [value]="r">
                    {{ getRoleLabel(r) }}
                  </mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-100" *ngIf="userForm.get('role')?.value === 'SERVICE_REGIONAL' || userForm.get('role')?.value === 'PHARMACIEN'">
                <mat-label>Région</mat-label>
                <mat-select formControlName="regionId">
                  <mat-option *ngFor="let r of regions" [value]="r.id">
                    {{ r.nom }}
                  </mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-100" *ngIf="userForm.get('role')?.value === 'PHARMACIEN'">
                <mat-label>Pharmacie</mat-label>
                <mat-select formControlName="pharmacieId">
                  <mat-option *ngFor="let p of pharmacies" [value]="p.id">
                    {{ p.nom }}
                  </mat-option>
                </mat-select>
              </mat-form-field>
            </div>
            <div class="modal-footer">
              <button class="btn btn-outline" type="button" (click)="closeModal()">Annuler</button>
              <button class="btn btn-primary" type="submit" [disabled]="userForm.invalid">Enregistrer</button>
            </div>
          </form>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .users-page {
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    .page-header-row h1 {
      font-size: 26px;
      font-weight: 700;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .page-header-row p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
    }

    .table-card {
      padding: 0 !important;
      overflow: hidden;
    }
    .w-100 { width: 100%; }

    /* User details cell */
    .user-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
    }
    .user-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--primary), var(--accent));
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .user-name {
      font-weight: 600;
      color: var(--text-primary);
      display: block;
    }
    .user-email {
      font-size: 12px;
      color: var(--text-secondary);
      display: block;
    }

    /* Badges */
    .role-badge {
      display: inline-flex;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .role-badge.ADMIN { background: #FEE2E2; color: #EF4444; }
    .role-badge.SERVICE_CENTRAL { background: #DBEAFE; color: #2563EB; }
    .role-badge.SERVICE_REGIONAL { background: #FEF3C7; color: #D97706; }
    .role-badge.PHARMACIEN { background: #CCFBF1; color: #0D9488; }

    .status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
    }
    .status-indicator::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-indicator.active { color: #16A34A; }
    .status-indicator.active::before { background: #16A34A; }
    .status-indicator.inactive { color: #94A3B8; }
    .status-indicator.inactive::before { background: #94A3B8; }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-outline {
      background: white;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-outline:hover {
      background: var(--border-light);
    }

    .form-row {
      display: flex;
      gap: 12px;
    }
    .flex-grow { flex: 1; }

    /* Action buttons */
    .action-group {
      display: flex;
      gap: 4px;
    }
    .action-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .action-btn:hover {
      background: var(--border-light);
      color: var(--primary);
    }
    .action-btn.danger:hover {
      color: var(--warn);
      background: var(--warn-light);
    }

    /* Modal Overlay & Card */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease;
    }
    .modal-card {
      width: 100%;
      max-width: 500px;
      padding: 0 !important;
      overflow: hidden;
      border-radius: var(--radius-lg);
      border: 1px solid var(--border);
    }
    .modal-header {
      background: #F8FAFC;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }
    .modal-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: var(--text-primary);
    }
    .close-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .close-btn:hover {
      color: var(--text-primary);
    }
    .modal-body {
      padding: 24px;
    }
    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      background: #F8FAFC;
    }

    .empty-state {
      text-align: center;
      padding: 48px !important;
    }
    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }
    .empty-state p {
      color: var(--text-secondary);
      font-size: 15px;
    }
  `]
})
export class UtilisateursComponent implements OnInit {
  users: User[] = [];
  regions: Region[] = [];
  pharmacies: Pharmacie[] = [];
  rolesList = Object.values(Role);
  
  showModal = false;
  isEditMode = false;
  editingUserId: string | null = null;
  userForm!: FormGroup;

  constructor(
    private userService: UserService,
    private regionService: RegionService,
    private pharmacieService: PharmacieService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService
  ) {
    this.initForm();
  }

  ngOnInit() {
    this.loadUsers();
    this.loadMetadata();
  }

  initForm() {
    this.userForm = this.fb.group({
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: [''],
      role: [Role.PHARMACIEN, Validators.required],
      regionId: [''],
      pharmacieId: ['']
    });
  }

  loadUsers() {
    this.userService.getAll().subscribe({
      next: (data) => this.users = data,
      error: () => this.showMsg('Erreur lors du chargement des utilisateurs')
    });
  }

  loadMetadata() {
    this.regionService.getAll().subscribe(data => this.regions = data);
    this.pharmacieService.getAll().subscribe(data => this.pharmacies = data);
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'ADMIN': return 'Administrateur';
      case 'SERVICE_CENTRAL': return 'Service Central';
      case 'SERVICE_REGIONAL': return 'Service Régional';
      case 'PHARMACIEN': return 'Pharmacien';
      default: return role;
    }
  }

  getRegionNom(regionId?: string): string {
    if (!regionId) return '-';
    const reg = this.regions.find(r => r.id === regionId);
    return reg ? reg.nom : '-';
  }

  getPharmacieNom(pharmacieId?: string): string {
    if (!pharmacieId) return '-';
    const ph = this.pharmacies.find(p => p.id === pharmacieId);
    return ph ? ph.nom : '-';
  }

  onRoleChange(role: string) {
    const regionCtrl = this.userForm.get('regionId');
    const pharmacieCtrl = this.userForm.get('pharmacieId');

    if (role === 'SERVICE_REGIONAL') {
      regionCtrl?.setValidators([Validators.required]);
      pharmacieCtrl?.clearValidators();
      pharmacieCtrl?.setValue('');
    } else if (role === 'PHARMACIEN') {
      regionCtrl?.setValidators([Validators.required]);
      pharmacieCtrl?.setValidators([Validators.required]);
    } else {
      regionCtrl?.clearValidators();
      regionCtrl?.setValue('');
      pharmacieCtrl?.clearValidators();
      pharmacieCtrl?.setValue('');
    }
    regionCtrl?.updateValueAndValidity();
    pharmacieCtrl?.updateValueAndValidity();
  }

  openAddModal() {
    this.isEditMode = false;
    this.editingUserId = null;
    this.userForm.reset({ role: Role.PHARMACIEN });
    this.userForm.get('password')?.setValidators([Validators.required]);
    this.userForm.get('password')?.updateValueAndValidity();
    this.onRoleChange(Role.PHARMACIEN);
    this.showModal = true;
  }

  openEditModal(user: User) {
    this.isEditMode = true;
    this.editingUserId = user.id || null;
    this.userForm.patchValue({
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      password: '',
      role: user.role,
      regionId: user.regionId || '',
      pharmacieId: user.pharmacieId || ''
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.onRoleChange(user.role);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  onSubmit() {
    if (this.userForm.invalid) return;

    const val = this.userForm.value;
    if (this.isEditMode && this.editingUserId) {
      // update
      const updateData = { ...val };
      if (!updateData.password) delete updateData.password; // don't update password if empty

      this.userService.update(this.editingUserId, updateData).subscribe({
        next: () => {
          this.showMsg('Utilisateur modifié avec succès');
          this.loadUsers();
          this.closeModal();
        },
        error: (err) => this.showMsg('Erreur lors de la modification: ' + (err.error?.message || err.message))
      });
    } else {
      // create
      this.userService.create(val).subscribe({
        next: () => {
          this.showMsg('Utilisateur créé avec succès');
          this.loadUsers();
          this.closeModal();
        },
        error: (err) => this.showMsg('Erreur lors de la création: ' + (err.error?.message || err.message))
      });
    }
  }

  deleteUser(user: User) {
    this.confirm.ask({
      title: 'Supprimer l\'utilisateur',
      message: `Êtes-vous sûr de vouloir supprimer l'utilisateur ${user.prenom} ${user.nom} ? Cette action est irréversible.`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.userService.delete(user.id!).subscribe({
        next: () => {
          this.showMsg('Utilisateur supprimé');
          this.loadUsers();
        },
        error: (err) => this.showMsg('Erreur de suppression')
      });
    });
  }

  private showMsg(msg: string) {
    this.snackBar.open(msg, 'Fermer', { duration: 3000 });
  }
}
