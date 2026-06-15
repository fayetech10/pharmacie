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
  templateUrl: './utilisateurs.component.html',
  styleUrls: ['./utilisateurs.component.css']
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
