import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ConsolidationComponent } from '../consolidation/consolidation.component';
import { StructuresSanitairesComponent } from '../structures-sanitaires/structures-sanitaires.component';
import { PostesFacturesComponent } from '../espace-structure/postes-factures/postes-factures.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-espace-district',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    ConsolidationComponent,
    StructuresSanitairesComponent,
    PostesFacturesComponent
  ],
  templateUrl: './espace-district.component.html'
})
export class EspaceDistrictComponent implements OnInit {
  /** 0 = Consolidation & Tableau de bord · 1 = Structures Sanitaires · 2 = Factures des postes */
  selectedTab = 0;
  districtNom = '';

  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.districtNom = user?.districtNom || 'District Sanitaire';

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab >= 0 && tab <= 2 ? tab : 0;
      });
  }

  changerOnglet(index: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }
}
