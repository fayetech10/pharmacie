import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FeuilleSoinsService } from '../../core/services/feuille-soins.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { FeuilleSoins, StatutFeuilleSoins, STATUT_FEUILLE_LABELS } from '../../core/models/feuille-soins.model';
import { Regime, REGIME_LABELS } from '../../core/models/bcsu.model';

interface LignePriseEnCharge {
  date: string;
  designation: string;
  montant: number;
}

@Component({
  selector: 'app-feuille-soins-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, MatCardModule,
    MatButtonModule, MatIconModule, MatInputModule, MatSnackBarModule
  ],
  templateUrl: './feuille-soins-detail.component.html',
  styleUrls: ['./feuille-soins-detail.component.css']
})
export class FeuilleSoinsDetailComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly statutLabels = STATUT_FEUILLE_LABELS;
  readonly StatutFeuilleSoins = StatutFeuilleSoins;

  /** Colonnes du tableau des régimes du formulaire papier. */
  readonly colonnesRegime = ['Classique', 'CMU élèves', 'CMU Daara', 'Femmes enceintes', 'Enfant de 0-5 ans', 'BSF', 'CEC', 'PLAN SESAME'];

  feuille: FeuilleSoins | null = null;
  loading = true;
  busy = false;

  /** Tonalité sémantique du badge de statut (classe CSS scoped). */
  statutTone(statut: StatutFeuilleSoins): string {
    switch (statut) {
      case StatutFeuilleSoins.FACTUREE: return 'success';
      case StatutFeuilleSoins.DEPOSEE_STRUCTURE: return 'warn';
      case StatutFeuilleSoins.ANNULEE: return 'danger';
      case StatutFeuilleSoins.EMISE: return 'info';
      default: return 'neutral';
    }
  }

  /** Structure sanitaire : saisie de la prise en charge. */
  editionPriseEnCharge = false;
  lignes: LignePriseEnCharge[] = [];
  diagnosticStructure = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private feuilleService: FeuilleSoinsService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    public authService: AuthService
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    const imprimer = this.route.snapshot.queryParamMap.get('imprimer') === '1';
    this.feuilleService.getById(id).subscribe({
      next: (feuille) => {
        this.feuille = feuille;
        this.loading = false;
        // Après délivrance : ouverture immédiate du PDF à remettre au patient.
        if (imprimer) this.imprimerPdf();
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Feuille de soins introuvable', 'Fermer', { duration: 3000 });
        this.router.navigate(['/dashboard/feuilles-soins']);
      }
    });
  }

  // ----- Droits -----
  get isBcsuOuAdmin(): boolean {
    return this.authService.isBcsu() || this.authService.isAdmin();
  }
  get isStructure(): boolean {
    return this.authService.isStructureSanitaire();
  }
  get peutAnnuler(): boolean {
    return this.isBcsuOuAdmin && !!this.feuille
      && this.feuille.statut !== StatutFeuilleSoins.ANNULEE
      && this.feuille.statut !== StatutFeuilleSoins.FACTUREE;
  }
  get peutRemplirPriseEnCharge(): boolean {
    return this.isStructure && !!this.feuille
      && (this.feuille.statut === StatutFeuilleSoins.EMISE || this.feuille.statut === StatutFeuilleSoins.DEPOSEE_STRUCTURE);
  }
  get peutFacturer(): boolean {
    return this.isStructure && this.feuille?.statut === StatutFeuilleSoins.DEPOSEE_STRUCTURE;
  }

  /** Colonne cochée dans le tableau des régimes (comme sur le formulaire papier). */
  get colonneRegimeCochee(): number {
    switch (this.feuille?.regime) {
      case Regime.CONTRIBUTIF: return 0;
      case Regime.NDONGO_DARA: return 2;
      case Regime.CESARIENNE: return 3;
      case Regime.ZERO_CINQ_ANS: return 4;
      case Regime.BSF: case Regime.BSF_CEC: return 5;
      case Regime.CEC: return 6;
      case Regime.SESAME: return 7;
      default: return -1;
    }
  }


  // ----- Actions -----
  imprimerPdf() {
    if (!this.feuille) return;
    this.feuilleService.exportPdf(this.feuille.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(url), 10000);
      },
      error: (err) => this.snackBar.open('Erreur PDF : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  annuler() {
    if (!this.feuille) return;
    this.confirm.ask({
      title: 'Annuler cette feuille de soins',
      message: 'Veuillez confirmer l\'annulation. Cette action est irréversible.',
      confirmText: 'Annuler la feuille',
      danger: true
    }).subscribe(ok => {
      if (!ok || !this.feuille) return;
      this.feuilleService.annuler(this.feuille.id, 'Annulation par l\'agent BCSU').subscribe({
        next: (feuille) => {
          this.feuille = feuille;
          this.snackBar.open('Feuille de soins annulée', 'Fermer', { duration: 3000 });
        },
        error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
      });
    });
  }

  // ----- Prise en charge (structure sanitaire) -----
  ouvrirPriseEnCharge() {
    if (!this.feuille) return;
    this.diagnosticStructure = this.feuille.diagnostic || '';
    this.lignes = this.feuille.prestations.length
      ? this.feuille.prestations.map(p => ({ date: p.date, designation: p.designation, montant: p.montant }))
      : [this.nouvelleLigne()];
    this.editionPriseEnCharge = true;
  }

  private nouvelleLigne(): LignePriseEnCharge {
    return { date: new Date().toISOString().substring(0, 10), designation: '', montant: 0 };
  }

  ajouterLigne() {
    this.lignes.push(this.nouvelleLigne());
  }

  retirerLigne(i: number) {
    this.lignes.splice(i, 1);
  }

  get lignesValides(): boolean {
    return this.lignes.length > 0 && this.lignes.every(l => !!l.date && !!l.designation.trim() && l.montant >= 0);
  }

  get totalSaisi(): number {
    return this.lignes.reduce((s, l) => s + (Number(l.montant) || 0), 0);
  }

  enregistrerPriseEnCharge() {
    if (!this.feuille || !this.lignesValides || this.busy) return;
    this.busy = true;
    this.feuilleService.remplirPriseEnCharge(this.feuille.id, {
      diagnostic: this.diagnosticStructure || undefined,
      prestations: this.lignes.map(l => ({ date: l.date, designation: l.designation.trim(), montant: Number(l.montant) || 0 }))
    }).subscribe({
      next: (feuille) => {
        this.busy = false;
        this.feuille = feuille;
        this.editionPriseEnCharge = false;
        this.snackBar.open('Prise en charge enregistrée sur la feuille ' + feuille.numero, 'Fermer', { duration: 4000 });
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  /** Fin du circuit : la structure crée sa facture préremplie depuis la feuille. */
  facturer() {
    if (!this.feuille) return;
    this.router.navigate(['/dashboard/espace-structure'], { queryParams: { feuille: this.feuille.numero } });
  }
}
