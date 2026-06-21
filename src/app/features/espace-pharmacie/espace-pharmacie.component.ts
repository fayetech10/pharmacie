import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { FactureFormComponent } from '../factures/facture-form/facture-form.component';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';
import { StatsComponent } from '../stats/stats.component';
import { AuthService } from '../../core/services/auth.service';
import { FactureCountService, StatutCounts } from '../../core/services/facture-count.service';

@Component({
  selector: 'app-espace-pharmacie',
  standalone: true,
  imports: [CommonModule, FactureFormComponent, FacturesListComponent, StatsComponent],
  templateUrl: './espace-pharmacie.component.html',
  styleUrls: ['./espace-pharmacie.component.css']
})
export class EspacePharmacieComponent implements OnInit {
  selectedTab = 0;
  /** Factures non vues par statut (pour le badge « Mes factures »). */
  counts: StatutCounts = {};
  /**
   * Statuts qui alertent la pharmacie : uniquement les décisions du SR / du central.
   * On EXCLUT BROUILLON et ENVOYEE (actions propres de la pharmacie) — envoyer une
   * facture ne doit pas créer de badge ici, c'est le Service Régional qui la reçoit.
   */
  private readonly NOTIF_STATUSES = ['VALIDEE_SR', 'REJETEE_SR', 'VALIDEE_NC', 'REJETEE_NC', 'PAYEE'];
  private destroyRef = inject(DestroyRef);

  /** Nombre de factures non lues dont le statut a été changé par le SR ou le central. */
  get totalCount(): number {
    return this.NOTIF_STATUSES.reduce((sum, s) => sum + (this.counts[s] || 0), 0);
  }

  /** Nombre de factures rejetées non encore consultées (SR + central) pour l'affichage en rouge. */
  get rejeteeCount(): number {
    return (this.counts['REJETEE_SR'] || 0) + (this.counts['REJETEE_NC'] || 0);
  }

  constructor(
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private factureCount: FactureCountService
  ) {}

  ngOnInit() {
    // La navigation basse mobile pointe directement vers un onglet via ?tab=
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.selectedTab = +(params.get('tab') ?? 0);
        setTimeout(() => this.markActiveTabSeen(), 0);
      });
    this.factureCount.counts$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => {
        this.counts = c;
        // Une fois les compteurs chargés, on efface le badge si « Mes factures » est ouvert.
        setTimeout(() => this.markActiveTabSeen(), 0);
      });
    this.factureCount.refresh();
  }

  onTabChange(index: number) {
    const currentTab = +(this.route.snapshot.queryParamMap.get('tab') ?? 0);
    if (index === currentTab) {
      return; // Évite les navigations redondantes et les boucles infinies de routage
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }

  /** « Mes factures » (onglet 1) couvre toutes les factures. */
  private markActiveTabSeen(): void {
    if (this.selectedTab === 1) {
      this.factureCount.markSeen(['BROUILLON', 'ENVOYEE', 'VALIDEE_SR', 'REJETEE_SR', 'VALIDEE_NC', 'REJETEE_NC', 'PAYEE']);
    }
  }
}
