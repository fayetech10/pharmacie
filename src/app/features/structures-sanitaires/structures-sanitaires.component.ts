import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSortModule } from '@angular/material/sort';
import { StructureService } from '../../core/services/structure.service';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { RegionService, Region } from '../../core/services/region.service';
import { DistrictService } from '../../core/services/district.service';
import { District } from '../../core/models/referentiel.model';
import { StructureSanitaire, ImportResult, typeEffectifStructure } from '../../core/models/structure.model';
import { User } from '../../core/models/user.model';
import { ConfirmService } from '../../core/services/confirm.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';

/** Texte comparable pour la recherche : sans accents ni casse (« Thiès » = « thies »). */
function normaliser(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Valeur du filtre district désignant les structures sans district (hors de toute consolidation). */
const SANS_DISTRICT = '__sans_district__';

@Component({
  selector: 'app-structures-sanitaires',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatCardModule, MatButtonModule,
    MatIconModule, MatTableModule, MatInputModule, MatSelectModule, MatSnackBarModule,
    MatSortModule, MatMenuModule, PaginationComponent, PaginerPipe
  ],
  templateUrl: './structures-sanitaires.component.html'
})
export class StructuresSanitairesComponent implements OnInit {
  structures: StructureSanitaire[] = [];
  regions: Region[] = [];
  districts: District[] = [];
  bcsuUsers: User[] = [];

  showModal = false;
  isEditMode = false;
  editingId: string | null = null;
  form!: FormGroup;

  constructor(
    private structureService: StructureService,
    private userService: UserService,
    private regionService: RegionService,
    private districtService: DistrictService,
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
      districtId: [''],
      bcsuId: [''],
      password: [''],
      structureRattachementId: [''],
      // Centre de santé siège du district : double casquette centre + district.
      siegeDistrict: [false]
    });
    // Réactions aux choix, quel que soit le champ (natif ou non) qui les produit.
    this.form.get('structureRattachementId')!.valueChanges.subscribe(() => this.onCentreChange());
    this.form.get('regionId')!.valueChanges.subscribe(() => this.onRegionChange());
  }

  /**
   * Seuls les EPS (hôpitaux) peuvent être enregistrés sans district sanitaire — et un centre
   * « siège du district » : s'il n'en choisit pas, le district est créé à partir de lui.
   */
  get districtObligatoire(): boolean {
    if (this.siegeCoche) return false;
    return (this.form?.get('typeStructure')?.value || 'CS') !== 'EPS';
  }

  /** Centre de santé coché « siège du district ». */
  get siegeCoche(): boolean {
    return this.estCentreSante && !!this.form?.get('siegeDistrict')?.value;
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

  /**
   * Districts proposés : ceux de la région choisie.
   *
   * <p>Le serveur refuse un district qui n'appartient pas à la région déclarée
   * (« Le district X n'appartient pas à la région sélectionnée »). Filtrer ici évite
   * de faire découvrir cette règle par un message d'erreur après coup.</p>
   */
  get districtsDeLaRegion(): District[] {
    const regionId = this.form?.get('regionId')?.value;
    if (!regionId) return [];
    return this.districts.filter(d => d.regionId === regionId);
  }

  /** Région changée : un district d'une autre région ne peut pas rester sélectionné. */
  onRegionChange(): void {
    const districtId = this.form.get('districtId')?.value;
    if (districtId && !this.districtsDeLaRegion.some(d => d.id === districtId)) {
      this.form.patchValue({ districtId: '' });
    }
  }

  /** Le formulaire concerne-t-il un poste de santé (rattachement obligatoire) ? */
  /** Type « Centre de santé » choisi dans le formulaire (seul type pouvant être siège du district). */
  get estCentreSante(): boolean {
    return this.form.get('typeStructure')?.value === 'CS';
  }

  get isPosteSante(): boolean {
    if (this.isEditMode && this.editingId) {
      const s = this.structures.find(x => x.id === this.editingId);
      if (s) return this.typeDe(s) === 'PS';
    }
    return this.form.get('typeStructure')?.value === 'PS';
  }

  /** Centre de rattachement choisi pour le poste. */
  get centreChoisi(): StructureSanitaire | undefined {
    const id = this.form.get('structureRattachementId')?.value;
    return id ? this.structures.find(s => s.id === id) : undefined;
  }

  /**
   * Un poste prend le district (et la région) de son centre : ils ne se saisissent pas.
   * Seule exception, un centre sans district (EPS) : le district du poste reste à choisir.
   */
  get districtDuCentre(): boolean {
    return this.isPosteSante && !!this.centreChoisi?.districtId;
  }

  /** Afficher région / district : pas pour un poste, sauf si son centre n'a pas de district. */
  get afficherDistrict(): boolean {
    return !this.isPosteSante || (!!this.centreChoisi && !this.centreChoisi.districtId);
  }

  get aideDistrict(): string {
    if (this.siegeCoche) {
      return 'Laissez vide : le district sera créé à partir de ce centre. '
        + 'Ou choisissez un district existant dont ce centre devient le siège.';
    }
    if (this.isPosteSante) return 'Le centre choisi n\'a pas de district : indiquez celui du poste.';
    return this.districtsDeLaRegion.length ? 'Détermine la consolidation district.' : 'Choisissez d\'abord une région.';
  }

  /** Centre choisi : le poste en reprend aussitôt le district et la région (le serveur fait de même). */
  onCentreChange(): void {
    const centre = this.centreChoisi;
    if (this.isPosteSante && centre?.districtId) {
      this.form.patchValue({ districtId: centre.districtId, regionId: centre.regionId });
    }
  }

  getStructureNom(id?: string): string {
    if (!id) return '—';
    return this.structures.find(s => s.id === id)?.nom || '—';
  }

  /** Types d'établissement : déterminent le code auto-généré ({REGION}{TYPE}{NN}, ex: DKCS01). */
  readonly typesStructure = [
    { code: 'CS', label: 'Centre de santé', icone: 'local_hospital',
      description: 'Facture et valide les factures de ses postes' },
    { code: 'PS', label: 'Poste de santé', icone: 'medical_services',
      description: 'Rattaché à un centre, dont il prend le district' },
    { code: 'EPS', label: 'Hôpital (EPS)', icone: 'apartment',
      description: 'Établissement public de santé' }
  ];

  /** Type affiché dans le formulaire (en modification : celui de la structure). */
  get typeCourant() {
    const code = this.isPosteSante ? 'PS' : (this.form.get('typeStructure')?.value || 'CS');
    return this.typesStructure.find(t => t.code === code) || this.typesStructure[0];
  }

  /** Choix du type à la création : un poste seul se rattache à un centre. */
  choisirType(code: string): void {
    this.form.patchValue({ typeStructure: code });
    if (code !== 'PS') {
      this.form.patchValue({ structureRattachementId: '' });
    }
  }

  voirMotDePasse = false;

  /** Champ en erreur, une fois touché (pas d'erreur rouge à l'ouverture du formulaire). */
  invalide(champ: string): boolean {
    const c = this.form.get(champ);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  get isServiceRegional(): boolean {
    return this.authService.isServiceRegional();
  }

  /**
   * Ajouter, modifier, activer, réinitialiser, exporter : administration nationale et
   * régionale. Le District consulte seulement (espace District) — le serveur lui refuse
   * toute écriture, les boutons ne faisaient qu'échouer.
   */
  peutGerer = false;

  /** Supprimer, importer, purger : servis par le cœur, qui les réserve au SR et à l'Admin. */
  peutSupprimerImporter = false;

  /** Colonnes du tableau, selon le rôle (fixées une fois : le rôle ne change pas en cours de page). */
  colonnes: string[] = [];

  ngOnInit() {
    this.peutGerer = this.authService.isAdmin() || this.authService.isServiceRegional()
      || this.authService.isServiceCentral();
    this.peutSupprimerImporter = this.authService.isAdmin() || this.authService.isServiceRegional();
    this.colonnes = this.peutGerer
      ? ['nom', 'type', 'region', 'district', 'bcsu', 'statut', 'actions']
      : ['nom', 'type', 'region', 'district', 'statut'];

    this.load();
    // Libellés des groupes et recherche par district : recalculés dès que le référentiel arrive.
    this.regionService.getAll().subscribe(r => { this.regions = r; this.rafraichirFiltres(); });
    this.districtService.getDistricts().subscribe(d => { this.districts = d; this.rafraichirFiltres(); });
    // /users/bcsu et non /users : la liste complète est réservée à l'Admin. Ouverte au SR,
    // au Service Central et à l'Admin — pas au District, d'où la colonne masquée pour lui.
    if (this.peutGerer) {
      this.userService.getBcsu().subscribe(u => this.bcsuUsers = u);
    }
  }


  loading = true;

  load() {
    this.loading = true;
    this.structureService.getStructures().subscribe({
      next: s => { this.structures = s; this.loading = false; this.rafraichirFiltres(); },
      error: () => this.loading = false
    });
  }

  // ===== Recherche et filtres (district, type) =====

  readonly SANS_DISTRICT = SANS_DISTRICT;
  recherche = '';
  /** '' = tous les districts, {@link SANS_DISTRICT}, ou l'id d'un district. */
  filtreDistrict = '';
  /** '' = tous les types, sinon CS / PS / EPS. */
  filtreType = '';

  /**
   * Structures affichées. Champ et non getter : le pipe de pagination doit recevoir la même
   * référence d'un cycle de détection à l'autre.
   */
  structuresFiltrees: StructureSanitaire[] = [];
  /** Districts du filtre, groupés par région, avec le nombre de structures de chacun. */
  groupesDistricts: { region: string; districts: { id: string; libelle: string }[] }[] = [];
  nbSansDistrict = 0;
  /** Répartition par type des structures affichées (« 1 centre · 34 postes »). */
  resumeFiltre = '';

  @ViewChild('pg') pg?: PaginationComponent;

  get filtresActifs(): boolean {
    return !!(this.recherche.trim() || this.filtreDistrict || this.filtreType);
  }

  /** Données ou référentiel rechargés : options du filtre et liste recalculées, page conservée. */
  private rafraichirFiltres(): void {
    this.construireFiltreDistricts();
    this.appliquerFiltres(false);
  }

  /**
   * Options du filtre district. Un service régional ne voit que les districts de sa région ;
   * un district sans structure reste proposé (avec « 0 ») : c'est une information en soi.
   */
  private construireFiltreDistricts(): void {
    const parDistrict = new Map<string, number>();
    this.nbSansDistrict = 0;
    for (const s of this.structures) {
      if (s.districtId) parDistrict.set(s.districtId, (parDistrict.get(s.districtId) || 0) + 1);
      else this.nbSansDistrict++;
    }
    const regionSr = this.isServiceRegional ? this.authService.getCurrentUser()?.regionId : null;
    const groupes = new Map<string, { id: string; libelle: string; nom: string }[]>();
    for (const d of this.districts) {
      if (regionSr && d.regionId !== regionSr) continue;
      const region = d.regionNom || (d.regionId ? this.getRegionNom(d.regionId) : '-');
      const cle = region === '-' ? 'Autres' : region;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle)!.push({ id: d.id, nom: d.nom, libelle: `${d.nom} (${parDistrict.get(d.id) || 0})` });
    }
    this.groupesDistricts = [...groupes.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([region, ds]) => ({
        region,
        districts: ds.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(({ id, libelle }) => ({ id, libelle }))
      }));
    // Le district choisi a disparu (supprimé, autre région) : le filtre ne doit pas vider la liste en silence.
    if (this.filtreDistrict && this.filtreDistrict !== SANS_DISTRICT && this.districts.length
        && !this.groupesDistricts.some(g => g.districts.some(d => d.id === this.filtreDistrict))) {
      this.filtreDistrict = '';
    }
  }

  /** Texte dans lequel cherche la recherche : identité, district et centre de rattachement. */
  private texteRecherche(s: StructureSanitaire): string {
    const district = s.districtId ? this.districts.find(d => d.id === s.districtId) : undefined;
    return normaliser([
      s.nom, s.code, s.email, s.adresse, district?.nom, district?.code,
      s.structureRattachementId ? this.getStructureNom(s.structureRattachementId) : ''
    ].join(' '));
  }

  /** Filtre la liste ; un changement de critère ramène à la première page. */
  appliquerFiltres(premierePage = true): void {
    const mots = normaliser(this.recherche).split(/\s+/).filter(Boolean);
    this.structuresFiltrees = this.structures.filter(s => {
      if (this.filtreType && this.typeDe(s) !== this.filtreType) return false;
      if (this.filtreDistrict === SANS_DISTRICT) {
        if (s.districtId) return false;
      } else if (this.filtreDistrict && s.districtId !== this.filtreDistrict) {
        return false;
      }
      if (!mots.length) return true;
      const texte = this.texteRecherche(s);
      return mots.every(m => texte.includes(m));
    });

    const n = { CS: 0, PS: 0, EPS: 0 } as Record<string, number>;
    for (const s of this.structuresFiltrees) n[this.typeDe(s)] = (n[this.typeDe(s)] || 0) + 1;
    this.resumeFiltre = [
      n['CS'] ? `${n['CS']} centre${n['CS'] > 1 ? 's' : ''}` : '',
      n['PS'] ? `${n['PS']} poste${n['PS'] > 1 ? 's' : ''}` : '',
      n['EPS'] ? `${n['EPS']} EPS` : ''
    ].filter(Boolean).join(' · ');

    if (premierePage) this.pg?.aller(0);
  }

  reinitialiserFiltres(): void {
    this.recherche = '';
    this.filtreDistrict = '';
    this.filtreType = '';
    this.appliquerFiltres();
  }

  getRegionNom(id: string): string {
    return this.regions.find(r => r.id === id)?.nom || '-';
  }
  /**
   * Nom du district, ou {@code null} quand la structure n'en a aucun.
   *
   * <p>La distinction compte : sans district, une structure n'apparaît dans <b>aucune</b>
   * consolidation. La liste doit donc signaler ce vide au lieu d'afficher un tiret qui se
   * confond avec une donnée simplement absente. Un identifiant présent mais introuvable
   * (district supprimé) rend « — » : ce n'est pas le même problème.</p>
   */
  getDistrictNom(id?: string): string | null {
    if (!id) return null;
    return this.districts.find(d => d.id === id)?.nom ?? '—';
  }

  getBcsuNom(id?: string): string {
    const u = this.bcsuUsers.find(x => x.id === id);
    return u ? `${u.prenom} ${u.nom}` : '-';
  }

  openAdd() {
    this.isEditMode = false;
    this.editingId = null;
    this.form.reset({ typeStructure: 'CS', districtId: '', regionId: '', bcsuId: '', structureRattachementId: '', siegeDistrict: false });
    this.voirMotDePasse = false;

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
    // typeStructure et districtId sont repris explicitement : le serveur les applique
    // sans condition (setDistrictId / setTypeStructure), donc un formulaire qui ne les
    // rechargerait pas ferait pire que ne rien changer — il écraserait la valeur en base
    // par celle laissée par l'ouverture précédente (ou par du vide).
    this.form.patchValue({
      code: s.code, nom: s.nom, adresse: s.adresse, telephone: s.telephone,
      email: s.email, regionId: s.regionId, districtId: s.districtId || '',
      bcsuId: s.bcsuId, password: '',
      typeStructure: this.typeDe(s),
      structureRattachementId: s.structureRattachementId || '',
      siegeDistrict: !!s.siegeDistrict
    });
    // Poste déjà incohérent (district ≠ celui de son centre) : l'écran montre d'emblée
    // le district qu'il prendra à l'enregistrement.
    this.onCentreChange();
    this.showModal = true;
  }

  close() { this.showModal = false; }

  submit() {
    // Poste de santé : rattachement à une structure (CS/EPS) obligatoire. Vérifié avant la
    // validité du formulaire : sans centre, la région (obligatoire) est vide, et le clic
    // sur « Enregistrer » ne faisait rien sans dire pourquoi.
    if (this.isPosteSante && !this.form.value.structureRattachementId) {
      this.snackBar.open('Un poste de santé doit être rattaché à une structure sanitaire (CS ou EPS)', 'Fermer', { duration: 5000 });
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const val = { ...this.form.value };

    // Cahier « Espace PS », §2 : poste et centre de santé obligatoirement rattachés à un district.
    if (this.districtObligatoire && !val.districtId) {
      this.snackBar.open('Un poste ou un centre de santé doit être rattaché à un district sanitaire.', 'Fermer', { duration: 5000 });
      return;
    }
    if (!this.isPosteSante) {
      val.structureRattachementId = '';
    }
    // « Siège du district » : centre de santé seulement. Sans district choisi, le serveur crée
    // le district à partir de ce centre (il EST le district qui polarise ses postes).
    val.siegeDistrict = this.estCentreSante && !!val.siegeDistrict;
    const districtACreer = val.siegeDistrict && !val.districtId;
    if (districtACreer && !val.regionId) {
      this.snackBar.open('Choisissez la région : le district créé à partir de ce centre y sera rattaché.', 'Fermer', { duration: 5000 });
      return;
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
        const base = this.isEditMode ? 'Structure modifiée' : 'Structure créée';
        this.snackBar.open(districtACreer ? `${base} — district créé à partir de ce centre, dont il est le siège.` : base,
          'Fermer', { duration: districtACreer ? 6000 : 3000 });
        this.load();
        // Le district créé doit apparaître aussitôt dans les listes (colonne District, sélecteurs).
        if (districtACreer) this.districtService.getDistricts().subscribe(d => this.districts = d);
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

  exportEnCours = false;

  /**
   * PDF des identifiants de connexion des structures affichées : la recherche et les filtres
   * (district, type) s'appliquent, dans l'ordre de l'écran — « District de Thiès » → le PDF
   * de ses postes à remettre.
   */
  exporterIdentifiants() {
    if (!this.structuresFiltrees.length) {
      this.snackBar.open('Aucune structure à exporter avec ces filtres.', 'Fermer', { duration: 3000 });
      return;
    }
    const district = this.filtreDistrict && this.filtreDistrict !== SANS_DISTRICT
      ? this.districts.find(d => d.id === this.filtreDistrict)?.nom : '';
    const nomFichier = 'Identifiants_' + (district || 'structures')
      .normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '_') + '.pdf';
    this.exportEnCours = true;
    this.structureService.exportIdentifiantsPdf(this.structuresFiltrees.map(s => s.id)).subscribe({
      next: (blob: Blob) => {
        this.exportEnCours = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomFichier;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open(`PDF des identifiants : ${this.structuresFiltrees.length} structure(s)`, 'Fermer', { duration: 2500 });
      },
      error: (err) => {
        this.exportEnCours = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
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

  // ===== Compte de connexion : activation et mot de passe =====

  /** Structure dont une action de compte est en cours (ses boutons sont désactivés). */
  actionEnCours: string | null = null;

  /**
   * Active / désactive la structure. Le serveur fait suivre son compte de connexion :
   * une structure désactivée ne peut plus se connecter, mais ses factures restent.
   */
  basculerActivation(s: StructureSanitaire) {
    const desactiver = s.actif;
    this.confirm.ask({
      title: desactiver ? 'Désactiver la structure' : 'Réactiver la structure',
      message: desactiver
        ? `« ${s.nom} » ne pourra plus se connecter. Ses factures restent consultables et elle pourra être réactivée à tout moment.`
        : `« ${s.nom} » pourra de nouveau se connecter avec son compte.`,
      confirmText: desactiver ? 'Désactiver' : 'Réactiver',
      danger: desactiver
    }).subscribe(ok => {
      if (!ok) return;
      this.actionEnCours = s.id;
      this.structureService.basculerActivation(s.id, !desactiver).subscribe({
        next: maj => {
          this.actionEnCours = null;
          s.actif = maj.actif;
          this.snackBar.open(maj.actif ? 'Structure réactivée' : 'Structure désactivée', 'Fermer', { duration: 3000 });
        },
        error: err => {
          this.actionEnCours = null;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  /** Nouveau mot de passe temporaire pour le compte de la structure, affiché une seule fois. */
  reinitialiserMotDePasse(s: StructureSanitaire) {
    this.confirm.ask({
      title: 'Réinitialiser le mot de passe',
      message: `Le mot de passe de « ${s.nom} » va être remis à « password123 » (à changer à la connexion). L'ancien ne permettra plus de se connecter.`,
      confirmText: 'Réinitialiser'
    }).subscribe(ok => {
      if (!ok) return;
      this.actionEnCours = s.id;
      this.structureService.reinitialiserMotDePasse(s.id).subscribe({
        next: acces => {
          this.actionEnCours = null;
          this.confirm.afficherAcces(
            acces.compteCree ? 'Compte de connexion créé' : 'Mot de passe réinitialisé',
            acces.identifiant, acces.motDePasseTemporaire, 'la structure'
          ).subscribe();
        },
        error: err => {
          this.actionEnCours = null;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
        }
      });
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
