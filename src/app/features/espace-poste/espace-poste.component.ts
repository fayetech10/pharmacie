import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ParametresStructureComponent } from '../espace-structure/parametres-structure/parametres-structure.component';
import { FacturationCsuPosteComponent } from './facturation-csu/facturation-csu.component';
import { MesFacturesPosteComponent } from './mes-factures-poste/mes-factures-poste.component';
import { AuthService } from '../../core/services/auth.service';
import { TuileActiviteComponent } from '../../shared/tuile-activite/tuile-activite.component';

/**
 * Espace du poste de santé. À l'ouverture, deux choix : Facturation CSU et Paramétrage
 * (la Facturation Hors CSU du cahier des charges, §1, est masquée). La facturation CSU
 * se divise en deux onglets, « Facturation » et « Mes factures ».
 *
 * 0 = Accueil · 1 = CSU / Facturation · 2 = CSU / Mes factures · 4 = Paramétrage
 * (3 = ancien Hors CSU, renvoie à l'accueil) — piloté par la sidebar (?tab=).
 */
@Component({
  selector: 'app-espace-poste',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    FacturationCsuPosteComponent,
    MesFacturesPosteComponent,
    ParametresStructureComponent,
    TuileActiviteComponent
  ],
  templateUrl: './espace-poste.component.html'
})
export class EspacePosteComponent implements OnInit {
  selectedTab = 0;
  structureNom = '';
  structureRattachementNom = '';

  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.structureNom = user?.structureNom || 'Poste de Santé';
    this.structureRattachementNom = user?.structureRattachementNom || '';

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        // L'ancien onglet 5 (sous-menu CSU) mène désormais directement à la facturation ;
        // l'onglet 3 (Hors CSU, masqué) renvoie à l'accueil.
        this.selectedTab = tab === 5 ? 1 : [0, 1, 2, 4].includes(tab) ? tab : 0;
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
