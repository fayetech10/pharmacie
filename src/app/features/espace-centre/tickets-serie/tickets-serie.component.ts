import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { last } from 'rxjs/operators';

import { Regime } from '../../../core/models/bcsu.model';
import { RechercheTicket, TicketResume, VisiteTicket } from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { PhotoPieceComponent } from '../../../shared/photo-piece/photo-piece.component';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { libelleRegimePoste } from '../../espace-poste/poste-facturation';

/** Date du jour au format des champs date natifs (« aaaa-mm-jj »), en heure locale. */
function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Un ticket ajouté pendant cette série, pour le récapitulatif. */
interface TicketAjoute {
  patient: string;
  date: string;
  numero: number;
  heure: Date;
}

/**
 * Saisie des tickets de caisse en série (spécification « Facturation CS / EPS », §5) : pour
 * chaque ticket, l'identifiant du régime et la date de prise en charge retrouvent le patient
 * enregistré par le BCSU, puis la photo du ticket lui est rattachée. Un patient peut en
 * recevoir plusieurs ; sans ticket, son dossier reste « à compléter ».
 *
 * <p>Pensé pour enchaîner : la date et le régime restent d'un ticket à l'autre, l'identifiant
 * se vide et reprend le focus dès qu'un ticket est enregistré.</p>
 */
@Component({
  selector: 'app-tickets-serie',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule,
    PhotoPieceComponent, StatusBadgeComponent],
  templateUrl: './tickets-serie.component.html'
})
export class TicketsSerieComponent implements OnInit {
  @Input() regime: Regime | '' = '';
  @Output() fermer = new EventEmitter<void>();

  readonly libelleRegime = libelleRegimePoste;
  readonly regimes: Regime[] = [
    Regime.CONTRIBUTIF, Regime.BSF, Regime.CEC, Regime.SESAME, Regime.CESARIENNE, Regime.ZERO_CINQ_ANS
  ];
  readonly aujourdhui = aujourdhuiIso();

  @ViewChild('champIdentifiant') champIdentifiant?: ElementRef<HTMLInputElement>;

  identifiant = '';
  date = aujourdhuiIso();
  recherche: RechercheTicket | null = null;
  rechercheEnCours = false;
  /** Visite à laquelle la prochaine photo sera rattachée. */
  choix: VisiteTicket | null = null;
  tickets: TicketResume[] = [];
  photo: string | null = null;
  envoi = false;
  /** Ticket affiché en grand (« Voir »). */
  apercu: string | null = null;
  serie: TicketAjoute[] = [];

  constructor(
    private structureService: StructureService,
    private confirm: ConfirmService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.focaliser();
  }

  get libelleIdentifiant(): string {
    switch (this.regime) {
      case Regime.ZERO_CINQ_ANS: return 'N° CNI de l\'accompagnant';
      case Regime.SESAME:
      case Regime.CESARIENNE: return 'N° CNI';
      default: return 'N° d\'immatriculation';
    }
  }

  get pretARechercher(): boolean {
    return !!this.regime && !!this.identifiant.trim() && !!this.date && this.date <= this.aujourdhui;
  }

  changerRegime() {
    this.patientSuivant();
  }

  rechercher() {
    if (!this.pretARechercher || !this.regime) return;
    this.rechercheEnCours = true;
    this.choix = null;
    this.tickets = [];
    this.photo = null;
    this.structureService.rechercherVisitesTicket(this.regime, this.identifiant.trim(), this.date).pipe(last()).subscribe({
      next: recherche => {
        this.rechercheEnCours = false;
        this.recherche = recherche;
        // Un seul patient : on passe directement à la photo.
        if (recherche.visites.length === 1) this.choisir(recherche.visites[0]);
      },
      error: err => { this.rechercheEnCours = false; this.erreur(err); }
    });
  }

  choisir(visite: VisiteTicket) {
    this.choix = visite;
    this.photo = null;
    this.chargerTickets();
  }

  /** La photo vient d'être prise : elle part aussitôt, rattachée au patient choisi. */
  onPhoto(image: string | null) {
    this.photo = image;
    if (!image || !this.choix) return;
    const visite = this.choix;
    this.envoi = true;
    this.structureService.ajouterTicket(visite.factureId, visite.dossierId, image).subscribe({
      next: maj => {
        this.envoi = false;
        this.photo = null;
        this.choix = maj;
        this.serie.unshift({ patient: maj.patient, date: maj.date, numero: maj.tickets, heure: new Date() });
        this.chargerTickets();
        this.snackBar.open(`Ticket n°${maj.tickets} ajouté — ${maj.patient}`
          + (maj.statut === 'COMPLET' ? ' (dossier complet)' : ''), 'Fermer', { duration: 3500 });
      },
      error: err => { this.envoi = false; this.photo = null; this.erreur(err); }
    });
  }

  /** Ticket suivant : on garde le régime et la date, l'identifiant se vide et reprend le focus. */
  patientSuivant() {
    this.identifiant = '';
    this.recherche = null;
    this.choix = null;
    this.tickets = [];
    this.photo = null;
    this.focaliser();
  }

  voir(ticket: TicketResume) {
    if (!this.choix) return;
    this.structureService.ticketImage(this.choix.factureId, this.choix.dossierId, ticket.id).pipe(last()).subscribe({
      next: piece => this.apercu = piece.image,
      error: err => this.erreur(err)
    });
  }

  retirer(ticket: TicketResume, index: number) {
    const visite = this.choix;
    if (!visite) return;
    this.confirm.ask({
      title: 'Retirer ce ticket ?',
      message: `Le ticket n°${index + 1} de ${visite.patient} sera supprimé.`
        + (visite.tickets === 1 ? ' Sans ticket, son dossier redeviendra « à compléter ».' : ''),
      confirmText: 'Retirer',
      cancelText: 'Annuler'
    }).subscribe(ok => {
      if (!ok) return;
      this.structureService.retirerTicket(visite.factureId, visite.dossierId, ticket.id).subscribe({
        next: maj => { this.choix = maj; this.chargerTickets(); },
        error: err => this.erreur(err)
      });
    });
  }

  dateFr(iso?: string | null): string {
    if (!iso) return '—';
    const [a, m, j] = iso.substring(0, 10).split('-');
    return `${j}/${m}/${a}`;
  }

  datesFr(isos: string[]): string {
    return isos.map(d => this.dateFr(d)).join(', ');
  }

  private chargerTickets() {
    const visite = this.choix;
    if (!visite) return;
    this.structureService.ticketsDossier(visite.factureId, visite.dossierId).pipe(last()).subscribe({
      next: tickets => { if (this.choix?.dossierId === visite.dossierId) this.tickets = tickets; },
      error: () => this.tickets = []
    });
  }

  private focaliser() {
    setTimeout(() => this.champIdentifiant?.nativeElement.focus());
  }

  private erreur(err: any) {
    this.snackBar.open('Erreur : ' + (err?.error?.message || err?.message || 'inconnue'),
      'Fermer', { duration: 6000, panelClass: 'error-snackbar' });
  }
}
