import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HorsCsuService } from '../../../core/services/hors-csu.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { FactureHorsCsu, LigneHorsCsu, SituationCaisse, TarifHorsCsu } from '../../../core/models/referentiel.model';

import { Onglet, OngletsComponent } from '../../../shared/onglets/onglets.component';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';

export interface StatService {
  service: string;
  montant: number;
  nbFactures: number;
  nbActes: number;
}

@Component({
  selector: 'app-hors-csu',
  standalone: true,
  imports: [
    OngletsComponent,
    PaginationComponent,
    PaginerPipe,
    CommonModule,
    FormsModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './hors-csu.component.html'
})
export class HorsCsuComponent implements OnInit {

  readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  readonly mois = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  readonly modesPaiement = ['Espèces', 'Mobile money', 'Chèque', 'Virement'];

  readonly onglets: Onglet<'facturation' | 'factures'>[] = [
    { cle: 'facturation', libelle: 'Nouvelle facture & Caisse', icone: 'point_of_sale' },
    { cle: 'factures', libelle: 'Factures du mois par service', icone: 'receipt_long' }
  ];
  ongletActif: 'facturation' | 'factures' = 'facturation';

  tarifs: TarifHorsCsu[] = [];
  factures: FactureHorsCsu[] = [];
  situationJour?: SituationCaisse;
  situationMois?: SituationCaisse;
  chargement = true;

  // ----- Saisie en cours -----
  patientNom = '';
  patientPrenom = '';
  patientTelephone = '';
  modePaiement = 'Espèces';
  panier: LigneHorsCsu[] = [];
  serviceSelectionne = '';
  tarifSelectionne = '';
  quantite = 1;
  enregistrement = false;

  // ----- Filtres mois & service -----
  filtreMois = new Date().getMonth() + 1;
  filtreAnnee = new Date().getFullYear();
  filtreService = '';
  recherche = '';

  constructor(
    private horsCsu: HorsCsuService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.charger();
  }

  charger(): void {
    this.chargement = true;
    this.horsCsu.getTarifsApplicables().subscribe({
      next: tarifs => this.tarifs = tarifs || [],
      error: err => this.erreur(err)
    });
    this.horsCsu.getFactures().subscribe({
      next: factures => { this.factures = factures || []; this.chargement = false; },
      error: err => { this.chargement = false; this.erreur(err); }
    });
    this.rafraichirSituations();
  }

  rafraichirSituations(): void {
    this.horsCsu.situationJournaliere().subscribe({
      next: s => this.situationJour = s,
      error: () => this.situationJour = undefined
    });
    this.horsCsu.situationMensuelle(this.filtreMois, this.filtreAnnee).subscribe({
      next: s => this.situationMois = s,
      error: () => this.situationMois = undefined
    });
  }

  // ══════════════════════════ Référentiel & Saisie ══════════════════════════

  get servicesDisponibles(): string[] {
    const services = new Set<string>();
    this.tarifs.forEach(t => {
      if (t.categorie?.trim()) services.add(t.categorie.trim());
    });
    return Array.from(services).sort();
  }

  get tarifsFiltres(): TarifHorsCsu[] {
    if (!this.serviceSelectionne) return this.tarifs;
    return this.tarifs.filter(t => t.categorie === this.serviceSelectionne);
  }

  ajouterAuPanier(): void {
    const tarif = this.tarifs.find(t => t.id === this.tarifSelectionne);
    if (!tarif) {
      this.snackBar.open('Sélectionnez une prestation.', 'Fermer', { duration: 3000 });
      return;
    }
    const quantite = Math.max(1, Number(this.quantite) || 1);
    const existante = this.panier.find(l => l.tarifId === tarif.id);
    if (existante) {
      existante.quantite += quantite;
      existante.montant = existante.quantite * existante.prixUnitaire;
    } else {
      this.panier.push({
        tarifId: tarif.id,
        code: tarif.code,
        designation: tarif.designation,
        categorie: tarif.categorie,
        quantite,
        prixUnitaire: tarif.prix,
        montant: quantite * tarif.prix
      });
    }
    this.tarifSelectionne = '';
    this.quantite = 1;
  }

  retirerDuPanier(index: number): void {
    this.panier.splice(index, 1);
  }

  get totalPanier(): number {
    return this.panier.reduce((somme, ligne) => somme + (ligne.montant || 0), 0);
  }

  encaisser(): void {
    if (this.panier.length === 0) {
      this.snackBar.open('Ajoutez au moins une prestation avant d\'encaisser.', 'Fermer', { duration: 4000 });
      return;
    }
    this.enregistrement = true;
    this.horsCsu.encaisser({
      patientNom: this.patientNom,
      patientPrenom: this.patientPrenom,
      patientTelephone: this.patientTelephone,
      modePaiement: this.modePaiement,
      montantEncaisse: this.totalPanier,
      lignes: this.panier
    }).subscribe({
      next: facture => {
        this.enregistrement = false;
        this.snackBar.open(`Facture ${facture.numero} encaissée`, 'Fermer', { duration: 4000 });
        this.reinitialiserSaisie();
        this.charger();
        this.telechargerRecu(facture);
      },
      error: err => { this.enregistrement = false; this.erreur(err); }
    });
  }

  reinitialiserSaisie(): void {
    this.patientNom = '';
    this.patientPrenom = '';
    this.patientTelephone = '';
    this.panier = [];
    this.serviceSelectionne = '';
    this.tarifSelectionne = '';
    this.quantite = 1;
  }

  // ══════════════════════════ Onglet Factures par Service ══════════════════════════

  /** Factures appartenant au mois et à l'année sélectionnés */
  get facturesDuMois(): FactureHorsCsu[] {
    return this.factures.filter(f => {
      if (!f.date) return false;
      const [anneeStr, moisStr] = f.date.split('-');
      return Number(anneeStr) === Number(this.filtreAnnee) && Number(moisStr) === Number(this.filtreMois);
    });
  }

  /** Services présents dans les factures du mois sélectionné */
  get servicesDuMois(): string[] {
    const set = new Set<string>();
    this.facturesDuMois.forEach(f => {
      (f.lignes || []).forEach(l => {
        if (l.categorie?.trim()) {
          set.add(l.categorie.trim());
        } else {
          set.add('Autres');
        }
      });
    });
    this.servicesDisponibles.forEach(s => set.add(s));
    return Array.from(set).sort();
  }

  /** Statistiques groupées par service pour le mois sélectionné */
  get statsParServiceDuMois(): StatService[] {
    const map = new Map<string, { montant: number; nbFactures: Set<string>; nbActes: number }>();
    this.facturesDuMois.forEach(f => {
      if (f.annulee) return;
      (f.lignes || []).forEach(l => {
        const s = (l.categorie?.trim()) || 'Autres';
        if (!map.has(s)) {
          map.set(s, { montant: 0, nbFactures: new Set(), nbActes: 0 });
        }
        const item = map.get(s)!;
        item.montant += l.montant || (l.quantite * l.prixUnitaire) || 0;
        item.nbActes += l.quantite || 1;
        item.nbFactures.add(f.id);
      });
    });

    const stats: StatService[] = [];
    map.forEach((val, key) => {
      stats.push({
        service: key,
        montant: val.montant,
        nbFactures: val.nbFactures.size,
        nbActes: val.nbActes
      });
    });
    return stats.sort((a, b) => b.montant - a.montant);
  }

  /** Total facturé sur le mois sélectionné (hors factures annulées) */
  get totalMoisFacture(): number {
    return this.facturesDuMois
      .filter(f => !f.annulee)
      .reduce((acc, f) => acc + (f.montantTotal || 0), 0);
  }

  /** Factures filtrées par service et recherche texte */
  get facturesFiltrees(): FactureHorsCsu[] {
    return this.facturesDuMois.filter(f => {
      if (this.filtreService) {
        const lignes = f.lignes || [];
        const matchService = lignes.some(l => {
          const cat = (l.categorie?.trim()) || 'Autres';
          return cat.toLowerCase() === this.filtreService.toLowerCase();
        });
        if (!matchService) return false;
      }
      if (this.recherche.trim()) {
        const q = this.recherche.trim().toLowerCase();
        const num = (f.numero || '').toLowerCase();
        const patient = `${f.patientPrenom || ''} ${f.patientNom || ''}`.toLowerCase();
        const tel = (f.patientTelephone || '').toLowerCase();
        if (!num.includes(q) && !patient.includes(q) && !tel.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }

  servicesDeFacture(f: FactureHorsCsu): string[] {
    const set = new Set<string>();
    (f.lignes || []).forEach(l => {
      if (l.categorie?.trim()) set.add(l.categorie.trim());
    });
    return Array.from(set);
  }

  detailPrestationsFacture(f: FactureHorsCsu): string {
    return (f.lignes || []).map(l => `${l.designation} (x${l.quantite})`).join(', ');
  }

  // ══════════════════════════ Historique & Actions ══════════════════════════

  /** Réimpression (§8) : le reçu est régénéré côté serveur, jamais archivé. */
  telechargerRecu(facture: FactureHorsCsu): void {
    this.horsCsu.telechargerRecu(facture.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `recu_${facture.numero}.pdf`;
        lien.click();
        URL.revokeObjectURL(url);
      },
      error: err => this.erreur(err)
    });
  }

  annuler(facture: FactureHorsCsu): void {
    this.confirm.prompt({
      title: 'Annuler la facture',
      message: `Facture ${facture.numero} — ${facture.montantTotal} FCFA. `
        + `Elle restera visible dans la situation de caisse, marquée annulée.`,
      label: 'Motif de l\'annulation',
      required: true,
      multiline: true,
      danger: true,
      confirmText: 'Annuler la facture'
    }).subscribe(motif => {
      if (!motif) return;
      this.horsCsu.annuler(facture.id, motif).subscribe({
        next: () => {
          this.snackBar.open('Facture annulée', 'Fermer', { duration: 3000 });
          this.charger();
        },
        error: err => this.erreur(err)
      });
    });
  }

  patientLibelle(facture: FactureHorsCsu): string {
    const nom = `${facture.patientPrenom || ''} ${facture.patientNom || ''}`.trim();
    return nom || 'Patient non renseigné';
  }

  cles(objet?: Record<string, number>): string[] {
    return objet ? Object.keys(objet).filter(cle => objet[cle] > 0) : [];
  }

  trackFacture = (_: number, f: FactureHorsCsu) => f.id;

  private erreur(err: any): void {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
