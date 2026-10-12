import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Observable } from 'rxjs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DistrictService } from '../../core/services/district.service';
import { Region, RegionService } from '../../core/services/region.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { AuthService } from '../../core/services/auth.service';
import { District, StructureConsolidee } from '../../core/models/referentiel.model';

import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';
/**
 * Districts sanitaires (§6 du document).
 *
 * <p>Le district s'intercale entre la structure et la région : c'est la maille de
 * consolidation du §9. Une structure sans district n'apparaît dans aucune situation
 * globale, d'où l'affichage du nombre de structures rattachées en regard de chacun.</p>
 */
@Component({
  selector: 'app-districts',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './districts.component.html'
})
export class DistrictsComponent implements OnInit {

  districts: District[] = [];
  regions: Region[] = [];
  /** Structures par district, chargées à la demande quand on déplie une ligne. */
  structures = new Map<string, StructureConsolidee[]>();
  deplies = new Set<string>();
  chargement = true;

  filtreRegion = '';
  edition?: Partial<District>;
  enregistrement = false;
  /** Création : le district est aussi un centre de santé (créé en même temps, siège du district). */
  avecCentre = false;
  nomCentre = '';

  /** Nom proposé pour le centre : « District sanitaire de X » → « Centre de santé de X ». */
  get nomCentrePropose(): string {
    const nom = (this.edition?.nom || '').trim();
    const reste = nom.replace(/^district\s+sanitaire\s*/i, '').trim();
    if (!nom) return 'Centre de santé de …';
    return reste !== nom ? (reste ? `Centre de santé ${reste}` : 'Centre de santé') : `Centre de santé de ${nom}`;
  }

  constructor(
    private districtService: DistrictService,
    private regionService: RegionService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar,
    private auth: AuthService
  ) {}

  /**
   * Région imposée à un service régional : il configure les districts de SA région
   * (cahier « Espace PS », §2) — le serveur l'impose de toute façon.
   */
  get regionImposee(): string | null {
    return this.auth.isServiceRegional() ? (this.auth.getCurrentUser()?.regionId || null) : null;
  }

  ngOnInit(): void {
    if (this.regionImposee) this.filtreRegion = this.regionImposee;
    this.regionService.getAll().subscribe({
      next: regions => this.regions = regions || [],
      error: err => this.erreur(err)
    });
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.districtService.getDistricts(this.filtreRegion || undefined).subscribe({
      next: districts => { this.districts = districts || []; this.chargement = false; },
      error: err => { this.chargement = false; this.erreur(err); }
    });
  }

  // ══════════════════════════ dépliage ══════════════════════════

  basculer(district: District): void {
    if (this.deplies.delete(district.id)) {
      return;
    }
    this.deplies.add(district.id);
    if (!this.structures.has(district.id)) {
      this.districtService.getStructures(district.id).subscribe({
        next: structures => this.structures.set(district.id, structures || []),
        error: err => this.erreur(err)
      });
    }
  }

  estDeplie(district: District): boolean {
    return this.deplies.has(district.id);
  }

  structuresDe(district: District): StructureConsolidee[] {
    return this.structures.get(district.id) || [];
  }

  // ══════════════════════════ édition ══════════════════════════

  nouveau(): void {
    this.edition = { code: '', nom: '', regionId: this.regionImposee || this.filtreRegion || undefined, actif: true };
    this.avecCentre = false;
    this.nomCentre = '';
  }

  modifier(district: District): void {
    this.edition = { ...district };
  }

  annulerEdition(): void {
    this.edition = undefined;
  }

  enregistrer(): void {
    if (!this.edition) return;
    if (!this.edition.nom?.trim()) {
      this.snackBar.open('Le nom du district est obligatoire.', 'Fermer', { duration: 4000 });
      return;
    }
    // Code attribué par le serveur à la création ({RÉGION}DT{NN}) : on n'en envoie pas.
    if (!this.edition.id) this.edition.code = '';
    if (!this.edition.regionId) {
      this.snackBar.open('La région de rattachement est obligatoire : sans elle, le district '
        + 'sort de toutes les consolidations régionales.', 'Fermer',
        { duration: 6000, panelClass: 'error-snackbar' });
      return;
    }

    this.enregistrement = true;
    const requete: Observable<any> = this.edition.id
      ? this.districtService.modifier(this.edition.id, this.edition)
      : this.districtService.creer(this.edition, { avecCentre: this.avecCentre, nomCentre: this.nomCentre });

    requete.subscribe({
      next: (res: any) => {
        this.enregistrement = false;
        this.edition = undefined;
        this.charger();
        if (res?.centre && res?.identifiant) {
          // District + centre de santé siège : c'est le compte du centre qui pilote le district.
          this.afficherAcces(res.identifiant, res.motDePasseTemporaire, 'District et centre de santé créés',
            `Centre de santé « ${res.centre.nom} » (${res.centre.code}) créé, siège du district : `
            + 'son compte exerce aussi les fonctions du district.');
        } else if (res?.identifiant) {
          this.afficherAcces(res.identifiant, res.motDePasseTemporaire, 'Compte du district créé');
        } else {
          this.snackBar.open('District enregistré', 'Fermer', { duration: 3000 });
        }
      },
      error: err => { this.enregistrement = false; this.erreur(err); }
    });
  }

  /** Accès du district : crée son compte s'il n'en a pas, sinon remet le mot de passe par défaut. */
  acces(district: District): void {
    this.districtService.reinitialiserAcces(district.id).subscribe({
      next: a => this.afficherAcces(a.identifiant, a.motDePasseTemporaire,
        a.compteCree ? 'Compte du district créé' : 'Mot de passe réinitialisé'),
      error: err => this.erreur(err)
    });
  }

  private afficherAcces(identifiant: string, motDePasse: string, titre: string, precision?: string): void {
    this.confirm.ask({
      title: titre,
      message: (precision ? precision + '\n\n' : '')
        + `Identifiant : ${identifiant}\nMot de passe : ${motDePasse}\n\n`
        + 'À changer à la première connexion.',
      confirmText: 'Compris',
      hideCancel: true
    }).subscribe();
  }

  basculerActivation(district: District): void {
    this.districtService.basculerActivation(district.id, !district.actif).subscribe({
      next: () => this.charger(),
      error: err => this.erreur(err)
    });
  }

  // ══════════════════════════ import Excel ══════════════════════════

  importer(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    const fichier = input.files?.[0];
    if (!fichier) return;

    this.districtService.importer(fichier).subscribe({
      next: resultat => {
        input.value = '';
        const resume = `${resultat.crees} création(s), ${resultat.misAJour} mise(s) à jour`;
        if (resultat.erreurs?.length) {
          this.confirm.ask({
            title: 'Import terminé avec des erreurs',
            message: `${resume}.\n\nLignes non importées :\n` + resultat.erreurs.slice(0, 20).join('\n'),
            confirmText: 'Compris',
            hideCancel: true
          }).subscribe();
        } else {
          this.snackBar.open(`Import réussi — ${resume}`, 'Fermer', { duration: 5000 });
        }
        this.charger();
      },
      error: err => { input.value = ''; this.erreur(err); }
    });
  }

  trackDistrict = (_: number, d: District) => d.id;

  private erreur(err: any): void {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
