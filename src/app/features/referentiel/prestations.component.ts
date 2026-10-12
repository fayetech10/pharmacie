import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ReferentielService } from '../../core/services/referentiel.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { PagePrestations, Prestation, ServiceMedical } from '../../core/models/referentiel.model';

import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../shared/pagination/paginer.pipe';
/**
 * Référentiel Service → Prestation → Prix (§5 du document).
 *
 * <p>Écran d'administration du niveau central : c'est ici que sont fixés les prix que
 * toutes les structures appliqueront. Les points de soins n'y ont pas accès en écriture —
 * les laisser modifier un tarif reviendrait à leur laisser fixer leur remboursement.</p>
 *
 * <p>La recherche est paginée côté serveur : le référentiel national compte plusieurs
 * centaines d'actes, tout charger à chaque frappe serait inutilisable.</p>
 */
@Component({
  selector: 'app-prestations',
  standalone: true,
  imports: [PaginationComponent, PaginerPipe, CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './prestations.component.html'
})
export class PrestationsComponent implements OnInit {

  services: ServiceMedical[] = [];
  page?: PagePrestations;
  chargement = true;

  // Filtres
  recherche = '';
  filtreService = '';
  actifSeulement = false;
  pageCourante = 0;
  readonly taille = 25;

  /** Débounce de la recherche : une requête par pause de frappe, pas par caractère. */
  private readonly saisie$ = new Subject<string>();

  // Formulaire (création / édition)
  edition?: Partial<Prestation>;
  enregistrement = false;

  constructor(
    private referentiel: ReferentielService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.referentiel.getServices(false).subscribe({
      next: services => this.services = services || [],
      error: err => this.erreur(err)
    });
    this.saisie$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.pageCourante = 0;
      this.charger();
    });
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.referentiel.rechercher({
      serviceId: this.filtreService || undefined,
      recherche: this.recherche || undefined,
      actifSeulement: this.actifSeulement,
      page: this.pageCourante,
      taille: this.taille
    }).subscribe({
      next: page => { this.page = page; this.chargement = false; },
      error: err => { this.chargement = false; this.erreur(err); }
    });
  }

  onRecherche(): void {
    this.saisie$.next(this.recherche);
  }

  changerFiltre(): void {
    this.pageCourante = 0;
    this.charger();
  }

  /** Page demandée à la pagination : le serveur renvoie la tranche correspondante. */
  allerPage(page: number): void {
    this.pageCourante = page;
    this.charger();
  }

  nomService(serviceId?: string): string {
    return this.services.find(s => s.id === serviceId)?.nom || '—';
  }

  // ══════════════════════════ édition ══════════════════════════

  nouvelle(): void {
    this.edition = { code: '', designation: '', prix: 0, depositaire: false, actif: true };
  }

  modifier(prestation: Prestation): void {
    this.edition = { ...prestation };
  }

  annulerEdition(): void {
    this.edition = undefined;
  }

  enregistrer(): void {
    if (!this.edition) return;
    if (!this.edition.designation?.trim()) {
      this.snackBar.open('La désignation est obligatoire.', 'Fermer', { duration: 4000 });
      return;
    }
    if (this.edition.depositaire && !this.edition.medicamentId?.trim()) {
      this.snackBar.open(
        'Une prestation dépositaire doit référencer un article de stock : c\'est lui qui sera décrémenté.',
        'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
      return;
    }

    this.enregistrement = true;
    const requete = this.edition.id
      ? this.referentiel.modifier(this.edition.id, this.edition)
      : this.referentiel.creer(this.edition);

    requete.subscribe({
      next: () => {
        this.enregistrement = false;
        this.snackBar.open('Prestation enregistrée', 'Fermer', { duration: 3000 });
        this.edition = undefined;
        // Le cache alimente la saisie de facturation : le laisser périmé ferait
        // facturer les anciens prix jusqu'au prochain rechargement de page.
        this.referentiel.viderCache();
        this.charger();
      },
      error: err => { this.enregistrement = false; this.erreur(err); }
    });
  }

  basculerActivation(prestation: Prestation): void {
    this.referentiel.basculerActivation(prestation.id, !prestation.actif).subscribe({
      next: () => {
        this.referentiel.viderCache();
        this.charger();
      },
      error: err => this.erreur(err)
    });
  }

  supprimer(prestation: Prestation): void {
    this.confirm.ask({
      title: 'Supprimer la prestation',
      message: `Supprimer définitivement « ${prestation.designation} » ? `
        + `Si elle a déjà été facturée, préférez la désactiver : les factures qui la citent `
        + `deviendraient illisibles.`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.referentiel.supprimer(prestation.id).subscribe({
        next: () => {
          this.snackBar.open('Prestation supprimée', 'Fermer', { duration: 3000 });
          this.referentiel.viderCache();
          this.charger();
        },
        error: err => this.erreur(err)
      });
    });
  }

  // ══════════════════════════ import Excel (§5) ══════════════════════════

  importer(evenement: Event): void {
    const input = evenement.target as HTMLInputElement;
    const fichier = input.files?.[0];
    if (!fichier) return;

    this.referentiel.importer(fichier).subscribe({
      next: resultat => {
        input.value = '';
        const resume = `${resultat.crees} création(s), ${resultat.misAJour} mise(s) à jour`
          + (resultat.servicesCrees ? `, ${resultat.servicesCrees} service(s) créé(s)` : '');
        if (resultat.erreurs?.length) {
          // Les lignes valides sont enregistrées : on montre les fautives pour correction.
          this.confirm.ask({
            title: 'Import terminé avec des erreurs',
            message: `${resume}.\n\nLignes non importées :\n` + resultat.erreurs.slice(0, 20).join('\n')
              + (resultat.erreurs.length > 20 ? `\n… et ${resultat.erreurs.length - 20} autre(s).` : ''),
            confirmText: 'Compris',
            hideCancel: true
          }).subscribe();
        } else {
          this.snackBar.open(`Import réussi — ${resume}`, 'Fermer', { duration: 6000 });
        }
        this.referentiel.viderCache();
        this.charger();
      },
      error: err => { input.value = ''; this.erreur(err); }
    });
  }

  trackPrestation = (_: number, p: Prestation) => p.id;

  private erreur(err: any): void {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
