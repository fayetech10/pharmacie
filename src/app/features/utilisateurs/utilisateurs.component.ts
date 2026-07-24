import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { RegionService, Region } from '../../core/services/region.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { StructureService } from '../../core/services/structure.service';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { StructureSanitaire } from '../../core/models/structure.model';
import { User, Role } from '../../core/models/user.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';

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
  templateUrl: './utilisateurs.component.html'
})
export class UtilisateursComponent implements OnInit {
  users: User[] = [];
  regions: Region[] = [];
  pharmacies: Pharmacie[] = [];
  structures: StructureSanitaire[] = [];
  
  showModal = false;
  isEditMode = false;
  editingUserId: string | null = null;
  userForm!: FormGroup;

  constructor(
    private userService: UserService,
    private regionService: RegionService,
    private pharmacieService: PharmacieService,
    private structureService: StructureService,
    public authService: AuthService,
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

  get rolesList(): string[] {
    if (this.authService.isServiceRegional()) {
      return [Role.BCSU];
    }
    return Object.values(Role);
  }

  get isRegional(): boolean {
    return this.authService.isServiceRegional();
  }

  initForm() {
    const defaultRole = this.isRegional ? Role.BCSU : Role.PHARMACIEN;
    this.userForm = this.fb.group({
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: [''],
      role: [defaultRole, Validators.required],
      regionId: [''],
      pharmacieId: [''],
      structureSanitaireId: ['']
    });
  }

  loadUsers() {
    this.userService.getAll().subscribe({
      next: (data) => this.users = data,
      error: () => this.showMsg('Erreur lors du chargement des utilisateurs')
    });
  }

  // ----- Synthèse -----
  get sumUsers(): number { return this.users.length; }
  get sumPharmaciens(): number { return this.users.filter(u => u.role === Role.PHARMACIEN).length; }
  get sumActifs(): number { return this.users.filter(u => u.actif).length; }

  loadMetadata() {
    this.regionService.getAll().subscribe(data => this.regions = data);
    this.pharmacieService.getAll().subscribe(data => this.pharmacies = data);
    this.structureService.getStructures().subscribe(data => this.structures = data);
  }

  getRoleLabel(role: string): string {
    switch (role) {
      case 'ADMIN': return 'Administrateur';
      case 'SERVICE_CENTRAL': return 'Service Central';
      case 'SERVICE_REGIONAL': return 'Service Régional';
      case 'PHARMACIEN': return 'Pharmacien';
      case 'BCSU': return 'Agent BCSU';
      case 'STRUCTURE_SANITAIRE': return 'Structure Sanitaire';
      default: return role;
    }
  }

  /** Couleurs du badge de rôle (portées en classes Tailwind — le JIT scanne aussi les .ts). */
  roleBadgeClass(role: string): string {
    switch (role) {
      case 'ADMIN': return 'bg-[#FEE2E2] text-[#EF4444]';
      case 'SERVICE_CENTRAL': return 'bg-[#DBEAFE] text-[#2563EB]';
      case 'SERVICE_REGIONAL': return 'bg-[#FEF3C7] text-[#D97706]';
      case 'PHARMACIEN': return 'bg-primary-100 text-primary-hover';
      case 'BCSU': return 'bg-accent-light text-accent';
      case 'STRUCTURE_SANITAIRE': return 'bg-[#EDE9FE] text-[#7C3AED]';
      default: return 'bg-border-light text-text-secondary';
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

  getStructureNom(structureId?: string): string {
    if (!structureId) return '-';
    const st = this.structures.find(s => s.id === structureId);
    return st ? st.nom : '-';
  }

  getRattachementNom(user: User): string {
    if (user.role === Role.PHARMACIEN && user.pharmacieId) {
      return this.getPharmacieNom(user.pharmacieId);
    }
    if ((user.role === Role.BCSU || user.role === Role.STRUCTURE_SANITAIRE) && user.structureSanitaireId) {
      return this.getStructureNom(user.structureSanitaireId);
    }
    return '-';
  }

  onRoleChange(role: string) {
    const regionCtrl = this.userForm.get('regionId');
    const pharmacieCtrl = this.userForm.get('pharmacieId');
    const structureCtrl = this.userForm.get('structureSanitaireId');

    const nomCtrl = this.userForm.get('nom');
    const prenomCtrl = this.userForm.get('prenom');

    // Réinitialise les validateurs conditionnels avant de les réappliquer.
    if (role !== 'BCSU') {
      structureCtrl?.clearValidators();
      structureCtrl?.setValue('');
    }
    nomCtrl?.setValidators([Validators.required]);
    prenomCtrl?.setValidators([Validators.required]);

    if (role === 'SERVICE_REGIONAL' || role === 'BCSU') {
      // L'agent BCSU est rattaché à une région : indispensable pour que le
      // Service Régional visualise ses lettres de garantie et bons de commande.
      if (this.isRegional) {
        regionCtrl?.clearValidators();
        regionCtrl?.setValue(this.authService.getCurrentUser()?.regionId || '');
      } else {
        regionCtrl?.setValidators([Validators.required]);
      }
      if (role === 'SERVICE_REGIONAL') {
        nomCtrl?.clearValidators();
        nomCtrl?.setValue('');
        prenomCtrl?.clearValidators();
        prenomCtrl?.setValue('');
        structureCtrl?.clearValidators();
        structureCtrl?.setValue('');
      }
      // Pour BCSU : le champ structure reste disponible (optionnel)
      pharmacieCtrl?.clearValidators();
      pharmacieCtrl?.setValue('');
    } else if (role === 'PHARMACIEN') {
      regionCtrl?.setValidators([Validators.required]);
      pharmacieCtrl?.setValidators([Validators.required]);
    } else if (role === 'STRUCTURE_SANITAIRE') {
      regionCtrl?.clearValidators();
      regionCtrl?.setValue('');
      pharmacieCtrl?.clearValidators();
      pharmacieCtrl?.setValue('');
      structureCtrl?.setValidators([Validators.required]);
    } else {
      regionCtrl?.clearValidators();
      regionCtrl?.setValue('');
      pharmacieCtrl?.clearValidators();
      pharmacieCtrl?.setValue('');
    }
    regionCtrl?.updateValueAndValidity();
    pharmacieCtrl?.updateValueAndValidity();
    structureCtrl?.updateValueAndValidity();
    nomCtrl?.updateValueAndValidity();
    prenomCtrl?.updateValueAndValidity();
  }

  openAddModal() {
    const defaultRole = this.isRegional ? Role.BCSU : Role.PHARMACIEN;
    this.isEditMode = false;
    this.editingUserId = null;
    this.userForm.reset({ role: defaultRole });
    // Aligné sur la règle serveur (@Size min 8) : erreur claire avant soumission.
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    this.userForm.get('password')?.updateValueAndValidity();
    this.onRoleChange(defaultRole);
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
      pharmacieId: user.pharmacieId || '',
      structureSanitaireId: user.structureSanitaireId || ''
    });
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.onRoleChange(user.role);
    // onRoleChange vide le champ structure (réinitialisation des validateurs) :
    // on repose la valeur de l'utilisateur édité après coup.
    this.userForm.get('structureSanitaireId')?.setValue(user.structureSanitaireId || '');
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
  }

  onSubmit() {
    if (this.userForm.invalid) return;

    const val = { ...this.userForm.value };
    if (this.isRegional) {
      val.role = Role.BCSU;
      val.regionId = this.authService.getCurrentUser()?.regionId || '';
      val.pharmacieId = '';
      // We do NOT clear structureSanitaireId because a BCSU can be attached to a structure
    }

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
