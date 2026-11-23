import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { FactureCountService, statutsStructure } from '../../core/services/facture-count.service';
import { EspaceControleurComponent } from './espace-controleur/espace-controleur.component';

@Component({
  selector: 'app-espace-region',
  standalone: true,
  imports: [CommonModule, RouterOutlet, EspaceControleurComponent],
  templateUrl: './espace-region.component.html'
})
export class EspaceRegionComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly statutsNotifiablesStructures = statutsStructure([
    'ENVOYEE', 'A_TRAITER', 'VALIDEE_NC', 'REJETEE_NC'
  ]);
  private readonly anciennesRoutes = [
    'tableau-de-bord',
    'enregistrement-prestataires',
    'factures-structures',
    'factures-pharmacies',
    'suivi-traitement',
    'suivi-bcsu',
    'parametrage',
    'import-historique'
  ];

  constructor(
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private factureCount: FactureCountService
  ) {}

  get showControleurView(): boolean {
    return this.authService.isControleur();
  }

  ngOnInit(): void {
    // Les anciens liens /espace-region?tab=N restent fonctionnels et sont remplacés
    // par leur route dédiée afin que les favoris partagent la nouvelle navigation.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = params.get('tab');
        if (tab === null) return;
        const index = Number(tab);
        const destination = Number.isInteger(index) ? this.anciennesRoutes[index] : undefined;
        if (!destination) return;
        const queryParams = { ...this.route.snapshot.queryParams };
        delete queryParams['tab'];
        this.router.navigate([destination], {
          relativeTo: this.route,
          queryParams,
          replaceUrl: true
        });
      });

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => {
        if (event.urlAfterRedirects.split('?')[0].endsWith('/factures-structures')) {
          this.factureCount.markSeen(this.statutsNotifiablesStructures);
        }
      });
  }
}
