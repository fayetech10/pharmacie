import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HorsCsuService } from '../../core/services/hors-csu.service';
import { ResultatImport, TarifHorsCsu } from '../../core/models/referentiel.model';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';
import { normaliser, telecharger } from '../espace-poste/poste-facturation';

/** Liste nationale réservée aux postes de santé (cf. ServiceHorsCsu.POSTES côté serveur). */
const POSTES = 'PS';

/**
 * Prestations par défaut des postes de santé (liste fournie le 14/10/2026) : catalogue national
 * que TOUS les postes reçoivent, et eux seuls. Une prestation tarifée ici est facturable d'office
 * par chaque poste ; sans prix, elle lui est proposée et devient facturable dès qu'il fixe le sien
 * (écran Paramètres du poste). Administrée par import Excel « Service | Prestation | Prix (FCFA) ».
 */
@Component({
  selector: 'app-prestations-postes',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './prestations-postes.component.html'
})
export class PrestationsPostesComponent implements OnInit {
  prestations: TarifHorsCsu[] = [];
  /** Après recherche et filtre — champ (pas getter) : la pagination le lit à chaque cycle. */
  affichees: TarifHorsCsu[] = [];
  services: string[] = [];
  recherche = '';
  filtreService = '';
  sansPrixSeulement = false;

  chargement = true;
  importEnCours = false;
  resultatImport: ResultatImport | null = null;

  @ViewChild('pg') pg?: PaginationComponent;

  constructor(private horsCsu: HorsCsuService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.horsCsu.getPrestationsParDefautPostes().subscribe({
      next: liste => {
        this.prestations = liste || [];
        this.services = [...new Set(this.prestations.map(p => p.categorie || '').filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'fr'));
        this.filtrer(false);
        this.chargement = false;
      },
      error: err => { this.chargement = false; this.erreur(err); }
    });
  }

  filtrer(revenirAuDebut = true): void {
    const terme = normaliser(this.recherche);
    this.affichees = this.prestations.filter(p =>
      (!this.filtreService || p.categorie === this.filtreService)
      && (!this.sansPrixSeulement || !p.prix)
      && (!terme || normaliser(p.designation).includes(terme)));
    if (revenirAuDebut) this.pg?.aller(0);
  }

  get actives(): TarifHorsCsu[] {
    return this.prestations.filter(p => p.actif);
  }

  get nbTarifees(): number {
    return this.actives.filter(p => p.prix > 0).length;
  }

  get nbATarifer(): number {
    return this.actives.filter(p => !p.prix).length;
  }

  telechargerModele(): void {
    this.horsCsu.telechargerModeleTarifs(POSTES).subscribe({
      next: blob => telecharger(blob, 'prestations_par_defaut_postes.xlsx'),
      error: err => this.erreur(err)
    });
  }

  importer(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fichier = input.files?.[0];
    input.value = '';
    if (!fichier) return;
    this.importEnCours = true;
    this.resultatImport = null;
    this.horsCsu.importerTarifs(fichier, undefined, POSTES).subscribe({
      next: resultat => {
        this.importEnCours = false;
        this.resultatImport = resultat;
        this.charger();
      },
      error: err => { this.importEnCours = false; this.erreur(err); }
    });
  }

  basculerActivation(p: TarifHorsCsu): void {
    this.horsCsu.basculerActivationTarif(p.id, !p.actif).subscribe({
      next: maj => {
        p.actif = maj.actif;
        this.snackBar.open(maj.actif ? 'Prestation de nouveau proposée aux postes'
          : 'Prestation retirée : les postes ne la voient plus', 'Fermer', { duration: 3000 });
      },
      error: err => this.erreur(err)
    });
  }

  trackPrestation = (_: number, p: TarifHorsCsu) => p.id;

  private erreur(err: any): void {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
