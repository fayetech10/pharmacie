import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OngletsComponent, Onglet } from '../../shared/onglets/onglets.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { RegionService, Region } from '../../core/services/region.service';

/**
 * Espace Central — factures des PHARMACIES.
 *
 * <p>Un seul écran, filtrable par région (les pharmacies ne sont pas rattachées à un
 * district), avec des sous-onglets par statut : Reçues (VALIDEE_SR) → Validées
 * (VALIDEE_NC, action Payer) → Payées (PAYEE), plus Rejetées (REJETEE_NC). Remplace les
 * anciennes entrées Reçues/Validées/Payées du sidebar.</p>
 */
@Component({
  selector: 'app-central-factures-pharmacie',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    OngletsComponent,
    FacturesListComponent
  ],
  templateUrl: './central-factures-pharmacie.component.html'
})
export class CentralFacturesPharmacieComponent implements OnInit {
  /** Sous-onglets par statut, présentés comme les onglets de l'espace du poste. */
  readonly ongletsStatut: (Onglet<number> & { statut: string })[] = [
    { cle: 0, libelle: 'Reçues', icone: 'inbox', statut: 'VALIDEE_SR' },
    { cle: 1, libelle: 'Validées', icone: 'verified', statut: 'VALIDEE_NC' },
    { cle: 2, libelle: 'Payées', icone: 'payments', statut: 'PAYEE' },
    { cle: 3, libelle: 'Rejetées', icone: 'cancel', statut: 'REJETEE_NC' }
  ];
  onglet = 0;

  regions: Region[] = [];
  selectedRegionId = '';
  private destroyRef = inject(DestroyRef);

  constructor(private regionService: RegionService) {}

  ngOnInit() {
    this.regionService.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(regions => this.regions = regions);
  }
}
