import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { FactureCountService, StatutCounts, statutsStructure } from '../../core/services/facture-count.service';

import { RegionalDashboardComponent } from './regional-dashboard/regional-dashboard.component';
import { SuiviEnregistrementComponent } from './suivi-enregistrement/suivi-enregistrement.component';
import { FacturesStructuresComponent } from './factures-structures/factures-structures.component';
import { FacturesPharmaciesComponent } from './factures-pharmacies/factures-pharmacies.component';
import { SuiviTraitementComponent } from './suivi-traitement/suivi-traitement.component';
import { SuiviBcsuComponent } from './suivi-bcsu/suivi-bcsu.component';
import { ParametrageSrComponent } from './parametrage-sr/parametrage-sr.component';
import { EspaceControleurComponent } from './espace-controleur/espace-controleur.component';
import { ImportFacturesComponent } from '../regional-factures/import-factures/import-factures.component';

@Component({
  selector: 'app-espace-region',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatSnackBarModule,
    RegionalDashboardComponent,
    SuiviEnregistrementComponent,
    FacturesStructuresComponent,
    FacturesPharmaciesComponent,
    SuiviTraitementComponent,
    SuiviBcsuComponent,
    ParametrageSrComponent,
    EspaceControleurComponent,
    ImportFacturesComponent
  ],
  templateUrl: './espace-region.component.html'
})
export class EspaceRegionComponent implements OnInit {
  private readonly statutsNotifiablesStructures = statutsStructure([
    'ENVOYEE',
    'A_TRAITER',
    'VALIDEE_NC',
    'REJETEE_NC'
  ]);

  /**
   * 0 = Tableau de bord
   * 1 = Suivi de l'enregistrement des prestataires
   * 2 = Factures Structures sanitaires
   * 3 = Factures Pharmacies
   * 4 = Suivi du traitement
   * 5 = Suivi BCSU
   * 6 = Paramétrage
   * 7 = Import des factures
   */
  selectedTab = 0;

  /** Rôle de l'utilisateur */
  isControleur = false;
  isAdminSR = true;

  /** Permet à l'Admin SR de basculer en vue contrôleur pour tester / traiter */
  modeControleurForce = false;

  /** Nombre de factures par statut */
  counts: StatutCounts = {};

  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public authService: AuthService,
    private factureCount: FactureCountService,
    private snackBar: MatSnackBar
  ) {}

  isTabEnDeveloppement(index: number): boolean {
    // Modules déployés et actifs :
    // 0 = Tableau de bord
    // 1 = Enregistrement prestataires
    // 6 = Paramétrage SR
    return index !== 0 && index !== 1 && index !== 6;
  }

  ngOnInit() {
    this.isControleur = this.authService.isControleur();
    this.isAdminSR = this.authService.isAdminSR();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab >= 0 && tab <= 7 ? tab : 0;
        if (this.isTabEnDeveloppement(this.selectedTab)) {
          this.snackBar.open(
            'Cette fonctionnalité est actuellement en cours de développement.',
            'Compris',
            { duration: 4000, horizontalPosition: 'center', verticalPosition: 'bottom' }
          );
        }
        if (this.selectedTab === 2) {
          this.factureCount.markSeen(this.statutsNotifiablesStructures);
        }
      });

    this.factureCount.counts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        this.counts = c;
      });
    this.factureCount.refresh();
  }

  get showControleurView(): boolean {
    return this.isControleur || this.modeControleurForce;
  }

  toggleControleurView() {
    this.modeControleurForce = !this.modeControleurForce;
  }

  onTabChange(index: number) {
    if (this.isTabEnDeveloppement(index)) {
      this.snackBar.open(
        'Cette fonctionnalité est actuellement en cours de développement.',
        'Compris',
        { duration: 4000, horizontalPosition: 'center', verticalPosition: 'bottom' }
      );
    }
    if (index === 2) {
      this.factureCount.markSeen(this.statutsNotifiablesStructures);
    }
    const currentTab = +(this.route.snapshot.queryParamMap.get('tab') ?? 0);
    if (index === currentTab) return;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }

  get notifStructures(): number {
    return this.statutsNotifiablesStructures.reduce((sum, s) => sum + (this.counts[s] || 0), 0);
  }

  get notifPharmacies(): number {
    const notif = ['ENVOYEE', 'A_TRAITER', 'VALIDEE_NC', 'REJETEE_NC'];
    return notif.reduce((sum, s) => sum + (this.counts[s] || 0), 0);
  }
}
