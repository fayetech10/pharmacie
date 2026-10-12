import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TuileActiviteComponent } from '../../shared/tuile-activite/tuile-activite.component';
import { IndicateurComponent } from '../../shared/indicateur/indicateur.component';
import { RegionService } from '../../core/services/region.service';
import { DistrictService } from '../../core/services/district.service';
import { PharmacieService } from '../../core/services/pharmacie.service';
import { StructureService } from '../../core/services/structure.service';
import { StructureSanitaire } from '../../core/models/structure.model';
import { District } from '../../core/models/referentiel.model';
import { Pharmacie } from '../../core/models/pharmacie.model';
import { Region } from '../../core/services/region.service';

@Component({
  selector: 'app-espace-admin',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, TuileActiviteComponent, IndicateurComponent],
  templateUrl: './espace-admin.component.html'
})
export class EspaceAdminComponent implements OnInit {
  stats = {
    nbRegions: 0,
    nbDistricts: 0,
    nbPharmacies: 0,
    nbStructures: 0
  };
  chargement = true;

  private regionService = inject(RegionService);
  private districtService = inject(DistrictService);
  private pharmacieService = inject(PharmacieService);
  private structureService = inject(StructureService);
  private router = inject(Router);

  ngOnInit() {
    this.chargerStatistiques();
  }

  chargerStatistiques() {
    this.chargement = true;
    this.regionService.getAll().subscribe({
      next: (regions: Region[]) => this.stats.nbRegions = regions?.length || 0
    });
    this.districtService.getDistricts().subscribe({
      next: (districts: District[]) => this.stats.nbDistricts = districts?.length || 0
    });
    this.pharmacieService.getAll().subscribe({
      next: (pharmacies: Pharmacie[]) => this.stats.nbPharmacies = pharmacies?.length || 0
    });
    this.structureService.getStructures().subscribe({
      next: (structures: StructureSanitaire[]) => {
        this.stats.nbStructures = structures?.length || 0;
        this.chargement = false;
      },
      error: () => this.chargement = false
    });
  }

  naviguerVers(route: string) {
    this.router.navigate([route]);
  }
}
