import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HorsCsuService } from '../../../core/services/hors-csu.service';
import { ResultatImport, SERVICES_PAR_DEFAUT, TarifHorsCsu } from '../../../core/models/referentiel.model';

import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
/** Services proposés à la saisie ; la liste s'enrichit de ceux que la structure a déjà créés. */
/**
 * Paramétrage du point de soins : la liste des prestations et services qu'il propose, avec
 * leurs prix (cahier des charges « Poste de Santé », §3).
 *
 * <p>Une seule liste sert toute la structure : la facturation CSU (catalogue de prestations
 * de l'assistant, liste « Dépositaire » des centres) et la caisse Hors CSU. Une prestation
 * saisie en cours de facturation sans exister ici y est ajoutée automatiquement.</p>
 *
 * <p>Le catalogue national (prix 0) sert de liste de départ : y fixer un prix crée une
 * ligne <b>au nom de la structure</b>, qui prime sur la nationale sans la modifier — c'est
 * ce qui permet à deux postes d'avoir deux prix sur la même prestation.</p>
 */
@Component({
  selector: 'app-parametres-structure',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './parametres-structure.component.html'
})
export class ParametresStructureComponent implements OnInit {

  mesTarifs: TarifHorsCsu[] = [];
  tarifsCharges = false;

  recherche = '';
  filtreService = '';

  nouveauCode = '';
  nouvelleDesignation = '';
  nouvelleCategorie = 'Consultation';
  nouveauPrix: number | null = null;
  creationTarif = false;

  /** Lignes en cours de modification, avec leur état d'origine pour « Annuler ». */
  private enEdition = new Map<string, Pick<TarifHorsCsu, 'designation' | 'categorie' | 'prix'>>();
  enregistrement: string | null = null;

  importEnCours = false;
  resultatImport: ResultatImport | null = null;

  constructor(private horsCsu: HorsCsuService, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    this.chargerMesTarifs();
  }

  chargerMesTarifs(): void {
    this.horsCsu.getMesTarifs().subscribe({
      next: tarifs => { this.mesTarifs = tarifs || []; this.tarifsCharges = true; },
      error: err => { this.tarifsCharges = true; this.erreur(err); }
    });
  }

  /** Services connus : ceux par défaut et ceux déjà employés par la structure. */
  get services(): string[] {
    const employes = this.mesTarifs.map(t => (t.categorie || '').trim()).filter(Boolean);
    return Array.from(new Set([...SERVICES_PAR_DEFAUT, ...employes])).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  get tarifsFiltres(): TarifHorsCsu[] {
    const terme = this.recherche.trim().toLowerCase();
    return this.mesTarifs.filter(t =>
      (!this.filtreService || (t.categorie || '') === this.filtreService)
      && (!terme || t.designation.toLowerCase().includes(terme) || t.code.toLowerCase().includes(terme)));
  }

  get nombreActifs(): number {
    return this.mesTarifs.filter(t => t.actif).length;
  }

  /** Prestation ajoutée à la main, avec son service et son prix. */
  ajouterTarif(): void {
    const designation = this.nouvelleDesignation.trim();
    if (!designation) {
      this.snackBar.open('Le nom de la prestation est obligatoire.', 'Fermer', { duration: 3000 });
      return;
    }
    if (this.nouveauPrix == null || this.nouveauPrix < 0) {
      this.snackBar.open('Indiquez un prix (0 ou plus).', 'Fermer', { duration: 3000 });
      return;
    }
    if (this.mesTarifs.some(t => t.designation.trim().toLowerCase() === designation.toLowerCase())) {
      this.snackBar.open(`« ${designation} » figure déjà dans votre liste : modifiez-la plutôt.`, 'Fermer', { duration: 4000 });
      return;
    }
    // Code laissé vide : on le dérive de la désignation, comme le fait l'import Excel.
    const code = (this.nouveauCode.trim() || designation)
      .normalize('NFD').replace(/\p{M}/gu, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    this.creationTarif = true;
    // structureId n'est pas envoyé : le serveur impose le périmètre de l'appelant.
    this.horsCsu.creerTarif({
      code,
      designation,
      categorie: this.nouvelleCategorie.trim() || undefined,
      prix: this.nouveauPrix,
      actif: true
    }).subscribe({
      next: () => {
        this.creationTarif = false;
        this.snackBar.open(`« ${designation} » ajoutée à vos prestations`, 'Fermer', { duration: 3500 });
        this.nouveauCode = '';
        this.nouvelleDesignation = '';
        this.nouveauPrix = null;
        this.chargerMesTarifs();
      },
      error: err => { this.creationTarif = false; this.erreur(err); }
    });
  }

  estEnEdition(tarif: TarifHorsCsu): boolean {
    return this.enEdition.has(tarif.id);
  }

  modifier(tarif: TarifHorsCsu): void {
    this.enEdition.set(tarif.id, { designation: tarif.designation, categorie: tarif.categorie, prix: tarif.prix });
  }

  annuler(tarif: TarifHorsCsu): void {
    const origine = this.enEdition.get(tarif.id);
    if (origine) Object.assign(tarif, origine);
    this.enEdition.delete(tarif.id);
  }

  /** Enregistre le nom, le service et le prix de la prestation. */
  enregistrer(tarif: TarifHorsCsu): void {
    if (!tarif.designation?.trim()) {
      this.snackBar.open('Le nom de la prestation est obligatoire.', 'Fermer', { duration: 3000 });
      return;
    }
    if (tarif.prix == null || tarif.prix < 0) {
      this.snackBar.open('Prix invalide.', 'Fermer', { duration: 3000 });
      return;
    }
    this.enregistrement = tarif.id;
    this.horsCsu.modifierTarif(tarif.id, {
      designation: tarif.designation.trim(),
      categorie: (tarif.categorie || '').trim(),
      prix: tarif.prix
    }).subscribe({
      next: maj => {
        this.enregistrement = null;
        Object.assign(tarif, maj);
        this.enEdition.delete(tarif.id);
        this.snackBar.open('Prestation enregistrée', 'Fermer', { duration: 2500 });
      },
      error: err => { this.enregistrement = null; this.erreur(err); }
    });
  }

  basculerActivation(tarif: TarifHorsCsu): void {
    this.horsCsu.basculerActivationTarif(tarif.id, !tarif.actif).subscribe({
      next: maj => {
        tarif.actif = maj.actif;
        this.snackBar.open(maj.actif ? 'Prestation réactivée' : 'Prestation désactivée : elle n\'est plus proposée à la facturation',
          'Fermer', { duration: 3000 });
      },
      error: err => this.erreur(err)
    });
  }

  telechargerModele(): void {
    this.horsCsu.telechargerModeleTarifs().subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = 'modele_prestations.xlsx';
        lien.click();
        URL.revokeObjectURL(url);
      },
      error: err => this.erreur(err)
    });
  }

  /** Import Excel : les prestations importées sont d'office celles de la structure connectée. */
  onFichierTarifs(event: Event): void {
    const input = event.target as HTMLInputElement;
    const fichier = input.files?.[0];
    if (!fichier) return;
    this.importEnCours = true;
    this.resultatImport = null;
    this.horsCsu.importerTarifs(fichier).subscribe({
      next: resultat => {
        this.importEnCours = false;
        this.resultatImport = resultat;
        this.chargerMesTarifs();
      },
      error: err => { this.importEnCours = false; this.erreur(err); }
    });
    input.value = '';
  }

  trackTarif = (_: number, t: TarifHorsCsu) => t.id;

  private erreur(err: any): void {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
