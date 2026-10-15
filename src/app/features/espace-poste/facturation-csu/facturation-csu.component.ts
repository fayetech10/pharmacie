import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { forkJoin, Observable, of } from 'rxjs';
import {
  PeriodeObservationDialogComponent
} from '../../../shared/periode-observation-dialog/periode-observation-dialog.component';
import { catchError, last, map, switchMap } from 'rxjs/operators';

import { Regime } from '../../../core/models/bcsu.model';
import { CarteCsu, categorieCompatible } from '../../../core/models/carte-csu.model';
import {
  DossierPatient, FactureStructure, FactureStructureRequest, LIBELLES_PIECES, LigneFactureStructure, TypePiece
} from '../../../core/models/structure.model';
import { SERVICES_PAR_DEFAUT, TarifHorsCsu } from '../../../core/models/referentiel.model';
import { CarteCsuService } from '../../../core/services/carte-csu.service';
import { HorsCsuService } from '../../../core/services/hors-csu.service';
import { StructureService } from '../../../core/services/structure.service';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmService } from '../../../core/services/confirm.service';
import { ocrCni, RepriseCni } from '../../../core/utils/document-ocr';
import { HorsLigneService, REGIMES_HORS_LIGNE, SaisieEnAttente } from '../../../core/hors-ligne/hors-ligne.service';
import { ReseauService, estErreurReseau } from '../../../core/hors-ligne/reseau.service';
import { PhotoPieceComponent } from '../../../shared/photo-piece/photo-piece.component';
import {
  CATEGORIES_POSTE, CategoriePoste, FORFAIT_0_5_ANS, MOIS, categorieDe, controleAge, estContributif,
  estForfaitaire, exigeCartePoste, libelleRegimePoste, nombrePatients, normaliser, piecesExigees, tauxSencsuPoste
} from '../poste-facturation';
import { ChampDateComponent } from '../../../shared/champ-date/champ-date.component';

type Etape = 'regime' | 'identification' | 'eligibilite' | 'medical' | 'termine';

/** Identité du patient telle qu'affichée et saisie. */
interface PatientSaisi {
  prenom: string;
  nom: string;
  sexe: string;
  /** « aaaa-mm-jj » (champ date natif). */
  dateNaissance: string;
  telephone: string;
  adresse: string;
  /** Code d'immatriculation, n° d'extrait de naissance ou matricule Sésame. */
  matricule: string;
  numeroCni: string;
  numeroRegistre: string;
}

/** Ligne de prestation en cours de saisie. */
interface LigneSaisie {
  service: string;
  designation: string;
  quantite: number;
  prixUnitaire: number | null;
  tarifId?: string;
  prestationId?: string;
  /** Prestation absente du paramétrage : elle y sera ajoutée à l'enregistrement. */
  nouvelle: boolean;
  /**
   * Service tapé par l'agent sur cette ligne — et non recopié de la ligne précédente. Seul
   * un service saisi exprès est reporté au paramétrage : un service hérité par simple copie
   * déplacerait la prestation sans que personne l'ait voulu.
   */
  serviceSaisi?: boolean;
  /** Ligne déjà enregistrée (modification) : ses autres champs sont renvoyés tels quels. */
  origine?: LigneFactureStructure;
}

const PATIENT_VIDE: PatientSaisi = {
  prenom: '', nom: '', sexe: '', dateNaissance: '', telephone: '', adresse: '',
  matricule: '', numeroCni: '', numeroRegistre: ''
};

/**
 * Saisie en cours, gardée quand le téléphone ouvre son appareil photo : la page passe alors
 * en arrière-plan et le téléphone la recharge souvent au retour. Le temps de l'onglet
 * seulement (sessionStorage), et effacée dès que le patient est enregistré ou la page quittée.
 */
const CLE_BROUILLON = 'espace-ps.facturation-csu.brouillon';
const DUREE_BROUILLON_MS = 30 * 60 * 1000;

interface Brouillon {
  enregistreLe: number;
  mois: number | null;
  annee: number | null;
  etape: Etape;
  regime: Regime;
  patient: PatientSaisi;
  dateSoins: string;
  codeImmatriculation: string;
  carte: CarteCsu | null;
  verification: 'VERIFIEE' | 'NON_VERIFIEE_PANNE' | null;
  identiteVerrouillee: boolean;
  pieces: Partial<Record<TypePiece, string | null>>;
  lignes: LigneSaisie[];
  /** Clé anti-doublon de la saisie : reprise telle quelle, pour qu'un renvoi soit reconnu. */
  cleSaisie?: string;
}

/**
 * Choix d'une liste déroulante : tous si la saisie est vide ou correspond déjà à un choix
 * (pour pouvoir en changer), sinon ceux qui contiennent la saisie (accents ignorés).
 */
function proposes(choix: string[], saisie: string | null | undefined): string[] {
  const terme = normaliser(saisie);
  if (!terme || choix.some(c => normaliser(c) === terme)) return choix;
  return choix.filter(c => normaliser(c).includes(terme));
}

/**
 * Facturation CSU d'un patient au poste de santé, en étapes séparées :
 * Identification → Contrôle de l'éligibilité → Informations médicales → Validation. Plus
 * d'étape « Récapitulatif » (supprimée le 07/10/2026) : on enregistre depuis les informations
 * médicales ; « Enregistrer — à compléter » suit le bouton principal de l'éligibilité et des
 * informations médicales.
 *
 * <p>Sert aussi à <b>compléter ou modifier</b> un dossier depuis « Mes factures » : avec
 * `factureId` et `dossierId`, il s'ouvre sur le dossier existant. L'identité validée par
 * le contrôle d'éligibilité y reste en lecture seule — le serveur la refuserait de toute
 * façon.</p>
 *
 * <p>Les montants affichés sont un aperçu : le serveur recalcule tout (prix du référentiel,
 * forfait, parts) à l'enregistrement.</p>
 */
@Component({
  selector: 'app-facturation-csu-poste',
  standalone: true,
  imports: [ChampDateComponent, CommonModule, FormsModule, MatIconModule, MatSnackBarModule, MatAutocompleteModule,
    MatProgressSpinnerModule, MatDialogModule, PhotoPieceComponent],
  templateUrl: './facturation-csu.component.html'
})
export class FacturationCsuPosteComponent implements OnInit, OnDestroy {
  /** Modification : facture et dossier patient existants. */
  @Input() factureId: string | null = null;
  @Input() dossierId: string | null = null;
  /** Ajout d'un patient à la facture d'un régime et d'un mois donnés (depuis « Mes factures »). */
  @Input() regimeImpose: Regime | null = null;
  @Input() mois: number | null = null;
  @Input() annee: number | null = null;
  /** Masque l'en-tête de page (quand le composant est intégré dans un autre écran). */
  @Input() integre = false;

  @Output() termine = new EventEmitter<FactureStructure>();
  @Output() annule = new EventEmitter<void>();

  /** Bloc de sous-choix du régime (ex. « Quel régime contributif ? »), déroulé après le clic sur une catégorie. */
  @ViewChild('sousChoixRegime') sousChoixRegime?: ElementRef<HTMLElement>;

  readonly Regime = Regime;
  readonly categories = CATEGORIES_POSTE;
  readonly libelleRegime = libelleRegimePoste;
  readonly libellesPieces = LIBELLES_PIECES;
  /** Patients distincts de la facture (un patient revenu dans le mois compte une fois). */
  readonly nombrePatients = nombrePatients;
  readonly forfait = FORFAIT_0_5_ANS;
  readonly moisLibelles = MOIS;
  readonly etapes: { cle: Etape; libelle: string }[] = [
    { cle: 'identification', libelle: 'Identification' },
    { cle: 'eligibilite', libelle: 'Éligibilité' },
    { cle: 'medical', libelle: 'Informations médicales' },
    { cle: 'termine', libelle: 'Validation' }
  ];

  private _etape: Etape = 'regime';
  /**
   * Étape courante de l'assistant. Passer par un setter permet de remonter en haut du
   * formulaire à chaque changement d'étape : sinon, après avoir cliqué sur un bouton situé en
   * bas d'une étape longue (ex. « Informations médicales »), on restait défilé tout en bas de
   * l'étape suivante. Le template conserve ses `etape = '…'` et `etape === '…'` tels quels.
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
  chargement = false;

  patient: PatientSaisi = { ...PATIENT_VIDE };
  dateSoins = this.aujourdhui();

  // ----- Contrôle d'éligibilité (régimes à carte) -----
  codeImmatriculation = '';
  controleEnCours = false;
  carte: CarteCsu | null = null;
  /** Message bloquant : carte expirée, suspendue, introuvable. */
  refus = '';
  siteEnPanne = false;
  verification: 'VERIFIEE' | 'NON_VERIFIEE_PANNE' | null = null;
  /**
   * Nom validé par le contrôle d'éligibilité (ou par la lettre de garantie) : il n'est
   * plus modifiable. Le reste de l'identité reste corrigeable (cahier « Espace PS », §5.2).
   */
  identiteVerrouillee = false;
  /** Dossier saisi par un centre sur lettre de garantie : la lettre identifie le patient. */
  surLettre: string | null = null;

  // ----- Pièces -----
  pieces: Partial<Record<TypePiece, string | null>> = {};
  private piecesModifiees = new Set<TypePiece>();
  /** Recto et verso peuvent être lus en même temps : on compte les lectures en cours. */
  private lecturesCni = 0;
  private repriseCni = new RepriseCni();

  // ----- Prestations -----
  catalogue: TarifHorsCsu[] = [];
  lignes: LigneSaisie[] = [];

  enregistrement = false;
  resultat: FactureStructure | null = null;
  private dossierExistant: DossierPatient | null = null;
  /**
   * Clé anti-doublon du patient en cours de saisie : la même pour tous ses envois (nouvel
   * appui après une erreur, page rechargée pendant l'envoi puis brouillon repris), nouvelle
   * pour le patient suivant. Le serveur ne compte qu'une fois une clé déjà reçue.
   */
  private cleSaisie = '';

  constructor(
    private structureService: StructureService,
    private carteCsuService: CarteCsuService,
    private horsCsu: HorsCsuService,
    private snackBar: MatSnackBar,
    private router: Router,
    private auth: AuthService,
    private dialog: MatDialog,
    private confirm: ConfirmService,
    private horsLigneService: HorsLigneService,
    private reseau: ReseauService,
    private hote: ElementRef<HTMLElement>
  ) {}

  /**
   * Remonte en haut du formulaire après un changement d'étape. Différé (setTimeout) pour
   * s'exécuter une fois la nouvelle étape rendue. `scrollIntoView` remonte aussi le conteneur
   * qui défile quand le composant est intégré dans un autre écran (fiche patient).
   */
  private defilerEnHaut() {
    setTimeout(() => {
      try {
        this.hote.nativeElement.scrollIntoView({ block: 'start', behavior: 'auto' });
      } catch { /* environnement sans scrollIntoView */ }
    });
  }

  // ══════════════════════════ hors ligne ══════════════════════════

  /** Patient enregistré sur l'appareil (pas de réseau) : il partira au retour de la connexion. */
  saisieHorsLigne: SaisieEnAttente | null = null;

  get horsLigne(): boolean {
    return !this.reseau.enLigne;
  }

  /** Régime à carte sans réseau : la carte doit être vérifiée en ligne. */
  regimeIndisponible(regime: Regime): boolean {
    return this.horsLigne && !REGIMES_HORS_LIGNE.includes(regime);
  }

  categorieIndisponible(categorie: CategoriePoste): boolean {
    return categorie.regimes.every(r => this.regimeIndisponible(r));
  }

  get moisSaisieHorsLigne(): string {
    const r = this.saisieHorsLigne?.requete;
    return r?.mois && r?.annee ? `${MOIS[r.mois]} ${r.annee}` : '';
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
    this.chargerCatalogue();
    if (this.factureId && this.dossierId) {
      this.chargerDossier(this.factureId, this.dossierId);
    } else if (!this.reprendreBrouillon() && this.regimeImpose) {
      this.choisirRegime(this.regimeImpose);
    }
    if (this.mois && this.annee && !this.estMoisCourant) {
      // Saisie rattrapée sur un mois passé : les soins sont datés dans ce mois-là.
      this.dateSoins = `${this.annee}-${String(this.mois).padStart(2, '0')}-01`;
    }
  }

  /** Page quittée normalement : la saisie en cours n'a plus à survivre à un rechargement. */
  ngOnDestroy() {
    this.oublierBrouillon();
  }

  // ══════════════════════════ état dérivé ══════════════════════════

  get modeModification(): boolean {
    return !!this.factureId && !!this.dossierId;
  }

  get carteRequise(): boolean {
    return exigeCartePoste(this.regime) && !this.surLettre;
  }

  get forfaitaire(): boolean {
    return estForfaitaire(this.regime);
  }

  get contributif(): boolean {
    return estContributif(this.regime);
  }

  get piecesRequises(): TypePiece[] {
    return this.surLettre ? [] : piecesExigees(this.regime);
  }

  get piecesManquantes(): TypePiece[] {
    return this.piecesRequises.filter(type => !this.pieces[type]);
  }

  get regleRegime(): string {
    return categorieDe(this.regime)?.regle || '';
  }

  get numeroEtape(): number {
    return this.etapes.findIndex(e => e.cle === this.etape);
  }

  get estMoisCourant(): boolean {
    const maintenant = new Date();
    return !this.mois || !this.annee
      || (this.mois === maintenant.getMonth() + 1 && this.annee === maintenant.getFullYear());
  }

  /** Alerte (non bloquante) : la catégorie imprimée sur la carte ne correspond pas au régime. */
  get incoherenceCategorie(): string | null {
    if (!this.carte || categorieCompatible(this.carte.categorie, this.regime) !== false) return null;
    return `La carte est de catégorie « ${this.carte.categorie} » alors que le régime choisi est « ${this.libelleRegime(this.regime)} ». Vérifiez le régime.`;
  }

  get alerteAge(): string | null {
    return controleAge(this.regime, this.patient.dateNaissance ? new Date(this.patient.dateNaissance) : null);
  }

  /** Lignes réellement saisies (une ligne vide est ignorée). */
  get lignesSaisies(): LigneSaisie[] {
    return this.lignes.filter(l => l.designation.trim());
  }

  partPatientLigne(l: LigneSaisie): number {
    return Math.round(this.montantLigne(l) * (1 - tauxSencsuPoste(this.regime)));
  }

  montantLigne(l: LigneSaisie): number {
    return this.forfaitaire ? 0 : Math.max(1, Number(l.quantite) || 1) * (Number(l.prixUnitaire) || 0);
  }

  get total(): number {
    if (this.forfaitaire) return this.lignesSaisies.length ? FORFAIT_0_5_ANS : 0;
    return this.lignesSaisies.reduce((s, l) => s + this.montantLigne(l), 0);
  }

  get totalPatient(): number {
    return this.forfaitaire ? 0 : this.lignesSaisies.reduce((s, l) => s + this.partPatientLigne(l), 0);
  }

  get totalSencsu(): number {
    return this.total - this.totalPatient;
  }

  /** Ce qui manque pour que le dossier soit complet (et la facture envoyable). */
  get manques(): string[] {
    const manques: string[] = [];
    if (this.lignesSaisies.length === 0) manques.push('aucune prestation saisie');
    this.piecesManquantes.forEach(type => manques.push(`photo « ${LIBELLES_PIECES[type]} » manquante`));
    return manques;
  }

  // ══════════════════════════ étape 0 : régime ══════════════════════════

  choisirCategorie(categorie: CategoriePoste) {
    if (this.categorieIndisponible(categorie)) {
      this.avertirConnexionRequise();
      return;
    }
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

  private avertirConnexionRequise() {
    this.snackBar.open('Pas de connexion : ce régime exige la vérification de la carte en ligne. '
      + 'Hors ligne, vous pouvez facturer les enfants de moins de 5 ans et le Plan Sésame.', 'Fermer', { duration: 6000 });
  }

  choisirRegime(regime: Regime) {
    if (this.regimeIndisponible(regime) && !this.modeModification) {
      this.avertirConnexionRequise();
      return;
    }
    if (this.regime !== regime) {
      this.reinitialiserPatient();
    }
    this.regime = regime;
    this.categorie = categorieDe(regime) || null;
    this.etape = 'identification';
  }

  changerDeRegime() {
    if (this.modeModification || this.regimeImpose) return;
    this.etape = 'regime';
  }

  private reinitialiserPatient() {
    this.patient = { ...PATIENT_VIDE };
    this.codeImmatriculation = '';
    this.carte = null;
    this.refus = '';
    this.siteEnPanne = false;
    this.verification = null;
    this.identiteVerrouillee = false;
    this.pieces = {};
    this.piecesModifiees.clear();
    this.repriseCni.oublier();
    this.lignes = [this.ligneVide()];
    this.resultat = null;
    this.saisieHorsLigne = null;
    this.cleSaisie = '';
    this.oublierBrouillon();
  }

  /** Clé de la saisie en cours, créée au premier besoin (brouillon ou enregistrement). */
  private cleDeLaSaisie(): string {
    if (!this.cleSaisie) this.cleSaisie = this.horsLigneService.nouvelleCle();
    return this.cleSaisie;
  }

  // ══════════════════════════ étape 1 : identification ══════════════════════════

  /** Interroge le système de gestion des assurés avec le code d'immatriculation. */
  verifierEligibilite() {
    const code = this.codeImmatriculation.replace(/\s+/g, '').toUpperCase();
    if (!code) {
      this.snackBar.open('Saisissez le code d\'immatriculation du bénéficiaire.', 'Fermer', { duration: 3000 });
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
        this.appliquerCarte(carte);
        this.etape = 'eligibilite';
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
      return `Carte non valide (${(carte.etat || 'inactive').toLowerCase()}) — La facturation ne peut pas être effectuée.`;
    }
    if (carte.enPeriodeObservation) {
      return `Bénéficiaire en période d'observation : la prise en charge ne sera ouverte que le `
        + `${this.dateFr(carte.dateDebutDroits)} — La facturation ne peut pas être effectuée.`;
    }
    if (carte.dateDebut && new Date(carte.dateDebut) > new Date()) {
      return `Carte pas encore valide (adhésion le ${this.dateFr(carte.dateDebut)}) — La facturation ne peut pas être effectuée.`;
    }
    return `Carte expirée${carte.dateFin ? ' le ' + this.dateFr(carte.dateFin) : ''} — La facturation ne peut pas être effectuée.`;
  }

  /** L'identité vient du système source : elle fait référence et n'est plus modifiable. */
  private appliquerCarte(carte: CarteCsu) {
    this.verification = 'VERIFIEE';
    this.identiteVerrouillee = true;
    this.patient = {
      ...this.patient,
      matricule: carte.codeImmatriculation,
      prenom: carte.prenom || '',
      nom: carte.nom || '',
      sexe: carte.sexe || '',
      dateNaissance: (carte.dateNaissance || '').substring(0, 10),
      numeroCni: carte.numeroPiece || '',
      telephone: this.patient.telephone || carte.telephone || ''
    };
  }

  /** Système de vérification injoignable : seule dérogation, consignée sur la facture. */
  continuerSansVerification() {
    this.verification = 'NON_VERIFIEE_PANNE';
    this.identiteVerrouillee = false;
    this.patient.matricule = this.codeImmatriculation.replace(/\s+/g, '').toUpperCase();
    this.siteEnPanne = false;
    this.etape = 'eligibilite';
  }

  changerDeCarte() {
    if (this.modeModification && this.identiteVerrouillee) return;
    this.carte = null;
    this.refus = '';
    this.verification = null;
    this.identiteVerrouillee = false;
    this.patient = { ...PATIENT_VIDE, telephone: this.patient.telephone };
    this.etape = 'identification';
  }

  onPiece(type: TypePiece, image: string | null) {
    this.pieces[type] = image;
    this.piecesModifiees.add(type);
  }

  get ocrEnCours(): boolean {
    return this.lecturesCni > 0;
  }

  /**
   * CNI du Plan Sésame : lecture automatique. Elle ne touche pas à ce que l'agent a saisi ;
   * la bande MRZ du verso, plus sûre, corrige ce qu'une lecture du recto avait rempli.
   */
  async lireCni(fichier: File) {
    this.lecturesCni++;
    try {
      const lu = await ocrCni(fichier);
      const repris = this.repriseCni.appliquer(this.patient, lu);
      this.snackBar.open(repris.length
        ? `Lu sur la CNI : ${repris.join(', ')}. Vérifiez et complétez.`
        : 'Lecture automatique sans résultat : saisissez les informations.', 'Fermer', { duration: 4500 });
    } catch {
      this.snackBar.open('Lecture automatique impossible : saisissez les informations.', 'Fermer', { duration: 4000 });
    } finally {
      this.lecturesCni--;
    }
  }

  // ══════════════════════════ saisie gardée pendant la photo ══════════════════════════

  /** Le téléphone ouvre son appareil photo ou sa galerie : on garde la saisie en cours. */
  garderBrouillon() {
    if (this.modeModification || !this.regime) return;
    const brouillon: Brouillon = {
      enregistreLe: Date.now(), mois: this.mois, annee: this.annee, etape: this.etape, regime: this.regime,
      patient: this.patient, dateSoins: this.dateSoins,
      codeImmatriculation: this.codeImmatriculation, carte: this.carte, verification: this.verification,
      identiteVerrouillee: this.identiteVerrouillee, pieces: this.pieces, lignes: this.lignes,
      cleSaisie: this.cleDeLaSaisie()
    };
    try {
      sessionStorage.setItem(CLE_BROUILLON, JSON.stringify(brouillon));
    } catch {
      // Stockage plein : on garde au moins la saisie, sans les photos.
      try {
        sessionStorage.setItem(CLE_BROUILLON, JSON.stringify({ ...brouillon, pieces: {} }));
      } catch { /* stockage indisponible (navigation privée) */ }
    }
  }

  /** Après un rechargement de la page pendant une photo : reprend la saisie là où elle était. */
  private reprendreBrouillon(): boolean {
    let brouillon: Brouillon | null;
    try {
      brouillon = JSON.parse(sessionStorage.getItem(CLE_BROUILLON) || 'null');
    } catch {
      return false;
    }
    this.oublierBrouillon();
    if (!brouillon || Date.now() - brouillon.enregistreLe > DUREE_BROUILLON_MS) return false;
    if ((this.regimeImpose && brouillon.regime !== this.regimeImpose)
      || (brouillon.mois ?? null) !== (this.mois ?? null) || (brouillon.annee ?? null) !== (this.annee ?? null)) {
      return false;
    }

    this.regime = brouillon.regime;
    this.categorie = categorieDe(brouillon.regime) || null;
    this.patient = { ...PATIENT_VIDE, ...brouillon.patient };
    this.dateSoins = brouillon.dateSoins;
    this.codeImmatriculation = brouillon.codeImmatriculation;
    this.carte = brouillon.carte;
    this.verification = brouillon.verification;
    this.identiteVerrouillee = brouillon.identiteVerrouillee;
    this.pieces = brouillon.pieces || {};
    this.lignes = brouillon.lignes?.length ? brouillon.lignes : [];
    this.cleSaisie = brouillon.cleSaisie || '';
    this.assurerLigneVide();
    // Un brouillon d'avant la suppression du « Récapitulatif » peut encore porter cette étape :
    // il reprend aux informations médicales, d'où l'on enregistre désormais.
    const etapeBrouillon = brouillon.etape as string;
    this.etape = etapeBrouillon === 'termine' || etapeBrouillon === 'regime' ? 'identification'
      : etapeBrouillon === 'recapitulatif' ? 'medical' : brouillon.etape;
    this.snackBar.open('La page s\'est rechargée pendant la photo : votre saisie a été reprise.', 'Fermer',
      { duration: 5000 });
    return true;
  }

  private oublierBrouillon() {
    try {
      sessionStorage.removeItem(CLE_BROUILLON);
    } catch { /* stockage indisponible */ }
  }

  /** Identification par pièce (enfants, Sésame) ou saisie manuelle après dérogation. */
  validerIdentification() {
    const erreur = this.erreurIdentite();
    if (erreur) {
      this.snackBar.open(erreur, 'Fermer', { duration: 4000 });
      return;
    }
    this.etape = 'eligibilite';
  }

  private erreurIdentite(): string | null {
    if (!this.patient.prenom.trim() || !this.patient.nom.trim()) return 'Le prénom et le nom du patient sont obligatoires.';
    if (!this.patient.dateNaissance && (this.regime === Regime.ZERO_CINQ_ANS || this.regime === Regime.SESAME)) {
      return 'La date de naissance est obligatoire : elle conditionne le contrôle d\'âge du régime.';
    }
    if (this.alerteAge) return this.alerteAge;
    if (this.carteRequise && !this.patient.matricule.trim()) return 'Le code d\'immatriculation est obligatoire.';
    return null;
  }

  // ══════════════════════════ étape 2 : éligibilité ══════════════════════════

  continuerVersMedical() {
    const erreur = this.erreurIdentite();
    if (erreur) {
      this.snackBar.open(erreur, 'Fermer', { duration: 4000 });
      return;
    }
    this.assurerLigneVide();
    this.etape = 'medical';
  }

  // ══════════════════════════ étape 3 : prestations ══════════════════════════

  private chargerCatalogue() {
    this.horsCsu.getTarifsApplicables().subscribe({
      next: tarifs => {
        this.catalogue = (tarifs || []).filter(t => t.actif);
        this.horsLigneService.memoriserCatalogue(this.catalogue);
      },
      // Hors ligne : le catalogue mémorisé lors de la dernière lecture en ligne.
      error: () => void this.horsLigneService.catalogueMemorise().then(tarifs => this.catalogue = tarifs || [])
    });
  }

  /** Services proposés : ceux par défaut et ceux qu'emploient les prestations paramétrées. */
  get services(): string[] {
    const connus = this.catalogue.map(t => (t.categorie || '').trim()).filter(Boolean);
    return Array.from(new Set([...SERVICES_PAR_DEFAUT, ...connus])).sort((a, b) => a.localeCompare(b, 'fr'));
  }

  /**
   * Services de la liste déroulante d'une ligne : tous tant que le champ est vide ou porte
   * déjà un service connu (on peut alors en choisir un autre), sinon ceux qui contiennent
   * la saisie. Liste Angular Material et non `<datalist>` : celle-ci ne s'affichait pas sur
   * certains téléphones, et filtrée sur un service déjà rempli, elle ne proposait plus rien.
   */
  servicesProposes(ligne: LigneSaisie): string[] {
    return proposes(this.services, ligne.service);
  }

  /** Service saisi qui ne figure pas encore dans la liste : il y entrera avec sa prestation. */
  nouveauService(ligne: LigneSaisie): boolean {
    const service = normaliser(ligne.service);
    return !!service && !this.services.some(s => normaliser(s) === service);
  }

  /** Prestation du paramétrage dont vient la ligne, si elle y figure encore. */
  tarifDe(ligne: LigneSaisie): TarifHorsCsu | undefined {
    return ligne.tarifId ? this.catalogue.find(t => t.id === ligne.tarifId) : undefined;
  }

  /** Prix saisi différent du prix paramétré : le paramétrage prendra le nouveau prix. */
  prixModifie(ligne: LigneSaisie): boolean {
    const tarif = this.tarifDe(ligne);
    const prix = Number(ligne.prixUnitaire);
    return !this.forfaitaire && !!tarif && ligne.prixUnitaire != null && prix >= 0 && prix !== tarif.prix;
  }

  /**
   * Service saisi exprès sur une prestation paramétrée, différent du sien — nouveau ou
   * déjà existant : la prestation sera rangée dans ce service.
   */
  serviceAReporter(ligne: LigneSaisie): boolean {
    const tarif = this.tarifDe(ligne);
    const service = normaliser(ligne.service);
    return !!ligne.serviceSaisi && !!tarif && !!service && service !== normaliser(tarif.categorie);
  }

  /** Prestations proposées pour une ligne : celles de son service, filtrées par la saisie. */
  suggestions(ligne: LigneSaisie): TarifHorsCsu[] {
    const terme = normaliser(ligne.designation);
    return this.catalogue
      .filter(t => !ligne.service || normaliser(t.categorie) === normaliser(ligne.service))
      .filter(t => !terme || normaliser(t.designation).includes(terme))
      .slice(0, 30);
  }

  ligneVide(): LigneSaisie {
    return { service: '', designation: '', quantite: 1, prixUnitaire: null, nouvelle: false };
  }

  /**
   * Il y a toujours une ligne vide en bas : dès que la dernière est entièrement remplie
   * (service, prestation, quantité et, hors forfait, prix), la suivante apparaît d'elle-même
   * — plus de bouton « Ajouter une prestation ». Elle part d'un service vide (demande du
   * 07/10/2026 : recopier celui de la ligne précédente masquait la liste des services) ;
   * le choix d'une prestation y met son service.
   */
  assurerLigneVide() {
    const derniere = this.lignes[this.lignes.length - 1];
    if (!derniere || this.ligneComplete(derniere)) {
      this.lignes.push(this.ligneVide());
    }
  }

  private ligneComplete(ligne: LigneSaisie): boolean {
    if (!ligne.service.trim() || !ligne.designation.trim() || !(Number(ligne.quantite) >= 1)) return false;
    if (this.forfaitaire) return true;
    if (ligne.prixUnitaire == null || String(ligne.prixUnitaire) === '') return false;
    // Une prestation nouvelle doit avoir un prix (elle entre au paramétrage) ; une prestation
    // paramétrée peut être gratuite.
    return ligne.nouvelle ? Number(ligne.prixUnitaire) > 0 : Number(ligne.prixUnitaire) >= 0;
  }

  /** La ligne vide du bas : rien à retirer. */
  estLigneVideFinale(index: number): boolean {
    return index === this.lignes.length - 1 && !this.lignes[index].designation.trim();
  }

  retirerLigne(index: number) {
    this.lignes.splice(index, 1);
    this.assurerLigneVide();
  }

  choisirPrestation(ligne: LigneSaisie, tarif: TarifHorsCsu) {
    ligne.designation = tarif.designation;
    ligne.tarifId = tarif.id;
    ligne.prestationId = undefined;
    ligne.nouvelle = false;
    ligne.prixUnitaire = tarif.prix;
    // La prestation apporte son service, sauf si l'agent en a tapé un lui-même sur cette ligne
    // (un service recopié de la ligne précédente n'est qu'une valeur par défaut).
    if (tarif.categorie && (!ligne.service || !ligne.serviceSaisi)) ligne.service = tarif.categorie;
  }

  /** Saisie libre : une désignation inconnue du paramétrage devient une nouvelle prestation. */
  onDesignation(ligne: LigneSaisie) {
    const terme = normaliser(ligne.designation);
    if (!terme) {
      ligne.nouvelle = false;
      ligne.tarifId = undefined;
      return;
    }
    const connu = this.catalogue.find(t => normaliser(t.designation) === terme
      && (!ligne.service || normaliser(t.categorie) === normaliser(ligne.service)))
      || this.catalogue.find(t => normaliser(t.designation) === terme);
    if (connu) {
      if (ligne.tarifId !== connu.id) this.choisirPrestation(ligne, connu);
      return;
    }
    if (ligne.origine && normaliser(ligne.origine.designation) === terme) {
      // Ligne déjà facturée, hors paramétrage (saisie antérieure) : on la garde telle quelle.
      ligne.nouvelle = false;
      return;
    }
    ligne.tarifId = undefined;
    ligne.prestationId = undefined;
    ligne.nouvelle = true;
  }

  private erreurPrestations(): string | null {
    for (const ligne of this.lignesSaisies) {
      if (!(Number(ligne.quantite) >= 1)) return `« ${ligne.designation} » : la quantité doit être au moins 1.`;
      if (!this.forfaitaire && (ligne.prixUnitaire == null || Number(ligne.prixUnitaire) < 0)) {
        return `« ${ligne.designation} » : indiquez le prix unitaire.`;
      }
      if (ligne.nouvelle && !this.forfaitaire && !(Number(ligne.prixUnitaire) > 0)) {
        return `« ${ligne.designation} » est une nouvelle prestation : saisissez son prix, elle sera ajoutée au paramétrage.`;
      }
    }
    return null;
  }

  allerA(etape: Etape) {
    if (etape === 'termine' || this.etape === 'termine') return;
    const cible = this.etapes.findIndex(e => e.cle === etape);
    if (cible >= 0 && cible < this.numeroEtape) this.etape = etape;
  }

  // ══════════════════════════ enregistrement ══════════════════════════

  /**
   * « Enregistrer — à compléter » depuis une étape intermédiaire : confirmé d'abord, pour qu'un
   * appui involontaire ne crée pas un dossier incomplet dans la facture du mois.
   */
  enregistrerPlusTard() {
    const patient = `${this.patient.prenom} ${this.patient.nom}`.trim() || 'Le patient';
    const manques = this.manques.length ? ` (${this.manques.join(', ')})` : '';
    this.confirm.ask({
      title: 'Enregistrer pour compléter plus tard ?',
      message: `${patient} sera enregistré avec un dossier « à compléter »${manques}. Vous le terminerez depuis `
        + '« Mes factures » : la facture du mois ne peut pas partir tant qu\'il reste incomplet.',
      confirmText: 'Enregistrer',
      cancelText: 'Continuer la saisie'
    }).subscribe(ok => {
      if (ok) this.enregistrer(true);
    });
  }

  /**
   * Enregistre le patient. `partiel` : validation partielle, le dossier reste « à
   * compléter » (§9) — accessible dès que l'identité est contrôlée.
   */
  enregistrer(partiel: boolean) {
    // Double appui (ou confirmation arrivée pendant un envoi) : un seul enregistrement à la fois.
    if (this.enregistrement) return;
    const erreur = this.erreurIdentite() || this.erreurPrestations();
    if (erreur) {
      this.snackBar.open(erreur, 'Fermer', { duration: 4500 });
      return;
    }
    if (this.modeModification && this.horsLigne) {
      this.snackBar.open('Pas de connexion : un dossier déjà enregistré se modifie en ligne.', 'Fermer', { duration: 5000 });
      return;
    }
    // Clé de ce patient, la même à chaque envoi : renvoyé (réseau coupé, nouvel appui, page
    // rechargée), il n'est compté qu'une fois par le serveur.
    const cle = this.cleDeLaSaisie();
    if (!this.modeModification && (this.horsLigne || this.auth.isSessionExpired())) {
      // Pas de réseau (ou session hors ligne à renouveler) : enregistrée sur l'appareil.
      void this.enregistrerHorsLigne({ ...this.requete(partiel), cleSynchronisation: cle }, partiel);
      return;
    }
    let requeteEnvoyee: FactureStructureRequest | null = null;
    this.enregistrement = true;
    this.mettreAJourParametrage().pipe(
      switchMap(() => {
        const requete: FactureStructureRequest = { ...this.requete(partiel), cleSynchronisation: cle };
        requeteEnvoyee = requete;
        return this.modeModification
          ? this.structureService.modifierDossier(this.factureId!, this.dossierId!, requete)
          : this.structureService.createFacture(requete);
      })
    ).subscribe({
      next: facture => {
        this.enregistrement = false;
        this.resultat = facture;
        // Patient enregistré : un rechargement ne doit pas le faire ressaisir (doublon).
        this.oublierBrouillon();
        this.chargerCatalogue();
        if (this.modeModification) {
          this.snackBar.open('Dossier patient enregistré.', 'Fermer', { duration: 3000 });
          this.termine.emit(facture);
          return;
        }
        this.etape = 'termine';
        this.termine.emit(facture);
      },
      error: err => {
        this.enregistrement = false;
        // Réseau coupé pendant l'envoi : rien n'est perdu, la saisie attend sur l'appareil
        // (même clé : si elle était arrivée malgré tout, elle ne sera pas comptée deux fois).
        // Régime à carte : seulement si la carte a déjà été contrôlée en ligne.
        if (!this.modeModification && estErreurReseau(err?.status) && requeteEnvoyee
            && (!this.carteRequise || this.verification !== null)) {
          void this.enregistrerHorsLigne(requeteEnvoyee, partiel);
          return;
        }
        this.snackBar.open(err.error?.message || 'Enregistrement impossible.', 'Fermer',
          { duration: 7000, panelClass: 'error-snackbar' });
      }
    });
  }

  /**
   * Enregistre le patient sur l'appareil. Il est rattaché au mois de ses soins et partira
   * tout seul au retour du réseau (cf. HorsLigneService).
   */
  private async enregistrerHorsLigne(requete: FactureStructureRequest, partiel: boolean) {
    this.enregistrement = true;
    try {
      const [annee, mois] = this.dateSoins.split('-').map(Number);
      this.saisieHorsLigne = await this.horsLigneService.mettreEnFile(
        { ...requete, mois: requete.mois || mois, annee: requete.annee || annee },
        {
          patient: `${this.patient.prenom} ${this.patient.nom}`.trim(),
          regime: this.regime!,
          montant: this.total,
          dateSoins: this.dateSoins,
          partiel: partiel || this.manques.length > 0
        });
      this.resultat = null;
      this.oublierBrouillon();
      this.etape = 'termine';
    } catch {
      this.snackBar.open('Enregistrement sur l\'appareil impossible (espace de stockage plein ?).', 'Fermer',
        { duration: 7000, panelClass: 'error-snackbar' });
    } finally {
      this.enregistrement = false;
    }
  }

  /**
   * Reporte la saisie dans le paramétrage du poste avant d'enregistrer (§3.2) :
   * <ul>
   *   <li>prestation inconnue → ajoutée, avec son service et son prix ;</li>
   *   <li>prix modifié sur une prestation paramétrée → le nouveau prix devient le prix
   *       paramétré (les patients suivants l'auront d'office) ;</li>
   *   <li>autre service tapé sur une prestation paramétrée → la prestation y est rangée ;
   *       un service qui n'existait pas entre ainsi dans la liste.</li>
   * </ul>
   * <p>Une prestation du référentiel <b>national</b> ne se modifie pas d'ici : le poste s'en
   * fait sa propre version, même code, que le serveur fait primer chez lui seul.</p>
   * <p>Un échec (doublon, réseau) ne bloque pas la facturation : la ligne garde sa
   * désignation et son prix, seul le paramétrage n'est pas mis à jour.</p>
   */
  private mettreAJourParametrage(): Observable<unknown> {
    const operations: Observable<string | null>[] = [];

    for (const ligne of this.lignesSaisies.filter(l => l.nouvelle && !l.tarifId)) {
      operations.push(this.horsCsu.creerTarif({
        designation: ligne.designation.trim(),
        categorie: ligne.service.trim() || undefined,
        prix: Number(ligne.prixUnitaire) || 0,
        actif: true
      }).pipe(
        map(tarif => {
          ligne.tarifId = tarif.id;
          ligne.nouvelle = false;
          return `« ${tarif.designation} » ajoutée`;
        }),
        catchError(() => of(null))
      ));
    }

    const traites = new Set<string>();
    for (const ligne of this.lignesSaisies) {
      const tarif = this.tarifDe(ligne);
      if (!tarif || traites.has(tarif.id)) continue;
      const prixChange = this.prixModifie(ligne);
      const serviceChange = this.serviceAReporter(ligne);
      if (!prixChange && !serviceChange) continue;
      traites.add(tarif.id);

      const maj: Partial<TarifHorsCsu> = {
        designation: tarif.designation,
        categorie: serviceChange ? ligne.service.trim() : (tarif.categorie || ''),
        prix: prixChange ? Number(ligne.prixUnitaire) : tarif.prix
      };
      const appel = tarif.structureId
        ? this.horsCsu.modifierTarif(tarif.id, maj)
        : this.horsCsu.creerTarif({ ...maj, code: tarif.code, actif: true });
      operations.push(appel.pipe(
        map(enregistre => {
          // Version propre créée à partir d'un tarif national : les lignes la référencent.
          this.lignes.filter(l => l.tarifId === tarif.id).forEach(l => l.tarifId = enregistre.id);
          const changements: string[] = [];
          if (prixChange) changements.push(`${Number(ligne.prixUnitaire).toLocaleString('fr-FR')} F`);
          if (serviceChange) changements.push(`service « ${maj.categorie} »`);
          return `« ${tarif.designation} » : ${changements.join(', ')}`;
        }),
        catchError(() => of(null))
      ));
    }

    if (operations.length === 0) return of(null);
    return forkJoin(operations).pipe(map(resultats => {
      const faits = resultats.filter((r): r is string => !!r);
      if (faits.length) {
        this.snackBar.open(`Paramétrage mis à jour — ${faits.join(' · ')}`, 'Fermer', { duration: 5000 });
      }
      return faits;
    }));
  }

  private requete(partiel: boolean): FactureStructureRequest {
    const p = this.patient;
    const lignes: LigneFactureStructure[] = this.lignesSaisies.map(l => ({
      ...(l.origine || {}),
      designation: l.designation.trim(),
      service: l.service.trim() || undefined,
      quantite: Math.max(1, Number(l.quantite) || 1),
      prixUnitaire: this.forfaitaire ? 0 : Number(l.prixUnitaire) || 0,
      tarifId: l.tarifId,
      prestationId: l.prestationId,
      datePriseEnCharge: l.origine?.datePriseEnCharge || this.dateSoins
    }));
    const requete: FactureStructureRequest = {
      regime: this.regime || undefined,
      patientPrenom: p.prenom.trim(),
      patientNom: p.nom.trim(),
      patientSexe: p.sexe || undefined,
      patientDateNaissance: p.dateNaissance || undefined,
      patientTelephone: p.telephone.trim() || undefined,
      patientAdresse: p.adresse.trim() || undefined,
      patientMatricule: p.matricule.trim() || undefined,
      patientNumeroCni: p.numeroCni.trim() || undefined,
      numeroRegistre: p.numeroRegistre.trim() || undefined,
      verificationCarte: this.carteRequise ? (this.verification ?? undefined) : undefined,
      lignes,
      pieces: this.piecesAEnvoyer(),
      partiel
    };
    if (!this.modeModification && this.mois && this.annee) {
      requete.mois = this.mois;
      requete.annee = this.annee;
    }
    return requete;
  }

  /** À la création : toutes les photos. En modification : seulement celles qui ont changé. */
  private piecesAEnvoyer(): Partial<Record<TypePiece, string>> {
    const pieces: Partial<Record<TypePiece, string>> = {};
    (Object.keys(this.pieces) as TypePiece[]).forEach(type => {
      if (this.modeModification && !this.piecesModifiees.has(type)) return;
      const image = this.pieces[type];
      if (image) pieces[type] = image;
      else if (this.modeModification) pieces[type] = '';
    });
    return pieces;
  }

  // ══════════════════════════ après validation ══════════════════════════

  autrePatient() {
    const regime = this.regime;
    this.reinitialiserPatient();
    if (regime) this.choisirRegime(regime);
  }

  nouveauRegime() {
    this.reinitialiserPatient();
    this.regime = null;
    this.categorie = null;
    this.etape = 'regime';
  }

  voirFacture() {
    if (this.resultat) this.router.navigate(['/dashboard/espace-ps/factures', this.resultat.id]);
  }

  get periodeResultat(): string {
    return this.resultat ? `${MOIS[this.resultat.mois]} ${this.resultat.annee}` : '';
  }

  get dossierResultat(): DossierPatient | undefined {
    const dossiers = this.resultat?.dossiers || [];
    return dossiers[dossiers.length - 1];
  }

  // ══════════════════════════ modification d'un dossier ══════════════════════════

  private chargerDossier(factureId: string, dossierId: string) {
    this.chargement = true;
    this.structureService.getFacture(factureId).pipe(last()).subscribe({
      next: facture => {
        this.chargement = false;
        const dossier = (facture.dossiers || []).find(d => d.id === dossierId);
        if (!dossier) {
          this.snackBar.open('Dossier patient introuvable sur cette facture.', 'Fermer', { duration: 4000 });
          this.annule.emit();
          return;
        }
        this.dossierExistant = dossier;
        this.surLettre = dossier.lettreGarantieNumero || null;
        this.regime = facture.regime;
        this.categorie = categorieDe(facture.regime) || null;
        this.patient = {
          prenom: dossier.prenom || '', nom: dossier.nom || '', sexe: dossier.sexe || '',
          dateNaissance: (dossier.dateNaissance || '').substring(0, 10), telephone: dossier.telephone || '',
          adresse: dossier.adresse || '', matricule: dossier.matricule || '', numeroCni: dossier.numeroCni || '',
          numeroRegistre: dossier.numeroRegistre || ''
        };
        this.codeImmatriculation = dossier.matricule || '';
        this.identiteVerrouillee = dossier.identiteVerrouillee;
        this.verification = dossier.verificationCarte === 'VERIFIEE' || dossier.verificationCarte === 'NON_VERIFIEE_PANNE'
          ? dossier.verificationCarte : null;
        if (this.identiteVerrouillee && !this.surLettre) {
          this.carte = {
            codeImmatriculation: dossier.matricule || '', prenom: dossier.prenom, nom: dossier.nom,
            sexe: dossier.sexe, dateNaissance: dossier.dateNaissance, numeroPiece: dossier.numeroCni,
            categorie: dossier.categorieCarte, etat: dossier.etatCarte, dateDebut: dossier.dateDebutValidite,
            dateFin: dossier.dateFinValidite, carteActive: true, carteValide: true,
            tauxCouverture: dossier.tauxCouverture, mutuelle: dossier.mutuelle, typeAdhesion: dossier.typeAdhesion
          };
        }
        this.lignes = (facture.lignes || []).filter(l => l.dossierId === dossierId).map(l => ({
          service: l.service || '',
          designation: l.designation || '',
          quantite: l.quantite || 1,
          prixUnitaire: l.prixUnitaire ?? null,
          tarifId: l.tarifId,
          prestationId: l.prestationId,
          nouvelle: false,
          origine: l
        }));
        this.assurerLigneVide();
        this.chargerPieces(factureId, dossier);
        // Le dossier s'ouvre sur ce qui reste à faire : prestations, ou identité/pièces.
        this.etape = this.piecesManquantesDossier(dossier) ? 'identification' : 'medical';
      },
      error: err => {
        this.chargement = false;
        this.snackBar.open(err.error?.message || 'Facture introuvable.', 'Fermer', { duration: 4000 });
        this.annule.emit();
      }
    });
  }

  private piecesManquantesDossier(dossier: DossierPatient): boolean {
    return this.piecesRequises.some(type => !(dossier.pieces || []).includes(type));
  }

  /**
   * Destination de l'envoi de la facture : un poste n'envoie au district que le 0-5 ans
   * (09/10/2026) ; les autres régimes, et toutes les factures d'un centre, vont au service régional.
   */
  get destinationEnvoi(): string {
    const regime = this.resultat?.regime ?? this.regime;
    return this.auth.isPosteDeSante() && regime === Regime.ZERO_CINQ_ANS ? 'au district' : 'au service régional';
  }

  private chargerPieces(factureId: string, dossier: DossierPatient) {
    // La photo de la carte est posée par le serveur et ne se modifie pas ici : inutile de la charger.
    (dossier.pieces || []).filter(type => type !== 'PHOTO_ASSURE').forEach(type => {
      this.pieces[type] = null;
      this.structureService.getPiece(factureId, dossier.id, type, true).pipe(last()).subscribe({
        next: piece => { if (!this.piecesModifiees.has(type)) this.pieces[type] = piece.image; },
        error: () => { /* pièce illisible : l'agent peut la reprendre */ }
      });
    });
  }

  /** En modification, une carte saisie en dérogation peut être contrôlée après coup. */
  get peutVerifierApresCoup(): boolean {
    return this.modeModification && this.carteRequise && !this.identiteVerrouillee;
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

  private aujourdhui(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  trackIndex = (index: number) => index;
}
