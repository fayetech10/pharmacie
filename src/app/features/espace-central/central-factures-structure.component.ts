import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { OngletsComponent, Onglet } from '../../shared/onglets/onglets.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { RegionService, Region } from '../../core/services/region.service';
import { DistrictService } from '../../core/services/district.service';
import { StructureService } from '../../core/services/structure.service';
import { StructureSanitaire } from '../../core/models/structure.model';
import { District } from '../../core/models/referentiel.model';

/**
 * Espace Central — factures des STRUCTURES SANITAIRES (postes / centres / EPS).
 *
 * <p>Filtrable par région PUIS district (cascade). Le district n'existe pas sur la facture :
 * on résout ici région/district → ensemble d'ids de structures, transmis à la liste via
 * {@code providerIds} (la liste reste générique). Sous-onglets par statut, comme l'écran
 * pharmacie.</p>
 *
 * <p>Les actions (valider / payer / rejeter) d'une facture structure se font sur son écran
 * de détail : {@code factures-list.payerFacture} ne cible que les factures pharmacie.</p>
 */
@Component({
  selector: 'app-central-factures-structure',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OngletsComponent,
    FacturesListComponent
  ],
  templateUrl: './central-factures-structure.component.html'
})
export class CentralFacturesStructureComponent implements OnInit {
  /** Sous-onglets par statut, présentés comme les onglets de l'espace du poste. */
  readonly ongletsStatut: (Onglet<number> & { statut: string })[] = [
    { cle: 0, libelle: 'Reçues', icone: 'inbox', statut: 'VALIDEE_SR' },
    { cle: 1, libelle: 'Validées', icone: 'verified', statut: 'VALIDEE_NC' },
    { cle: 2, libelle: 'Payées', icone: 'payments', statut: 'PAYEE' },
    { cle: 3, libelle: 'Rejetées', icone: 'cancel', statut: 'REJETEE_NC' }
  ];
  onglet = 0;

  regions: Region[] = [];
  districts: District[] = [];
  structures: StructureSanitaire[] = [];

  selectedRegionId = '';
  selectedDistrictId = '';

  /**
   * Ids de structures correspondant aux filtres, passés à la liste. Champ stable (recalculé
   * uniquement sur action) : un getter renverrait un nouveau tableau à chaque cycle et
   * relancerait le chargement en boucle. {@code null} = aucun filtre.
   */
  providerIds: string[] | null = null;

  private destroyRef = inject(DestroyRef);

  constructor(
    private regionService: RegionService,
    private districtService: DistrictService,
    private structureService: StructureService
  ) {}

  ngOnInit() {
    forkJoin({
      regions: this.regionService.getAll(),
      districts: this.districtService.getDistricts(),
      structures: this.structureService.getStructures()
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ regions, districts, structures }) => {
        this.regions = regions;
        this.districts = districts;
        this.structures = structures;
      });
  }

  /** Districts de la région choisie (ou tous si aucune région sélectionnée). */
  get districtsFiltres(): District[] {
    return this.selectedRegionId
      ? this.districts.filter(d => d.regionId === this.selectedRegionId)
      : this.districts;
  }

  onRegionChange() {
    // Le district choisi doit rester cohérent avec la région ; sinon on le vide.
    if (this.selectedDistrictId && !this.districtsFiltres.some(d => d.id === this.selectedDistrictId)) {
      this.selectedDistrictId = '';
    }
    this.recomputeProviderIds();
  }

  onDistrictChange() {
    this.recomputeProviderIds();
  }

  private recomputeProviderIds() {
    if (this.selectedDistrictId) {
      this.providerIds = this.structures
        .filter(s => s.districtId === this.selectedDistrictId)
        .map(s => s.id);
    } else if (this.selectedRegionId) {
      this.providerIds = this.structures
        .filter(s => s.regionId === this.selectedRegionId)
        .map(s => s.id);
    } else {
      this.providerIds = null;
    }
  }
}
