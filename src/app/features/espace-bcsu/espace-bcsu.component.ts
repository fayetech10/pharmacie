import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { LettreGarantieFormComponent } from './lettre-garantie-form/lettre-garantie-form.component';
import { PatientsComponent } from '../patients/patients.component';
import { ConstatsBcsuComponent } from './constats-bcsu/constats-bcsu.component';
import { ParametrageBcsuComponent } from './parametrage-bcsu/parametrage-bcsu.component';
import { AuthService } from '../../core/services/auth.service';
import { BcsuService } from '../../core/services/bcsu.service';
import { PointageUiService } from '../../core/services/pointage-ui.service';
import { TuileActiviteComponent } from '../../shared/tuile-activite/tuile-activite.component';
import { Teinte } from '../../shared/teintes';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

/**
 * Espace de l'agent BCSU, organisé comme celui du poste de santé : un accueil à tuiles,
 * puis un écran par activité, chacun avec son retour à l'accueil.
 *
 * 0 Accueil · 1 Nouvelle lettre de garantie · 2 Patients enregistrés · 3 Constats ·
 * 4 Paramétrage — piloté par la sidebar (?tab=).
 *
 * <p>L'accueil porte aussi le bouton « Lettres du mois » : le registre PDF des lettres de
 * l'agent pour un mois (N° de lettre, nom, prénom).</p>
 */
@Component({
  selector: 'app-espace-bcsu',
  standalone: true,
  imports: [
    CommonModule, FormsModule, LettreGarantieFormComponent, PatientsComponent,
    ConstatsBcsuComponent, ParametrageBcsuComponent, MatIconModule, MatButtonModule, MatProgressSpinnerModule,
    MatSnackBarModule, TuileActiviteComponent
  ],
  templateUrl: './espace-bcsu.component.html'
})
export class EspaceBcsuComponent implements OnInit {
  currentUser: any = null;
  selectedTab = 0;

  /** Les quatre activités de l'agent, dans l'ordre de l'accueil et de la sidebar. */
  readonly activites: { tab: number; titre: string; icone: string; teinte: Teinte; description: string }[] = [
    { tab: 1, titre: 'Nouvelle lettre de garantie', icone: 'note_add', teinte: 'primary',
      description: "Contrôler l'éligibilité du bénéficiaire et générer sa lettre de garantie." },
    { tab: 2, titre: 'Patients enregistrés', icone: 'groups', teinte: 'blue',
      description: 'Retrouver un bénéficiaire, ses lettres, bons de commande et factures.' },
    { tab: 3, titre: 'Constats', icone: 'fact_check', teinte: 'amber',
      description: 'Signaler une difficulté rencontrée pour un régime dans la structure.' },
    { tab: 4, titre: 'Paramétrage', icone: 'tune', teinte: 'slate',
      description: 'Cachet et signature apposés sur vos lettres de garantie.' }
  ];

  // ----- Registre du mois (PDF) -----
  readonly moisLibelles = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  /** L'année en cours et les deux précédentes. */
  readonly anneesRegistre = [0, 1, 2].map(n => new Date().getFullYear() - n);
  modalRegistre = false;
  registreMois = new Date().getMonth() + 1;
  registreAnnee = new Date().getFullYear();
  generationRegistre = false;

  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private bcsuService = inject(BcsuService);
  private snackBar = inject(MatSnackBar);
  private pointageUi = inject(PointageUiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab >= 0 && tab <= 4 ? tab : 0;
      });
  }

  changerOnglet(index: number) {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: index }, replaceUrl: true });
  }

  /** Ouvre la modale de pointage de départ, affichée par le MainLayout. */
  ouvrirDepartModal() {
    this.pointageUi.requestDepart();
  }

  // ══════════════════════════ registre du mois ══════════════════════════

  ouvrirRegistre() {
    this.modalRegistre = true;
  }

  fermerRegistre() {
    if (!this.generationRegistre) this.modalRegistre = false;
  }

  /** Génère le registre PDF du mois choisi et l'ouvre dans un nouvel onglet (téléchargement si bloqué). */
  genererRegistre() {
    const mois = this.registreMois;
    const annee = this.registreAnnee;
    this.generationRegistre = true;
    this.bcsuService.exportRegistreLettresGarantiePdf(mois, annee).subscribe({
      next: blob => {
        this.generationRegistre = false;
        this.modalRegistre = false;
        const url = window.URL.createObjectURL(blob);
        if (!window.open(url, '_blank')) {
          const a = document.createElement('a');
          a.href = url;
          a.download = `Registre_Lettres_Garantie_${annee}-${String(mois).padStart(2, '0')}.pdf`;
          a.click();
        }
        setTimeout(() => window.URL.revokeObjectURL(url), 10000);
      },
      error: err => {
        this.generationRegistre = false;
        this.snackBar.open('Génération du registre impossible : ' + (err.error?.message || err.message), 'Fermer',
          { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }
}
