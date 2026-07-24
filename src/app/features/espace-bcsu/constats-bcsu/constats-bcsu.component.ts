import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BcsuService } from '../../../core/services/bcsu.service';
import { Constat, Regime, REGIME_LABELS, REGIME_OPTIONS } from '../../../core/models/bcsu.model';

/**
 * Onglet « Constats » de l'espace BCSU : formulaire de saisie des constats rencontrés
 * (par régime, dans la structure) + liste des constats déjà enregistrés par l'agent.
 */
@Component({
  selector: 'app-constats-bcsu',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatCardModule, MatSnackBarModule],
  templateUrl: './constats-bcsu.component.html',
  styleUrls: ['./constats-bcsu.component.css']
})
export class ConstatsBcsuComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly regimeOptions = REGIME_OPTIONS;

  /** Formulaire de saisie d'un nouveau constat. */
  regime: Regime | '' = '';
  description = '';
  saving = false;

  /** Constats déjà enregistrés (du plus récent au plus ancien, côté backend). */
  constats: Constat[] = [];
  loading = true;

  /** Filtre d'affichage de la liste par régime. */
  filterRegime: Regime | '' = '';

  constructor(private bcsuService: BcsuService, private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.bcsuService.getConstats().subscribe({
      next: (res) => {
        this.constats = res;
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  get filteredConstats(): Constat[] {
    if (!this.filterRegime) return this.constats;
    return this.constats.filter(c => c.regime === this.filterRegime);
  }

  /**
   * Constats regroupés par régime : le cahier des charges demande que les constats
   * soient notés par régime. L'ordre des groupes suit celui de la liste de régimes,
   * et les groupes vides ne sont pas rendus.
   */
  get constatsParRegime(): { regime: Regime; label: string; constats: Constat[] }[] {
    const parRegime = new Map<string, Constat[]>();
    for (const c of this.filteredConstats) {
      const list = parRegime.get(c.regime) || [];
      list.push(c);
      parRegime.set(c.regime, list);
    }
    return this.regimeOptions
      .filter(r => parRegime.has(r))
      .map(r => ({ regime: r, label: this.regimeLabels[r], constats: parRegime.get(r)! }));
  }

  enregistrer() {
    if (!this.regime) {
      this.snackBar.open('Veuillez choisir le régime concerné', 'Fermer', { duration: 3000 });
      return;
    }
    if (!this.description.trim()) {
      this.snackBar.open('Veuillez décrire le constat', 'Fermer', { duration: 3000 });
      return;
    }

    this.saving = true;
    this.bcsuService.createConstat({ regime: this.regime, description: this.description.trim() }).subscribe({
      next: (constat) => {
        this.saving = false;
        this.constats = [constat, ...this.constats];
        this.regime = '';
        this.description = '';
        this.snackBar.open('Constat enregistré', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  supprimer(c: Constat) {
    if (!confirm('Supprimer définitivement ce constat ?')) return;
    this.bcsuService.deleteConstat(c.id).subscribe({
      next: () => {
        this.constats = this.constats.filter(x => x.id !== c.id);
        this.snackBar.open('Constat supprimé', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }
}
