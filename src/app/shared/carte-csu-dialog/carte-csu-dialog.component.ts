import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CarteCsuService } from '../../core/services/carte-csu.service';
import { CarteCsu, ResultatCarteCsu, refusCategorie } from '../../core/models/carte-csu.model';
import { Regime } from '../../core/models/bcsu.model';

export interface CarteCsuDialogData {
  /** Matricule saisi par l'agent (code imprimé sur la carte CSU). */
  code: string;
  /** Régime choisi par l'agent : la catégorie de la carte doit lui correspondre. */
  regime?: Regime | null;
  regimeLibelle?: string;
}

/**
 * Vérification d'une carte CSU (poste de santé, lettre de garantie BCSU) : interroge le
 * site officiel via le serveur et montre l'identité et l'état de la carte. Rend à
 * l'appelant :
 *  - `{ carte }` si l'agent remplit le formulaire — jamais avec une carte non valide ;
 *  - `{ panne: true }` s'il continue sans vérification, ce qui n'est proposé QUE si le
 *    site est injoignable (503) — une carte introuvable ou invalide reste bloquante ;
 *  - `undefined` sinon.
 */
@Component({
  selector: 'app-carte-csu-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MatDialogModule],
  templateUrl: './carte-csu-dialog.component.html'
})
export class CarteCsuDialogComponent implements OnInit {
  chargement = true;
  erreur = '';
  /** Site carte.sencsu.sn injoignable : seul cas où l'on peut continuer sans vérifier. */
  siteEnPanne = false;
  carte: CarteCsu | null = null;

  constructor(
    public dialogRef: MatDialogRef<CarteCsuDialogComponent, ResultatCarteCsu>,
    @Inject(MAT_DIALOG_DATA) public data: CarteCsuDialogData,
    private carteCsuService: CarteCsuService
  ) {}

  ngOnInit() {
    this.verifier();
  }

  verifier() {
    this.chargement = true;
    this.erreur = '';
    this.siteEnPanne = false;
    this.carte = null;
    this.carteCsuService.verifier(this.data.code).subscribe({
      next: carte => {
        this.carte = carte;
        this.chargement = false;
      },
      error: err => {
        this.siteEnPanne = err.status === 503;
        this.erreur = err.error?.message || 'La vérification de la carte a échoué. Réessayez dans un instant.';
        this.chargement = false;
      }
    });
  }

  /** Lien vers la page officielle, pour consulter la carte telle que l'Agence l'affiche. */
  get lienOfficiel(): string {
    const code = this.carte?.codeImmatriculation || this.data.code.replace(/\s+/g, '');
    return `https://carte.sencsu.sn/?code=${encodeURIComponent(code)}`;
  }

  /**
   * Carte utilisable pour ce régime : valide ET de la bonne catégorie. Une carte classique sur
   * BSF / CEC (ou l'inverse) est refusée depuis le 19/10/2026 — ce n'était qu'un avertissement.
   */
  get utilisable(): boolean {
    return !!this.carte?.carteValide && !this.incoherence;
  }

  /** Bandeau d'état : la carte est-elle utilisable aujourd'hui, et sinon pourquoi. */
  get statut(): { classe: string; icone: string; texte: string } {
    const c = this.carte!;
    if (c.carteValide && this.incoherence) {
      return { classe: 'bg-red-50 text-red-800 border-red-200', icone: 'block', texte: this.incoherence };
    }
    if (c.carteValide) {
      return {
        classe: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icone: 'verified',
        texte: c.dateFin ? `Carte valide jusqu'au ${this.dateFr(c.dateFin)}` : 'Carte valide'
      };
    }
    if (!c.carteActive) {
      return {
        classe: 'bg-red-50 text-red-800 border-red-200',
        icone: 'block',
        texte: `Cette carte n'est plus valide : elle est ${this.libelleEtat(c.etat)}.`
      };
    }
    if (c.enPeriodeObservation) {
      return {
        classe: 'bg-amber-50 text-amber-800 border-amber-200',
        icone: 'hourglass_top',
        texte: c.dateDebutDroits
          ? `Bénéficiaire en période d'observation : la prise en charge sera ouverte le ${this.dateFr(c.dateDebutDroits)}.`
          : 'Bénéficiaire en période d\'observation : la prise en charge n\'est pas encore ouverte.'
      };
    }
    return {
      classe: 'bg-red-50 text-red-800 border-red-200',
      icone: 'event_busy',
      texte: c.dateFin
        ? `Cette carte n'est plus valide : elle a expiré le ${this.dateFr(c.dateFin)}.`
        : 'Cette carte n\'est plus valide : elle est hors de sa période de couverture.'
    };
  }

  /** La catégorie de la carte ne correspond pas au régime choisi : motif du refus, sinon null. */
  get incoherence(): string | null {
    if (!this.carte) return null;
    const motif = refusCategorie(this.carte.categorie, this.data.regime, this.data.regimeLibelle || String(this.data.regime));
    return motif ? `${motif}.` : null;
  }

  /** Une carte non valide, ou d'une autre catégorie, ne remplit jamais le formulaire. */
  remplir() {
    if (this.carte && this.utilisable) {
      this.dialogRef.close({ carte: this.carte });
    }
  }

  /** Fermer après avoir vu une carte refusée le signale à l'appelant. */
  fermer() {
    this.dialogRef.close(this.carte && !this.utilisable ? { invalide: true } : undefined);
  }

  continuerSansVerification() {
    if (this.siteEnPanne) {
      this.dialogRef.close({ panne: true });
    }
  }

  private libelleEtat(etat?: string): string {
    const e = (etat || '').toUpperCase();
    if (e.startsWith('SUSPEN')) return 'suspendue';
    if (e.startsWith('BLOQU')) return 'bloquée';
    return etat ? `inactive (${etat})` : 'inactive';
  }

  dateFr(iso?: string): string {
    if (!iso) return '';
    const [annee, mois, jour] = iso.substring(0, 10).split('-');
    return `${jour}/${mois}/${annee}`;
  }
}
