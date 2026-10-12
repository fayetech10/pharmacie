import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Regime } from '../../../core/models/bcsu.model';
import { FactureStructure } from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { HorsLigneService } from '../../../core/hors-ligne/hors-ligne.service';
import { estErreurReseau } from '../../../core/hors-ligne/reseau.service';
import { SaisiesEnAttenteComponent } from '../../../shared/saisies-en-attente/saisies-en-attente.component';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import {
  MOIS, REGIMES_POSTE, aUnPdf, estModifiable, libelleRegimePoste, nombrePatients, telecharger
} from '../poste-facturation';

interface LigneMois {
  mois: number;
  libelle: string;
  facture: FactureStructure | null;
}

/**
 * « Mes factures » du poste de santé : régime + année → les 12 mois, facturés ou non.
 *
 * <p>Une facture par régime et par mois : c'est ce que le serveur constitue en accumulant
 * les patients. Chaque mois facturé offre, sous les trois points, Modifier (tant que la facture
 * est modifiable), Consulter, Excel et PDF (sauf enfants de moins de 5 ans) ; les autres
 * affichent « Aucune facture ».</p>
 */
@Component({
  selector: 'app-mes-factures-poste',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatMenuModule, MatSnackBarModule, MatProgressSpinnerModule,
    SaisiesEnAttenteComponent, StatusBadgeComponent],
  templateUrl: './mes-factures-poste.component.html'
})
export class MesFacturesPosteComponent implements OnInit {
  readonly libelleRegime = libelleRegimePoste;
  readonly aUnPdf = aUnPdf;
  readonly estModifiable = estModifiable;

  regime: Regime = Regime.CONTRIBUTIF;
  annee = new Date().getFullYear();
  /** 0 = toute l'année. */
  moisFiltre = 0;
  annees: number[] = [];

  /** Toutes les factures de l'année, tous régimes : sert aussi les compteurs du sélecteur. */
  private facturesAnnee: FactureStructure[] = [];
  lignes: LigneMois[] = [];
  chargement = true;
  action: string | null = null;
  /** Pas de réseau : liste relue de l'appareil (dernière connexion), actions indisponibles. */
  donneesHorsLigne = false;
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private structureService: StructureService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private horsLigne: HorsLigneService
  ) {}

  /** Formulation générale (plusieurs factures, régimes mêlés) pour les bandeaux. */
  get destinationEnvoi(): string {
    return this.auth.isPosteDeSante() ? 'au district pour le 0-5 ans, au service régional pour les autres régimes'
      : 'au service régional';
  }

  /** Destination d'UNE facture : le 0-5 ans d'un poste ou d'un centre de santé passe par le district. */
  destinationPour(facture: FactureStructure): string {
    const type = facture.typeStructure || (this.auth.isPosteDeSante() ? 'PS' : null);
    return (type === 'PS' || type === 'CS') && facture.regime === 'ZERO_CINQ_ANS' ? 'au district' : 'au service régional';
  }

  ngOnInit() {
    const courante = new Date().getFullYear();
    this.annees = [courante + 1, courante, courante - 1, courante - 2, courante - 3].filter(a => a >= 2023);
    const params = this.route.snapshot.queryParamMap;
    const regime = params.get('regime') as Regime | null;
    if (regime && Object.values(Regime).includes(regime)) this.regime = regime;
    const annee = Number(params.get('annee'));
    if (annee > 2000) this.annee = annee;
    if (!this.annees.includes(this.annee)) this.annees.push(this.annee);
    this.charger();
    // Patients enregistrés hors ligne arrivés dans leur facture : la liste se met à jour.
    this.horsLigne.saisiesEnvoyees$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.charger());
  }

  /** Régimes du poste, plus ceux d'anciennes factures de l'année (Césarienne, BSF…). */
  get regimes(): Regime[] {
    const presents = this.facturesAnnee.map(f => f.regime).filter(r => !REGIMES_POSTE.includes(r));
    return [...REGIMES_POSTE, ...Array.from(new Set(presents))];
  }

  nombreFactures(regime: Regime): number {
    return this.facturesAnnee.filter(f => f.regime === regime).length;
  }

  charger() {
    this.chargement = true;
    this.structureService.getFactures({ annee: this.annee }).subscribe({
      next: factures => {
        this.facturesAnnee = factures || [];
        this.donneesHorsLigne = false;
        this.horsLigne.memoriserFactures(this.annee, this.facturesAnnee);
        this.construire();
        this.chargement = false;
      },
      error: err => {
        if (estErreurReseau(err?.status)) {
          // Hors ligne : les factures telles qu'à la dernière connexion.
          void this.horsLigne.facturesMemorisees(this.annee).then(factures => {
            this.facturesAnnee = factures || [];
            this.donneesHorsLigne = true;
            this.construire();
            this.chargement = false;
          });
          return;
        }
        this.chargement = false;
        this.snackBar.open(err.error?.message || 'Chargement des factures impossible.', 'Fermer', { duration: 5000 });
      }
    });
  }

  changerAnnee() {
    this.charger();
  }

  /** Les 12 mois de l'année pour le régime choisi, filtrés au besoin sur un mois. */
  construire() {
    const parMois = new Map<number, FactureStructure>();
    this.facturesAnnee.filter(f => f.regime === this.regime).forEach(f => parMois.set(f.mois, f));
    this.lignes = Array.from({ length: 12 }, (_, i) => i + 1)
      .filter(m => !this.moisFiltre || m === +this.moisFiltre)
      .map(m => ({ mois: m, libelle: MOIS[m], facture: parMois.get(m) || null }));
  }

  get totalAnnee(): { montant: number; sencsu: number; patients: number } {
    return this.lignes.reduce((t, l) => ({
      montant: t.montant + (l.facture?.montantTotal || 0),
      sencsu: t.sencsu + (l.facture?.montantTotalSencsu || 0),
      patients: t.patients + this.patients(l.facture)
    }), { montant: 0, sencsu: 0, patients: 0 });
  }

  /** Patients distincts : un patient revenu plusieurs fois dans le mois compte une fois. */
  patients(facture: FactureStructure | null): number {
    return nombrePatients(facture);
  }

  aCompleter(facture: FactureStructure | null): number {
    return facture?.nombreDossiersACompleter || 0;
  }

  /**
   * Factures d'un mois déjà écoulé restées en brouillon à cause de dossiers « à compléter » :
   * la clôture mensuelle automatique les a laissées de côté (on n'envoie jamais un dossier
   * incomplet). L'agent doit les compléter puis les envoyer depuis le menu de la facture.
   */
  get facturesEnAttente(): FactureStructure[] {
    const now = new Date();
    const anneeCourante = now.getFullYear();
    const moisCourant = now.getMonth() + 1;
    return this.facturesAnnee.filter(f =>
      !f.etape
      && estModifiable(f.statut)
      && (f.nombreDossiersACompleter || 0) > 0
      && (f.annee < anneeCourante || (f.annee === anneeCourante && f.mois < moisCourant))
    );
  }

  /**
   * Centres / EPS : factures d'un mois écoulé pas encore transmises — complètes ou non. Elles
   * ne partent pas à la clôture du mois : c'est la structure qui les transmet.
   */
  get facturesATransmettre(): FactureStructure[] {
    const now = new Date();
    const anneeCourante = now.getFullYear();
    const moisCourant = now.getMonth() + 1;
    return this.facturesAnnee.filter(f =>
      !!f.etape
      && estModifiable(f.statut)
      && (f.annee < anneeCourante || (f.annee === anneeCourante && f.mois < moisCourant))
    );
  }

  /** Un export de cette facture est en cours : le bouton ⋮ affiche un sablier. */
  enCours(facture: FactureStructure): boolean {
    return !!this.action?.startsWith(facture.id + ':');
  }

  peutEnvoyer(facture: FactureStructure): boolean {
    return estModifiable(facture.statut) && (facture.lignes?.length || 0) > 0 && this.aCompleter(facture) === 0;
  }

  raisonNonEnvoi(facture: FactureStructure): string {
    if (!estModifiable(facture.statut)) return 'Facture déjà envoyée';
    if (!facture.lignes?.length) return 'Aucune prestation facturée';
    if (this.aCompleter(facture)) return `${this.aCompleter(facture)} dossier(s) patient à compléter`;
    return '';
  }

  // ─────────────── actions ───────────────

  consulter(facture: FactureStructure) {
    this.router.navigate(['/dashboard/espace-ps/factures', facture.id]);
  }

  modifier(facture: FactureStructure) {
    this.router.navigate(['/dashboard/espace-ps/factures', facture.id], { queryParams: { modifier: 1 } });
  }

  excel(facture: FactureStructure) {
    this.action = facture.id + ':excel';
    this.structureService.exportGroupeExcel(facture.structureSanitaireId, facture.regime, facture.mois, facture.annee).subscribe({
      next: blob => {
        this.action = null;
        telecharger(blob, `${facture.numero}_${this.libelleRegime(facture.regime)}_${MOIS[facture.mois]}_${facture.annee}.xlsx`);
      },
      error: () => this.echec('Export Excel impossible.')
    });
  }

  pdf(facture: FactureStructure) {
    this.action = facture.id + ':pdf';
    this.structureService.exportFacturePdf(facture.id).subscribe({
      next: blob => {
        this.action = null;
        telecharger(blob, `${facture.numero}_facture_${MOIS[facture.mois]}_${facture.annee}.pdf`);
      },
      error: () => this.echec('Génération du PDF impossible.')
    });
  }

  envoyer(facture: FactureStructure) {
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: `Envoyer la facture ${this.libelleRegime(facture.regime)} de ${MOIS[facture.mois]} ${facture.annee} `
        + `(${this.patients(facture)} patient(s), ${facture.montantTotalSencsu.toLocaleString('fr-FR')} F à la charge de la SEN-CSU) `
        + `${this.destinationPour(facture)} ? Elle ne pourra plus être modifiée, sauf rejet.`,
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.action = facture.id + ':envoi';
      this.structureService.envoyerFacture(facture.id).subscribe({
        next: () => {
          this.action = null;
          this.snackBar.open('Facture envoyée au niveau supérieur.', 'Fermer', { duration: 3500 });
          this.charger();
        },
        error: err => this.echec(err.error?.message || 'Envoi impossible.')
      });
    });
  }

  private echec(message: string) {
    this.action = null;
    this.snackBar.open(message, 'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }

  readonly moisNoms = MOIS;
}
