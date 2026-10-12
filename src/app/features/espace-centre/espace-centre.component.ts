import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FactureStructureFormComponent } from '../espace-structure/facture-structure-form/facture-structure-form.component';
import { FacturesStructureListComponent } from '../espace-structure/factures-structure-list/factures-structure-list.component';
import { HorsCsuComponent } from '../espace-structure/hors-csu/hors-csu.component';
import { ParametresStructureComponent } from '../espace-structure/parametres-structure/parametres-structure.component';
import { AuthService } from '../../core/services/auth.service';
import { TuileActiviteComponent } from '../../shared/tuile-activite/tuile-activite.component';
import { IndicateurComponent } from '../../shared/indicateur/indicateur.component';
import { FacturationCsuPosteComponent } from '../espace-poste/facturation-csu/facturation-csu.component';
import { MesFacturesPosteComponent } from '../espace-poste/mes-factures-poste/mes-factures-poste.component';
import { ImportFactureCentreComponent } from './import-facture-centre/import-facture-centre.component';
import { StructureService } from '../../core/services/structure.service';
import { FactureStructure } from '../../core/models/structure.model';

@Component({
  selector: 'app-espace-centre',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    FactureStructureFormComponent,
    FacturesStructureListComponent,
    HorsCsuComponent,
    ParametresStructureComponent,
    FacturationCsuPosteComponent,
    MesFacturesPosteComponent,
    ImportFactureCentreComponent,
    TuileActiviteComponent,
    IndicateurComponent
  ],
  templateUrl: './espace-centre.component.html'
})
export class EspaceCentreComponent implements OnInit {
  /** 0 = Tableau de bord · 1 = Validation Postes · 2 = Saisie Centre · 3 = Factures Centre · 4 = Hors CSU · 5 = Paramètres */
  selectedTab = 0;
  structureNom = '';

  /**
   * Le centre facture de deux façons : en identifiant lui-même le patient, comme un poste
   * (Espace PS — code d'immatriculation, pièces), ou sur lettre de garantie BCSU. Le choix
   * est mémorisé dans ce navigateur ; une arrivée depuis une feuille de soins impose la lettre.
   * Troisième mode : l'import de fin de mois, qui complète les patients saisis par le BCSU.
   */
  modeSaisie: 'espace-ps' | 'lettre' | 'import' = 'lettre';
  vueFactures: 'mois' | 'liste' = 'mois';
  
  stats = {
    totalPostesPolarises: 0,
    facturesPostesEnAttente: 0,
    facturesCentreTotal: 0,
    facturesValideesSr: 0,
    montantGlobalCsu: 0
  };
  chargementStats = true;

  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private structureService = inject(StructureService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.structureNom = user?.structureNom || 'Centre de Santé / EPS';

    this.modeSaisie = this.lirePreference('centre.modeSaisie', ['espace-ps', 'lettre', 'import'], 'lettre');
    this.vueFactures = this.lirePreference('centre.vueFactures', ['mois', 'liste'], 'mois');

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        // Onglet 1 (factures des postes) retiré : réservé au district — retour à l'accueil.
        this.selectedTab = tab >= 0 && tab <= 5 && tab !== 1 ? tab : 0;
        if (params.get('feuille')) this.modeSaisie = 'lettre';
      });

    this.chargerStatistiques();
  }

  derniereMiseAJour: Date = new Date();

  /**
   * Statistiques du centre : ses PROPRES factures seulement. Les factures des postes de santé
   * ne passent plus par le centre — leur contrôle est réservé au district (08/10/2026).
   */
  chargerStatistiques() {
    this.chargementStats = true;
    this.structureService.getFactures().subscribe({
      next: (mesFactures: FactureStructure[]) => {
        const listCentre = mesFactures || [];
        this.stats.facturesCentreTotal = listCentre.length;
        this.stats.facturesValideesSr = listCentre.filter((f: FactureStructure) => f.statut === 'VALIDEE_SR' || f.statut === 'VALIDEE_NC' || f.statut === 'PAYEE').length;
        this.stats.montantGlobalCsu = listCentre.reduce((sum: number, f: FactureStructure) => sum + (f.montantTotalSencsu || 0), 0);
        this.derniereMiseAJour = new Date();
        this.chargementStats = false;
      },
      error: () => this.chargementStats = false
    });
  }

  choisirModeSaisie(mode: 'espace-ps' | 'lettre' | 'import') {
    this.modeSaisie = mode;
    this.ecrirePreference('centre.modeSaisie', mode);
  }

  choisirVueFactures(vue: 'mois' | 'liste') {
    this.vueFactures = vue;
    this.ecrirePreference('centre.vueFactures', vue);
  }

  /** Préférence d'affichage locale : sans stockage disponible, on garde la valeur par défaut. */
  private lirePreference<T extends string>(cle: string, valeurs: T[], defaut: T): T {
    try {
      const valeur = localStorage.getItem(cle) as T | null;
      return valeur && valeurs.includes(valeur) ? valeur : defaut;
    } catch {
      return defaut;
    }
  }

  private ecrirePreference(cle: string, valeur: string) {
    try {
      localStorage.setItem(cle, valeur);
    } catch {
      // stockage indisponible (navigation privée) : la préférence ne sera pas retenue
    }
  }

  changerOnglet(index: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: index },
      replaceUrl: true
    });
  }

  imprimerRapport() {
    window.print();
  }
}
