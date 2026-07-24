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
import { StructureSanitaire, ImportResult, typeEffectifStructure } from '../../core/models/structure.model';
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
  templateUrl: './structures-sanitaires.component.html'
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
      typeStructure: ['CS'],
      nom: ['', Validators.required],
      adresse: [''],
      telephone: [''],
      email: ['', Validators.email],
      regionId: ['', Validators.required],
      bcsuId: [''],
      password: [''],
      structureRattachementId: ['']
    });
  }

  /** Type effectif (CS / EPS / PS) d'une structure, y compris les données existantes. */
  typeDe(s: StructureSanitaire): string {
    return typeEffectifStructure(s);
  }

  /** Couleurs de la puce « type » (portées en classes Tailwind — le JIT scanne aussi les .ts). */
  typeBadgeClass(s: StructureSanitaire): string {
    const t = this.typeDe(s);
    if (t === 'PS') return 'bg-[#fef9c3] text-[#a16207]';
    if (t === 'EPS') return 'bg-[#ede9fe] text-[#6d28d9]';
    return 'bg-[#ecfeff] text-[#0e7490]';
  }

  /** Structures pouvant accueillir un poste de santé (CS et EPS uniquement). */
  get structuresRattachement(): StructureSanitaire[] {
    return this.structures.filter(s => this.typeDe(s) !== 'PS');
  }

  /** Le formulaire concerne-t-il un poste de santé (rattachement obligatoire) ? */
  get isPosteSante(): boolean {
    if (this.isEditMode && this.editingId) {
      const s = this.structures.find(x => x.id === this.editingId);
      if (s) return this.typeDe(s) === 'PS';
    }
    return this.form.get('typeStructure')?.value === 'PS';
  }

  getStructureNom(id?: string): string {
    if (!id) return '—';
    return this.structures.find(s => s.id === id)?.nom || '—';
  }

  /** Types d'établissement : déterminent le code auto-généré ({REGION}{TYPE}{NN}, ex: DKCS01). */
  readonly typesStructure = [
    { code: 'CS', label: 'Centre de santé' },
    { code: 'EPS', label: 'Hôpital (EPS)' },
    { code: 'PS', label: 'Poste de santé' }
  ];

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
  getBcsuNom(id?: string): string {
    const u = this.bcsuUsers.find(x => x.id === id);
    return u ? `${u.prenom} ${u.nom}` : '-';
  }

  openAdd() {
    this.isEditMode = false;
    this.editingId = null;
    this.form.reset({ typeStructure: 'CS' });

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
      email: s.email, regionId: s.regionId, bcsuId: s.bcsuId, password: '',
      structureRattachementId: s.structureRattachementId || ''
    });
    this.showModal = true;
  }

  close() { this.showModal = false; }

  submit() {
    if (this.form.invalid) return;
    const val = { ...this.form.value };

    // Poste de santé : rattachement à une structure (CS/EPS) obligatoire.
    if (this.isPosteSante && !val.structureRattachementId) {
      this.snackBar.open('Un poste de santé doit être rattaché à une structure sanitaire (CS ou EPS)', 'Fermer', { duration: 5000 });
      return;
    }
    if (!this.isPosteSante) {
      val.structureRattachementId = '';
    }

    // Création : code laissé vide → généré automatiquement par le backend ({REGION}{TYPE}{NN}).
    if (!this.isEditMode) {
      val.code = '';
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

  // ===== Import Excel des postes de santé =====
  importing = false;
  purging = false;
  importResult: ImportResult | null = null;

  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importing = true;
    this.importResult = null;
    this.structureService.importPostes(file).subscribe({
      next: (result) => {
        this.importing = false;
        this.importResult = result;
        this.load();
        this.snackBar.open(`${result.importes} poste(s) de santé importé(s), ${result.echecs} échec(s)`, 'Fermer', { duration: 5000 });
      },
      error: (err) => {
        this.importing = false;
        this.snackBar.open('Erreur import : ' + (err.error?.message || err.message), 'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
      }
    });
    input.value = '';
  }

  telechargerModeleImport() {
    this.structureService.downloadModeleImportPostes().subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'modele_import_postes_sante.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  /** Export Excel des structures avec leurs identifiants de connexion. */
  exporterIdentifiants() {
    this.structureService.exportStructures().subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'structures_identifiants.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export des identifiants lancé', 'Fermer', { duration: 2500 });
      },
      error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  /**
   * Supprime les factures de structure restées en brouillon (jamais envoyées).
   * Action irréversible : confirmation explicite requise.
   */
  purgerBrouillons() {
    this.confirm.ask({
      title: 'Purger les brouillons de factures',
      message: 'Toutes les factures de structure encore en brouillon (jamais envoyées) seront '
        + 'définitivement supprimées. Les factures déjà transmises ne sont pas concernées. Continuer ?',
      confirmText: 'Purger',
      cancelText: 'Annuler',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.purging = true;
      this.structureService.purgerBrouillons().subscribe({
        next: (res) => {
          this.purging = false;
          this.snackBar.open(`${res.supprimees} brouillon(s) supprimé(s)`, 'Fermer', { duration: 4000 });
        },
        error: (err) => {
          this.purging = false;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  fermerImportResult() {
    this.importResult = null;
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
