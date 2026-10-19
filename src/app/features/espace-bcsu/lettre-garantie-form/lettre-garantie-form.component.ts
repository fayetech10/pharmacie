import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import {
  PeriodeObservationDialogComponent
} from '../../../shared/periode-observation-dialog/periode-observation-dialog.component';
import { last } from 'rxjs/operators';

import { BcsuService } from '../../../core/services/bcsu.service';
import { CarteCsuService } from '../../../core/services/carte-csu.service';
import {
  LettreGarantie, LettreGarantieRequest, Patient, PrestationGarantie, Regime
} from '../../../core/models/bcsu.model';
import { CarteCsu, VerificationCarte, categorieCompatible } from '../../../core/models/carte-csu.model';
import { LISTE_PRESTATIONS } from '../../../core/models/prestations';
import { ocrCni, RepriseCni } from '../../../core/utils/document-ocr';
import { renderCarteAssureToDataUrl } from '../../../core/utils/carte-assure-image';
import { PhotoPieceComponent } from '../../../shared/photo-piece/photo-piece.component';
import {
  CATEGORIES_BCSU, CategoriePoste, categorieDe, controleAge, estContributif, exigeCartePoste, libelleRegimePoste
} from '../../espace-poste/poste-facturation';
import { ChampDateComponent } from '../../../shared/champ-date/champ-date.component';

type Etape = 'regime' | 'identification' | 'eligibilite' | 'termine';
type PhotoKey = 'cniRecto' | 'cniVerso' | 'carteAssureRecto' | 'autreDocument';

/** Identité du bénéficiaire telle qu'affichée et saisie. */
interface Beneficiaire {
  prenom: string;
  nom: string;
  sexe: string;
  /** « aaaa-mm-jj » (champ date natif). */
  dateNaissance: string;
  telephone: string;
  numeroCni: string;
  /** N° de la carte d'assuré (code d'immatriculation). */
  numeroAssure: string;
}

const BENEFICIAIRE_VIDE: Beneficiaire = {
  prenom: '', nom: '', sexe: '', dateNaissance: '', telephone: '', numeroCni: '', numeroAssure: ''
};

/** Date du jour au format des champs date natifs (« aaaa-mm-jj »), en heure locale. */
function aujourdhuiIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Photos de la lettre, par champ du dossier. */
const LIBELLES_PHOTOS: Record<PhotoKey, string> = {
  cniRecto: 'CNI (recto)',
  cniVerso: 'CNI (verso)',
  carteAssureRecto: 'Carte d\'assuré',
  autreDocument: 'Extrait de naissance'
};

/**
 * Lettre de garantie de l'agent BCSU, en étapes séparées :
 * Régime → Identification → Éligibilité → Validation. Le motif se choisit dans une
 * modale ouverte depuis l'éligibilité, qui génère directement la lettre (pas de récapitulatif).
 *
 * <p>Mêmes règles que le poste : le code d'immatriculation des régimes à carte est
 * contrôlé en ligne (carte expirée = blocage), le nom repris de la carte n'est plus
 * modifiable, les photos passent le contrôle de qualité. Seule différence : l'agent sert
 * aussi les centres et les EPS, donc la césarienne et les dialyses, et le parcours se
 * termine par une lettre de garantie et non par une ligne de facture.</p>
 *
 * <p>Sert aussi à modifier une lettre ({@code /lettres-garantie/:id/edit}).</p>
 */
@Component({
  selector: 'app-lettre-garantie-form',
  standalone: true,
  imports: [ChampDateComponent, CommonModule, FormsModule, RouterModule, MatIconModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatDialogModule, PhotoPieceComponent],
  templateUrl: './lettre-garantie-form.component.html'
})
export class LettreGarantieFormComponent implements OnInit {
  readonly Regime = Regime;
  readonly categories = CATEGORIES_BCSU;
  readonly libelleRegime = libelleRegimePoste;
  readonly libellesPhotos = LIBELLES_PHOTOS;
  readonly etapes: { cle: Etape; libelle: string }[] = [
    { cle: 'identification', libelle: 'Identification' },
    { cle: 'eligibilite', libelle: 'Éligibilité' },
    { cle: 'termine', libelle: 'Validation' }
  ];

  private _etape: Etape = 'regime';
  /**
   * Étape courante de l'assistant. Le setter remonte en haut du formulaire à chaque
   * changement d'étape : sinon, après un clic sur un bouton situé en bas d'une étape longue,
   * on restait défilé tout en bas de l'étape suivante. Le template garde ses `etape = '…'`.
   */
  get etape(): Etape {
    return this._etape;
  }
  set etape(valeur: Etape) {
    if (valeur === this._etape) return;
    this._etape = valeur;
    this.defilerEnHaut();
  }

  categorie: CategoriePoste | null = null;
  regime: Regime | null = null;

  /** Bloc « Préciser le régime », déroulé après le clic sur une catégorie à plusieurs régimes. */
  @ViewChild('sousChoixRegime') sousChoixRegime?: ElementRef<HTMLElement>;

  beneficiaire: Beneficiaire = { ...BENEFICIAIRE_VIDE };
  /** Patient déjà enregistré, réutilisé plutôt que dupliqué. */
  selectedPatientId: string | null = null;
  motif = '';
  /** Modale du motif, ouverte après l'éligibilité : son bouton génère la lettre. */
  modalMotif = false;
  /**
   * Date de prise en charge : aujourd'hui par défaut, jamais dans le futur. Dans un centre ou
   * un EPS, elle range le patient dans la facture de son mois et sert, avec l'identifiant du
   * régime, à le retrouver dans le fichier de facturation que la structure importe.
   */
  datePriseEnCharge = aujourdhuiIso();
  readonly aujourdhui = aujourdhuiIso();
  /** Enfants 0-5 ans : l'adulte qui accompagne l'enfant — sa CNI est la clé de rapprochement. */
  accompagnant = { nom: '', cni: '' };
  /** Enfants 0-5 ans : distingue deux enfants d'un même accompagnant vus le même jour. */
  numeroExtrait = '';

  // ----- Contrôle d'éligibilité (régimes à carte) -----
  codeImmatriculation = '';
  controleEnCours = false;
  carte: CarteCsu | null = null;
  refus = '';
  siteEnPanne = false;
  verification: VerificationCarte | null = null;
  /** Nom validé par le contrôle d'éligibilité : il n'est plus modifiable. */
  identiteVerrouillee = false;
  /** Carte d'assuré en cours de reconstitution depuis le contrôle (évite d'afficher la prise de photo). */
  carteEnGeneration = false;

  // ----- Pièces -----
  photos: Record<PhotoKey, string | null> = { cniRecto: null, cniVerso: null, carteAssureRecto: null, autreDocument: null };
  /** Recto et verso peuvent être lus en même temps : on compte les lectures en cours. */
  private lecturesCni = 0;
  private repriseCni = new RepriseCni();

  // ----- Recherche d'un patient déjà connu (régimes sans carte) -----
  recherche = '';
  resultats: Patient[] = [];
  rechercheEnCours = false;

  isEditMode = false;
  private editingId: string | null = null;
  chargement = false;
  enregistrement = false;
  resultat: LettreGarantie | null = null;

  constructor(
    private bcsuService: BcsuService,
    private carteCsuService: CarteCsuService,
    private router: Router,
    private route: ActivatedRoute,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private hote: ElementRef<HTMLElement>
  ) {}

  /**
   * Remonte en haut du formulaire après un changement d'étape. Différé (setTimeout) pour
   * s'exécuter une fois la nouvelle étape rendue ; `scrollIntoView` remonte aussi un éventuel
   * conteneur qui défile.
   */
  private defilerEnHaut() {
    setTimeout(() => {
      try {
        this.hote.nativeElement.scrollIntoView({ block: 'start', behavior: 'auto' });
      } catch { /* environnement sans scrollIntoView */ }
    });
  }

  /** Avertissement plein écran quand le bénéficiaire est en période d'observation. */
  private avertirPeriodeObservation(carte: CarteCsu) {
    this.dialog.open(PeriodeObservationDialogComponent, {
      width: '100vw', height: '100vh', maxWidth: '100vw',
      panelClass: 'dialog-periode-observation',
      data: {
        nomComplet: [carte.prenom, carte.nom].filter(Boolean).join(' ').trim(),
        dateDebutDroits: this.dateFr(carte.dateDebutDroits)
      }
    });
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEditMode = true;
      this.editingId = id;
      this.chargerLettre(id);
    }
  }

  // ══════════════════════════ état dérivé ══════════════════════════

  get carteRequise(): boolean {
    return exigeCartePoste(this.regime);
  }

  get contributif(): boolean {
    return estContributif(this.regime);
  }

  /** Plan Sésame et césarienne : la CNI est la clé de rapprochement avec la facturation de la structure. */
  get cniObligatoire(): boolean {
    return this.regime === Regime.SESAME || this.regime === Regime.CESARIENNE;
  }

  get erreurDatePriseEnCharge(): string | null {
    if (!this.datePriseEnCharge) return 'Indiquez la date de prise en charge.';
    if (this.datePriseEnCharge > this.aujourdhui) return 'La date de prise en charge ne peut pas être dans le futur.';
    return null;
  }

  get numeroEtape(): number {
    return this.etapes.findIndex(e => e.cle === this.etape);
  }

  /** Pièces d'identification demandées par le régime (hors carte d'assuré). */
  get photosIdentification(): PhotoKey[] {
    if (this.carteRequise || !this.regime) return [];
    return this.regime === Regime.ZERO_CINQ_ANS ? ['autreDocument'] : ['cniRecto', 'cniVerso'];
  }

  /** Toutes les pièces attendues dans la liasse du patient. */
  get photosAttendues(): PhotoKey[] {
    return this.carteRequise ? ['carteAssureRecto'] : this.photosIdentification;
  }

  get motifOptions(): string[] {
    switch (this.regime) {
      case Regime.ZERO_CINQ_ANS: return ['Consultation 0-5 ans', 'Hospitalisation', 'Soins infirmiers', 'Urgences'];
      case Regime.SESAME: return ['Consultation', 'Hospitalisation', 'Soins infirmiers', 'Urgences'];
      case Regime.CESARIENNE: return ['Césarienne'];
      case Regime.HEMODIALYSE: return ['Hémodialyse'];
      case Regime.DIALYSE_PERITONEALE: return ['Dialyse péritonéale'];
      default: return LISTE_PRESTATIONS;
    }
  }

  /** Conditions du régime : âge (0-5 ans, Sésame), sexe (césarienne). */
  get erreurRegime(): string | null {
    const naissance = this.beneficiaire.dateNaissance ? new Date(this.beneficiaire.dateNaissance) : null;
    if ((this.regime === Regime.ZERO_CINQ_ANS || this.regime === Regime.SESAME) && !naissance) {
      return 'La date de naissance est obligatoire : elle conditionne le contrôle d\'âge du régime.';
    }
    const age = controleAge(this.regime, naissance);
    if (age) return age;
    if (this.regime === Regime.CESARIENNE && this.beneficiaire.sexe && this.beneficiaire.sexe !== 'F') {
      return 'Régime Césarienne : la bénéficiaire doit être de sexe féminin.';
    }
    return null;
  }

  get incoherenceCategorie(): string | null {
    if (!this.carte || categorieCompatible(this.carte.categorie, this.regime) !== false) return null;
    return `La carte est de catégorie « ${this.carte.categorie} » alors que le régime choisi est « ${this.libelleRegime(this.regime)} ». Vérifiez le régime.`;
  }

  get ageCalcule(): string {
    if (!this.beneficiaire.dateNaissance) return '';
    const naissance = new Date(this.beneficiaire.dateNaissance);
    if (isNaN(naissance.getTime())) return '';
    const aujourdhui = new Date();
    let mois = (aujourdhui.getFullYear() - naissance.getFullYear()) * 12 + aujourdhui.getMonth() - naissance.getMonth();
    if (aujourdhui.getDate() < naissance.getDate()) mois--;
    if (mois < 0) return '';
    return mois < 12 ? `${mois} mois` : `${Math.floor(mois / 12)} an${mois >= 24 ? 's' : ''}`;
  }

  /** Ce qui manque à la liasse (non bloquant : la lettre reste générable). */
  get piecesManquantes(): PhotoKey[] {
    return this.photosAttendues.filter(cle => !this.photos[cle]);
  }

  // ══════════════════════════ régime ══════════════════════════

  choisirCategorie(categorie: CategoriePoste) {
    this.categorie = categorie;
    if (categorie.regimes.length === 1) {
      this.choisirRegime(categorie.regimes[0]);
    } else {
      if (!this.regime || !categorie.regimes.includes(this.regime)) {
        this.regime = null;
      }
      // Déroule le sous-choix et l'amène sous les yeux, sans scroll manuel.
      setTimeout(() => this.sousChoixRegime?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }

  choisirRegime(regime: Regime) {
    const changement = this.regime !== regime;
    const ancienneCarte = exigeCartePoste(this.regime);
    this.regime = regime;
    this.categorie = categorieDe(regime, CATEGORIES_BCSU) || null;
    if (changement) {
      if (this.isEditMode) {
        // Changer de régime change de parcours : la vérification ne vaut plus.
        if (ancienneCarte !== this.carteRequise) this.annulerVerification();
      } else {
        this.reinitialiser();
      }
      this.motif = this.motifOptions[0] || '';
    }
    this.etape = 'identification';
  }

  changerDeRegime() {
    this.etape = 'regime';
  }

  private reinitialiser() {
    this.beneficiaire = { ...BENEFICIAIRE_VIDE };
    this.selectedPatientId = null;
    this.codeImmatriculation = '';
    this.annulerVerification();
    this.photos = { cniRecto: null, cniVerso: null, carteAssureRecto: null, autreDocument: null };
    this.repriseCni.oublier();
    this.recherche = '';
    this.resultats = [];
    this.resultat = null;
    this.modalMotif = false;
    this.datePriseEnCharge = aujourdhuiIso();
    this.accompagnant = { nom: '', cni: '' };
    this.numeroExtrait = '';
  }

  private annulerVerification() {
    this.carte = null;
    this.refus = '';
    this.siteEnPanne = false;
    this.verification = null;
    this.identiteVerrouillee = false;
    this.carteEnGeneration = false;
    this.photos.carteAssureRecto = null;
  }

  // ══════════════════════════ identification ══════════════════════════

  /** Contrôle du code d'immatriculation auprès du système de gestion des assurés. */
  verifierEligibilite() {
    const code = this.codeImmatriculation.replace(/\s+/g, '').toUpperCase();
    if (!code) {
      this.snackBar.open('Saisissez le code d\'immatriculation figurant sur la carte.', 'Fermer', { duration: 3000 });
      return;
    }
    this.controleEnCours = true;
    this.refus = '';
    this.siteEnPanne = false;
    this.carte = null;
    this.carteCsuService.verifier(code).subscribe({
      next: carte => {
        this.controleEnCours = false;
        this.carte = carte;
        if (!carte.carteValide) {
          this.verification = null;
          this.refus = this.motifRefus(carte);
          if (carte.enPeriodeObservation) {
            this.avertirPeriodeObservation(carte);
          }
          return;
        }
        this.rattacherEtAppliquerCarte(carte);
      },
      error: err => {
        this.controleEnCours = false;
        this.siteEnPanne = err.status === 503;
        this.refus = this.siteEnPanne ? '' : (err.error?.message || 'Le contrôle d\'éligibilité a échoué.');
      }
    });
  }

  private motifRefus(carte: CarteCsu): string {
    if (!carte.carteActive) {
      return `Carte non valide (${(carte.etat || 'inactive').toLowerCase()}) — La prise en charge ne peut pas être accordée.`;
    }
    if (carte.enPeriodeObservation) {
      return `Bénéficiaire en période d'observation : la prise en charge ne sera ouverte que le `
        + `${this.dateFr(carte.dateDebutDroits)} — La prise en charge ne peut pas être accordée.`;
    }
    if (carte.dateDebut && new Date(carte.dateDebut) > new Date()) {
      return `Carte pas encore valide (adhésion le ${this.dateFr(carte.dateDebut)}) — La prise en charge ne peut pas être accordée.`;
    }
    return `Carte expirée${carte.dateFin ? ' le ' + this.dateFr(carte.dateFin) : ''} — La prise en charge ne peut pas être accordée.`;
  }

  /**
   * Un patient déjà enregistré avec ce n° d'assuré est réutilisé (pas de doublon).
   * Correspondance exacte uniquement : la recherche floue pourrait renvoyer un homonyme.
   */
  private rattacherEtAppliquerCarte(carte: CarteCsu) {
    const code = carte.codeImmatriculation.toUpperCase();
    this.bcsuService.searchPatients(code).subscribe({
      next: patients => {
        const existant = (patients || []).find(p => (p.numeroAssure || '').trim().toUpperCase() === code);
        this.appliquerCarte(carte, existant ?? null);
      },
      error: () => this.appliquerCarte(carte, null)
    });
  }

  /** La carte, source officielle, fait foi pour le nom ; le reste reste corrigeable. */
  private appliquerCarte(carte: CarteCsu, existant: Patient | null) {
    this.verification = 'VERIFIEE';
    this.identiteVerrouillee = true;
    this.codeImmatriculation = carte.codeImmatriculation;
    const b = this.beneficiaire;
    this.beneficiaire = {
      prenom: carte.prenom || b.prenom,
      nom: carte.nom || b.nom,
      sexe: carte.sexe || existant?.sexe || b.sexe,
      dateNaissance: (carte.dateNaissance || existant?.dateNaissance || b.dateNaissance || '').substring(0, 10),
      telephone: b.telephone || carte.telephone || existant?.telephone || '',
      numeroCni: carte.numeroPiece || existant?.numeroCni || b.numeroCni,
      numeroAssure: carte.codeImmatriculation
    };
    this.selectedPatientId = existant?.id || null;

    // Les données vérifiées constituent la carte d'assuré de la liasse.
    this.carteEnGeneration = true;
    renderCarteAssureToDataUrl(carte)
      .then(image => { if (this.carte === carte) this.photos.carteAssureRecto = image; })
      .catch(() => this.snackBar.open(
        'La carte d\'assuré n\'a pas pu être générée : photographiez-la ci-dessous.', 'Fermer', { duration: 5000 }))
      .finally(() => { if (this.carte === carte) this.carteEnGeneration = false; });

    this.snackBar.open(existant ? 'Patient déjà connu : son dossier sera complété.' : 'Informations reprises de la carte CSU.',
      'Fermer', { duration: 3500 });
    this.etape = 'eligibilite';
  }

  /** Système de vérification injoignable : seule dérogation, consignée sur la lettre. */
  continuerSansVerification() {
    this.verification = 'NON_VERIFIEE_PANNE';
    this.identiteVerrouillee = false;
    this.beneficiaire.numeroAssure = this.codeImmatriculation.replace(/\s+/g, '').toUpperCase();
    this.siteEnPanne = false;
    this.etape = 'eligibilite';
  }

  changerDeCarte() {
    this.annulerVerification();
    this.selectedPatientId = null;
    this.beneficiaire = { ...BENEFICIAIRE_VIDE, telephone: this.beneficiaire.telephone };
    this.etape = 'identification';
  }

  onPhoto(cle: PhotoKey, image: string | null) {
    this.photos[cle] = image;
  }

  get ocrEnCours(): boolean {
    return this.lecturesCni > 0;
  }

  /**
   * CNI : lecture automatique, puis recherche d'un patient déjà connu avec ce numéro. Elle ne
   * touche pas à ce que l'agent a saisi ; la bande MRZ du verso corrige une lecture du recto.
   */
  async lireCni(fichier: File) {
    this.lecturesCni++;
    try {
      const lu = await ocrCni(fichier);
      const repris = this.repriseCni.appliquer(this.beneficiaire, lu);
      this.snackBar.open(repris.length
        ? `Lu sur la CNI : ${repris.join(', ')}. Vérifiez et complétez.`
        : 'Lecture automatique sans résultat : saisissez les informations.', 'Fermer', { duration: 4500 });
      if (lu.numeroCni && !this.selectedPatientId) this.chercherPatient(lu.numeroCni, true);
    } catch {
      this.snackBar.open('Lecture automatique impossible : saisissez les informations.', 'Fermer', { duration: 4000 });
    } finally {
      this.lecturesCni--;
    }
  }

  onRecherche() {
    this.chercherPatient(this.recherche, false);
  }

  /** Patient déjà connu : par saisie (liste de choix) ou par n° de CNI lu (reprise directe). */
  private chercherPatient(terme: string, repriseDirecte: boolean) {
    if ((terme || '').trim().length < 2) {
      this.resultats = [];
      return;
    }
    this.rechercheEnCours = true;
    this.bcsuService.searchPatients(terme.trim()).subscribe({
      next: patients => {
        this.rechercheEnCours = false;
        if (repriseDirecte) {
          const meme = (patients || []).find(p => (p.numeroCni || '').trim() === terme.trim());
          if (meme) this.selectionnerPatient(meme);
          return;
        }
        this.resultats = patients || [];
      },
      error: () => { this.rechercheEnCours = false; }
    });
  }

  selectionnerPatient(patient: Patient) {
    this.selectedPatientId = patient.id || null;
    const b = this.beneficiaire;
    this.beneficiaire = {
      prenom: patient.prenom || b.prenom,
      nom: patient.nom || b.nom,
      sexe: patient.sexe || b.sexe,
      dateNaissance: (patient.dateNaissance || b.dateNaissance || '').substring(0, 10),
      telephone: patient.telephone || b.telephone,
      numeroCni: patient.numeroCni || b.numeroCni,
      numeroAssure: patient.numeroAssure || b.numeroAssure
    };
    this.resultats = [];
    this.recherche = `${patient.prenom} ${patient.nom}`;
    this.snackBar.open('Patient déjà connu : son dossier sera complété.', 'Fermer', { duration: 3000 });
  }

  oublierPatient() {
    this.selectedPatientId = null;
    this.recherche = '';
  }

  /** Identification par pièce (régimes sans carte) : on passe à l'écran patient. */
  validerIdentification() {
    const erreur = this.erreurIdentite();
    if (erreur) {
      this.snackBar.open(erreur, 'Fermer', { duration: 4000 });
      return;
    }
    this.etape = 'eligibilite';
  }

  private erreurIdentite(): string | null {
    const b = this.beneficiaire;
    if (!b.prenom.trim() || !b.nom.trim()) return 'Le prénom et le nom du bénéficiaire sont obligatoires.';
    if (this.carteRequise && !b.numeroAssure.trim()) return 'Le code d\'immatriculation est obligatoire.';
    if (this.cniObligatoire && !b.numeroCni.trim()) {
      return 'Le n° de CNI est obligatoire : c\'est lui qui rapproche le patient du fichier de facturation de la structure.';
    }
    if (this.regime === Regime.ZERO_CINQ_ANS && !this.accompagnant.cni.trim()) {
      return 'Le n° de CNI de l\'accompagnant est obligatoire : c\'est lui qui rapproche l\'enfant du fichier de facturation de la structure.';
    }
    return this.erreurRegime;
  }

  // ══════════════════════════ éligibilité → motif (modale) ══════════════════════════

  ouvrirMotif() {
    const erreur = this.erreurIdentite();
    if (erreur) {
      this.snackBar.open(erreur, 'Fermer', { duration: 4000 });
      return;
    }
    if (!this.beneficiaire.telephone.trim() || !this.beneficiaire.sexe) {
      this.snackBar.open('Le téléphone et le sexe du bénéficiaire sont obligatoires.', 'Fermer', { duration: 4000 });
      return;
    }
    if (!this.motif) this.motif = this.motifOptions[0] || '';
    this.modalMotif = true;
  }

  fermerMotif() {
    if (!this.enregistrement) this.modalMotif = false;
  }

  allerA(etape: Etape) {
    if (etape === 'termine' || this.etape === 'termine') return;
    const cible = this.etapes.findIndex(e => e.cle === etape);
    if (cible >= 0 && cible < this.numeroEtape) this.etape = etape;
  }

  // ══════════════════════════ enregistrement ══════════════════════════

  enregistrer() {
    const erreur = this.erreurIdentite();
    if (erreur || !this.regime) {
      this.snackBar.open(erreur || 'Choisissez le régime.', 'Fermer', { duration: 5000 });
      return;
    }
    if (!this.motif) {
      this.snackBar.open('Choisissez le motif de prise en charge.', 'Fermer', { duration: 3000 });
      return;
    }
    if (this.erreurDatePriseEnCharge) {
      this.snackBar.open(this.erreurDatePriseEnCharge, 'Fermer', { duration: 4000 });
      return;
    }
    const b = this.beneficiaire;
    const enfant = this.regime === Regime.ZERO_CINQ_ANS;
    const prestations: PrestationGarantie[] = [{
      designation: this.motif,
      datePriseEnCharge: this.datePriseEnCharge,
      montant: 0,
      montantBeneficiaire: 0,
      montantSencsu: 0
    }];
    const requete: LettreGarantieRequest = {
      patientId: this.selectedPatientId || undefined,
      nom: b.nom.trim(),
      prenom: b.prenom.trim(),
      telephone: b.telephone.trim(),
      regime: this.regime,
      sexe: b.sexe || undefined,
      numeroCni: b.numeroCni.trim() || undefined,
      numeroAssure: b.numeroAssure.trim() || undefined,
      dateNaissance: b.dateNaissance || undefined,
      prestations,
      cniRecto: this.photos.cniRecto || undefined,
      cniVerso: this.photos.cniVerso || undefined,
      carteAssureRecto: this.photos.carteAssureRecto || undefined,
      autreDocument: this.photos.autreDocument || undefined,
      autreDocumentTitre: this.photos.autreDocument ? 'Extrait de naissance' : undefined,
      // Mention du dossier : carte vérifiée, ou non vérifiée pour cause de panne du site.
      verificationCarte: this.carteRequise ? (this.verification ?? undefined) : undefined,
      datePriseEnCharge: this.datePriseEnCharge,
      accompagnantNom: enfant ? this.accompagnant.nom.trim() || undefined : undefined,
      accompagnantCni: enfant ? this.accompagnant.cni.trim() || undefined : undefined,
      numeroExtraitNaissance: enfant ? this.numeroExtrait.trim() || undefined : undefined
    };

    this.enregistrement = true;
    const appel = this.isEditMode && this.editingId
      ? this.bcsuService.updateLettreGarantie(this.editingId, requete)
      : this.bcsuService.createLettreGarantie(requete);
    appel.subscribe({
      next: lettre => {
        this.enregistrement = false;
        this.modalMotif = false;
        if (this.isEditMode) {
          this.snackBar.open('Lettre de garantie modifiée.', 'Fermer', { duration: 3000 });
          this.router.navigate(['/dashboard/lettres-garantie', lettre.id]);
          return;
        }
        this.resultat = lettre;
        this.etape = 'termine';
      },
      error: err => {
        this.enregistrement = false;
        this.snackBar.open(err.error?.message || 'Enregistrement impossible.', 'Fermer',
          { duration: 7000, panelClass: 'error-snackbar' });
      }
    });
  }

  // ══════════════════════════ après validation ══════════════════════════

  voirLettre() {
    if (this.resultat) this.router.navigate(['/dashboard/lettres-garantie', this.resultat.id]);
  }

  patientSuivant() {
    const regime = this.regime;
    this.reinitialiser();
    this.regime = null;
    if (regime) this.choisirRegime(regime);
  }

  autreRegime() {
    this.reinitialiser();
    this.regime = null;
    this.categorie = null;
    this.etape = 'regime';
  }

  patientsEnregistres() {
    this.router.navigate(['/dashboard/espace-bcsu'], { queryParams: { tab: 2 } });
  }

  annulerModification() {
    if (this.editingId) this.router.navigate(['/dashboard/lettres-garantie', this.editingId]);
  }

  // ══════════════════════════ modification d'une lettre ══════════════════════════

  private chargerLettre(id: string) {
    this.chargement = true;
    this.bcsuService.getLettreGarantie(id).pipe(last()).subscribe({
      next: lettre => {
        this.chargement = false;
        this.regime = lettre.regime;
        this.categorie = categorieDe(lettre.regime, CATEGORIES_BCSU) || null;
        this.selectedPatientId = lettre.patientId || null;
        this.verification = (lettre.verificationCarte as VerificationCarte) || null;
        this.identiteVerrouillee = this.verification === 'VERIFIEE';
        this.motif = lettre.prestations?.[0]?.designation || this.motifOptions[0] || '';
        this.beneficiaire = {
          prenom: lettre.patientPrenom || '',
          nom: lettre.patientNom || '',
          sexe: lettre.patientSexe || '',
          dateNaissance: (lettre.patientDateNaissance || '').substring(0, 10),
          telephone: lettre.patientTelephone || '',
          numeroCni: lettre.cniNumeroOcr || '',
          numeroAssure: lettre.patientNumeroAssure || ''
        };
        this.codeImmatriculation = lettre.patientNumeroAssure || '';
        this.datePriseEnCharge = (lettre.datePriseEnCharge || lettre.prestations?.[0]?.datePriseEnCharge
          || (lettre.createdAt || '').substring(0, 10) || aujourdhuiIso()).substring(0, 10);
        this.accompagnant = { nom: lettre.accompagnantNom || '', cni: lettre.accompagnantCni || '' };
        this.numeroExtrait = lettre.numeroExtraitNaissance || '';
        this.photos = {
          cniRecto: lettre.cniRecto || null,
          cniVerso: lettre.cniVerso || null,
          carteAssureRecto: lettre.carteAssureRecto || null,
          autreDocument: lettre.autreDocument || null
        };
        this.etape = 'eligibilite';
      },
      error: err => {
        this.chargement = false;
        this.snackBar.open(err.error?.message || 'Lettre de garantie introuvable.', 'Fermer', { duration: 4000 });
      }
    });
  }

  // ══════════════════════════ utilitaires ══════════════════════════

  dateFr(iso?: string | null): string {
    if (!iso) return '';
    const [a, m, j] = iso.substring(0, 10).split('-');
    return `${j}/${m}/${a}`;
  }

  libelleSexe(sexe: string): string {
    return sexe === 'M' ? 'Masculin' : sexe === 'F' ? 'Féminin' : '—';
  }
}
