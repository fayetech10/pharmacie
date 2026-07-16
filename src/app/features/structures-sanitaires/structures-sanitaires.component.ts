import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { StructureService } from '../../core/services/structure.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { RegionService, Region } from '../../core/services/region.service';
import { StructureSanitaire } from '../../core/models/structure.model';
import { User } from '../../core/models/user.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { FacturesStructureListComponent } from '../espace-structure/factures-structure-list/factures-structure-list.component';
import { StructuresFacturesComponent } from '../structures-factures/structures-factures.component';

@Component({
  selector: 'app-structures-sanitaires',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatButtonModule,
    MatIconModule, MatTableModule, MatInputModule, MatSelectModule, MatSnackBarModule,
    MatTabsModule, FacturesStructureListComponent, StructuresFacturesComponent
  ],
  templateUrl: './structures-sanitaires.component.html',
  styleUrls: ['./structures-sanitaires.component.css']
})
export class StructuresSanitairesComponent implements OnInit {
  structures: StructureSanitaire[] = [];
  regions: Region[] = [];
  bcsuUsers: User[] = [];

  /** Onglets : 0 Structures (gestion), 1 Factures structures. */
  selectedTab = 0;
  
  showModal = false;
  isEditMode = false;
  editingId: string | null = null;
  form!: FormGroup;
  private destroyRef = inject(DestroyRef);

  constructor(
    private structureService: StructureService,
    private userService: UserService,
    private regionService: RegionService,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    public authService: AuthService
  ) {
    this.form = this.fb.group({
      code: [''],
      nom: ['', Validators.required],
      adresse: [''],
      telephone: [''],
      email: ['', Validators.email],
      regionId: ['', Validators.required],
      bcsuId: [''],
      password: ['']
    });

    if (!this.isServiceRegional) {
      this.form.get('code')?.setValidators([Validators.required]);
    }
  }

  get isServiceRegional(): boolean {
    return this.authService.isServiceRegional();
  }

  ngOnInit() {
    this.load();
    this.regionService.getAll().subscribe(r => this.regions = r);
    // /users/bcsu et non /users : la liste complète est réservée à l'Admin,
    // or cette page est aussi ouverte au Service Régional (403 → déconnexion sinon).
    this.userService.getBcsu().subscribe(u => this.bcsuUsers = u);
    // L'onglet actif suit le paramètre ?tab= (liens de retour des pages de détail).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.selectedTab = +(params.get('tab') ?? 0));
  }

  onTabChange(index: number) {
    const currentTab = +(this.route.snapshot.queryParamMap.get('tab') ?? 0);
    if (index === currentTab) {
      return; // Évite les navigations redondantes
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }

  load() {
    this.structureService.getStructures().subscribe(s => this.structures = s);
  }

  getRegionNom(id: string): string {
    return this.regions.find(r => r.id === id)?.nom || '-';
  }
  getBcsuNom(id: string): string {
    const u = this.bcsuUsers.find(x => x.id === id);
    return u ? `${u.prenom} ${u.nom}` : '-';
  }

  openAdd() {
    this.isEditMode = false;
    this.editingId = null;
    this.form.reset();
    
    if (this.isServiceRegional) {
      const userRegionId = this.authService.getCurrentUser()?.regionId;
      if (userRegionId) {
        this.form.patchValue({ regionId: userRegionId });
      }
    }
    
    this.showModal = true;
  }

  openEdit(s: StructureSanitaire) {
    this.isEditMode = true;
    this.editingId = s.id;
    this.form.patchValue({
      code: s.code, nom: s.nom, adresse: s.adresse, telephone: s.telephone,
      email: s.email, regionId: s.regionId, bcsuId: s.bcsuId, password: ''
    });
    this.showModal = true;
  }

  close() { this.showModal = false; }

  submit() {
    if (this.form.invalid) return;
    const val = { ...this.form.value };
    
    if (this.isServiceRegional && !val.code) {
      val.code = 'STR_' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }
    
    const obs = this.isEditMode && this.editingId
      ? this.structureService.updateStructure(this.editingId, val)
      : this.structureService.createStructure(val);
    obs.subscribe({
      next: () => {
        this.snackBar.open(this.isEditMode ? 'Structure modifiée' : 'Structure créée', 'Fermer', { duration: 3000 });
        this.load();
        this.close();
      },
      error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  delete(s: StructureSanitaire) {
    this.confirm.ask({
      title: 'Supprimer la structure',
      message: `Supprimer « ${s.nom} » et son compte agent ? Cette action est irréversible.`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.structureService.deleteStructure(s.id).subscribe({
        next: () => { this.snackBar.open('Structure supprimée', 'Fermer', { duration: 3000 }); this.load(); },
        error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
      });
    });
  }
}
