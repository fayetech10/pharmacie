import { Regime } from './bcsu.model';

export interface StructureSanitaire {
  id: string;
  code: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  regionId: string;
  /** §6 — échelon entre la région et la structure ; c'est lui qui donne son périmètre
   *  à la consolidation district. */
  districtId?: string;
  /** Centre de santé siège de son district (double casquette centre + district). */
  siegeDistrict?: boolean;
  bcsuId?: string;
  responsableId?: string;
  /** CS (centre de santé), EPS (hôpital), PS (poste de santé). */
  typeStructure?: string;
  /** Poste de santé : structure sanitaire (CS/EPS) de rattachement. */
  structureRattachementId?: string;
  actif: boolean;
}

export interface StructureSanitaireRequest {
  /** Vide à la création : généré automatiquement par le backend ({REGION}{TYPE}{NN}, ex: DKCS01). */
  code?: string;
  /** Type d'établissement pour le code auto-généré : CS (centre de santé), EPS (hôpital), PS (poste de santé). */
  typeStructure?: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  regionId: string;
  /**
   * §6 — district de rattachement. À envoyer **même inchangé** : le serveur applique
   * `setDistrictId(...)` sans condition, donc l'omettre efface le district de la
   * structure et la fait disparaître de la consolidation de son district.
   */
  districtId?: string;
  /** Centre de santé siège de son district (double casquette centre + district). */
  siegeDistrict?: boolean;
  bcsuId?: string;
  password?: string;
  /** Poste de santé : structure sanitaire (CS/EPS) de rattachement. */
  structureRattachementId?: string;
}

/** Accès du compte de connexion d'une structure, renvoyés UNE SEULE FOIS par le serveur. */
export interface AccesCompte {
  identifiant: string;
  motDePasseTemporaire: string;
  /** Vrai si la structure n'avait pas encore de compte : il vient d'être créé. */
  compteCree: boolean;
}

/** Résultat d'un import Excel (postes de santé). */
export interface ImportResult {
  importes: number;
  echecs: number;
  erreurs: string[];
}

/** Type effectif d'une structure : champ persistant, sinon déduit du code (DKPS01 → PS). */
export function typeEffectifStructure(s: StructureSanitaire): string {
  if (s.typeStructure) return s.typeStructure.toUpperCase();
  const code = (s.code || '').toUpperCase();
  if (/^[A-Z]{2}PS\d+$/.test(code)) return 'PS';
  if (/^[A-Z]{2}EPS\d+$/.test(code)) return 'EPS';
  return 'CS';
}

export interface LigneFactureStructure {
  /** Prestation du référentiel national (prix imposé). */
  prestationId?: string;
  /** Prestation du catalogue du point de soins (écran « Paramétrage »). */
  tarifId?: string;
  /** Dossier patient de la facture auquel appartient la ligne. */
  dossierId?: string;
  /**
   * « IMPORT » : apportée par l'import de fin de mois (centre / EPS), remplacée au prochain import.
   * À renvoyer tel quel quand la ligne est modifiée à l'écran.
   */
  origine?: string;
  service?: string;
  designation: string;
  codeActe?: string;
  datePriseEnCharge: string;
  quantite: number;
  prixUnitaire: number;
  montant?: number;
  motifCesarienne?: string;
  montantBeneficiaire?: number;
  montantSencsu?: number;

  // Métadonnées patient par ligne
  lettreGarantieId?: string;
  lettreGarantieNumero?: string;
  feuilleSoinsId?: string;
  feuilleSoinsNumero?: string;
  patientId?: string;
  patientNom?: string;
  patientPrenom?: string;
  patientTelephone?: string;
  patientDateNaissance?: string;
  patientSexe?: string;
  patientAdresse?: string;
  patientMatricule?: string;
  patientNumeroCni?: string;
  /** Issue de la vérification de la carte CSU (« VERIFIEE » / « NON_VERIFIEE_PANNE »). */
  verificationCarte?: string;

  // Champs spécifiques par catégorie
  numeroRegistre?: string;
  ircIra?: string;
  indicationCbt?: string;
  numeroRegistreBloc?: string;
  dateHeureIntervention?: string;
  dureeHospitalisationJours?: number;
}

/** Type d'une photo justificative d'un dossier patient. */
/**
 * Pièces d'un dossier patient. `PHOTO_ASSURE` est la photo du porteur renvoyée par le
 * système des cartes CSU au contrôle d'éligibilité : posée par le serveur, jamais envoyée
 * par l'écran (le serveur la refuserait).
 */
export type TypePiece =
  'TICKET_CAISSE' | 'CNI_RECTO' | 'CNI_VERSO' | 'EXTRAIT_NAISSANCE' | 'CARTE_ASSURE' | 'PHOTO_ASSURE';

export const LIBELLES_PIECES: Record<TypePiece, string> = {
  TICKET_CAISSE: 'Ticket de caisse',
  CNI_RECTO: 'CNI (recto)',
  CNI_VERSO: 'CNI (verso)',
  EXTRAIT_NAISSANCE: 'Extrait de naissance',
  CARTE_ASSURE: "Carte d'assuré",
  PHOTO_ASSURE: "Photo de l'assuré (carte CSU)"
};

/** Statut d'un dossier patient au sein de la facture mensuelle. */
export type StatutDossier = 'A_COMPLETER' | 'COMPLET';

/**
 * Dossier d'un patient dans la facture : identité, contrôle d'éligibilité, pièces. Les
 * photos ne sont pas incluses (seulement leurs types) : elles se lisent à la demande.
 */
export interface DossierPatient {
  id: string;
  statut: StatutDossier;
  nom?: string;
  prenom?: string;
  sexe?: string;
  dateNaissance?: string;
  telephone?: string;
  adresse?: string;
  matricule?: string;
  numeroCni?: string;
  numeroRegistre?: string;
  /** Identité validée par le système de gestion des assurés : non modifiable. */
  identiteVerrouillee: boolean;
  verificationCarte?: string;
  categorieCarte?: string;
  etatCarte?: string;
  tauxCouverture?: number;
  dateDebutValidite?: string;
  dateFinValidite?: string;
  dateVerification?: string;
  mutuelle?: string;
  typeAdhesion?: string;
  /** Saisie d'un centre sur lettre de garantie : la lettre identifie le patient. */
  lettreGarantieNumero?: string;
  pieces: TypePiece[];
  /** Pointé « vérifié » par le centre de rattachement pendant son contrôle (date, agent). */
  verifieCentreLe?: string | null;
  verifieCentrePar?: string | null;
  /** Pointé « vérifié » par le service régional pendant son contrôle (date, agent). */
  verifieRegionLe?: string | null;
  verifieRegionPar?: string | null;
  /** Rejeté « par ligne » par le district (1er échelon) pendant son contrôle (date, agent, motif). */
  rejeteCentreLe?: string | null;
  rejeteCentrePar?: string | null;
  rejeteCentreMotif?: string | null;
  /** Rejeté « par ligne » par le service régional pendant son contrôle (date, agent, motif). */
  rejeteRegionLe?: string | null;
  rejeteRegionPar?: string | null;
  rejeteRegionMotif?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Étape du parcours d'une facture, avec le détail des modifications historisées. */
export interface HistoriqueFacture {
  date: string;
  utilisateurId?: string;
  utilisateurNom?: string;
  statut?: string;
  commentaire?: string;
  dossierId?: string;
  champ?: string;
  ancienneValeur?: string;
  nouvelleValeur?: string;
}

export interface DocumentComplementaire {
  titre: string;
  image?: string;
  lettreGarantieNumero?: string;
  /** Patient du document quand il n'y a pas de lettre de garantie (saisie d'un poste). */
  patientMatricule?: string;
}

/** Statut réutilisé de la facture pharmacie (chaîne côté JSON). */
export type StatutFactureStructure =
  | 'BROUILLON' | 'SOUMISE_CS' | 'REJETEE_CS' | 'ENVOYEE' | 'VALIDEE_SR' | 'REJETEE_SR'
  | 'VALIDEE_NC' | 'REJETEE_NC' | 'PAYEE';

export interface FactureStructure {
  id: string;
  numero: string;
  structureSanitaireId: string;
  structureNom: string;
  regionId: string;
  bcsuId: string;
  regime: Regime;
  mois: number;
  annee: number;
  lignes: LigneFactureStructure[];
  montantTotal: number;
  montantTotalBeneficiaire: number;
  montantTotalSencsu: number;
  statut: StatutFactureStructure;
  ticketCaisse?: string;
  documentsComplementaires: DocumentComplementaire[];
  /** Absent des factures antérieures aux dossiers patients (reconstitués à la lecture du détail). */
  dossiers?: DossierPatient[];
  /** Calculé par le serveur. */
  nombreDossiersACompleter?: number;
  nombreBeneficiaires?: number;
  historique?: HistoriqueFacture[];
  typeStructure?: string;
  commentaireRejet?: string;
  /** Reprise de l'ancienne application (import du Service Régional) : statut d'origine conservé. */
  importee?: boolean | null;
  /** Numéro de la facture dans l'ancienne application. */
  numeroOrigine?: string | null;
  /**
   * Centres / EPS, régimes à clé de rapprochement : étape calculée par le serveur
   * (EN_COURS_DE_SAISIE, IMPORTEE, COMPLETE, TRANSMISE ; cf. ETAPES_FACTURE). Absente sinon :
   * la facture suit alors le circuit habituel (clôture automatique). Une facture qui en a une
   * est transmise par sa structure.
   */
  etape?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Facture reconnue dans un fichier d'import : sans id ni numéro tant qu'elle n'est pas enregistrée. */
export interface FactureReconnueImport {
  id: string | null;
  numero: string | null;
  numeroOrigine: string | null;
  regime: Regime;
  regimeLibelle: string;
  mois: number;
  annee: number;
  statut: StatutFactureStructure;
  statutLibelle: string;
  /** Visites (dossiers patients) de la facture. */
  patients: number;
  lignes: number;
  montantTotal: number;
}

/** Compte rendu de l'import des factures de l'ancienne application (tout ou rien). */
export interface ResultatImportFactures {
  structureId: string;
  structureNom: string;
  lignesLues: number;
  facturesCreees: number;
  patients: number;
  montantTotal: number;
  factures: FactureReconnueImport[];
  erreurs: string[];
  avertissements: string[];
}

/**
 * Rapport de l'import de fin de mois d'un centre / EPS : ce que le fichier apporte aux patients
 * enregistrés par le BCSU, et ce qu'il ne leur rattache pas. `simulation` : aperçu, rien
 * n'est enregistré ; `applicable` : l'import peut être confirmé.
 */
export interface RapportRapprochement {
  date: string;
  utilisateurNom?: string;
  fichier?: string;
  simulation: boolean;
  applicable: boolean;
  regime: string;
  mois: number;
  annee: number;
  factureId?: string;
  factureNumero?: string;
  lignesLues: number;
  prestationsImportees: number;
  montantImporte: number;
  dossiersConserves: number;
  rapprochees: {
    dossierId: string; patient: string; cle: string; date: string; lettreGarantieNumero?: string;
    prestations: number; montant: number; lignes: number[];
  }[];
  sansCorrespondance: {
    lignes: number[]; patient: string; cle: string; date: string; prestations: number;
    cleConnue: boolean; datesConnues: string[];
  }[];
  sansPrestations: { dossierId: string; patient: string; cle: string; date: string; lettreGarantieNumero?: string }[];
  anomalies: { ligne: number; motif: string }[];
  erreurs: string[];
  avertissements: string[];
}

/** Une visite du BCSU à laquelle rattacher un ticket de caisse (saisie en série). */
export interface VisiteTicket {
  factureId: string;
  factureNumero: string;
  dossierId: string;
  patient: string;
  date: string;
  lettreGarantieNumero?: string;
  prestations: number;
  tickets: number;
  /** A_COMPLETER / COMPLET. */
  statut: string;
}

/** Visites trouvées pour un identifiant et une date ; `autresDates` : l'identifiant est connu à d'autres dates. */
export interface RechercheTicket {
  visites: VisiteTicket[];
  autresDates: string[];
}

export interface TicketResume {
  id: string;
  createdAt: string;
}

export interface FactureStructureRequest {
  lettreGarantieNumero?: string;
  regime?: string;
  patientNom?: string;
  patientPrenom?: string;
  patientTelephone?: string;
  /** Feuille de soins déposée par le patient à rattacher à cette facture (fin du circuit). */
  feuilleSoinsId?: string;
  service?: string;
  /** Identité complémentaire du bénéficiaire (classeur CS_EPS). */
  patientDateNaissance?: string;
  patientSexe?: string;
  patientAdresse?: string;
  patientMatricule?: string;
  patientNumeroCni?: string;
  /** Issue de la vérification de la carte CSU (« VERIFIEE » / « NON_VERIFIEE_PANNE »). */
  verificationCarte?: string;
  /** Champs spécifiques par catégorie. */
  numeroRegistre?: string;
  ircIra?: string;
  indicationCbt?: string;
  numeroRegistreBloc?: string;
  dateHeureIntervention?: string;
  dureeHospitalisationJours?: number;
  lignes: LigneFactureStructure[];
  ticketCaisse?: string;
  documentsComplementaires?: DocumentComplementaire[];
  /** Mois / année de la facture visée (défaut : mois en cours). */
  mois?: number;
  annee?: number;
  /** Photos du dossier patient par type ; chaîne vide = retirer la pièce. */
  pieces?: Partial<Record<TypePiece, string>>;
  /** Validation partielle : le dossier reste « à compléter ». */
  partiel?: boolean;
  /**
   * Identifiant unique de la saisie : renvoyée (hors ligne, réponse perdue), elle n'est
   * comptée qu'une fois par le serveur.
   */
  cleSynchronisation?: string;
}
