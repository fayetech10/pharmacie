/**
 * Catégories alignées sur le classeur « GESTION DES FACTURES CS_EPS »
 * (un onglet par catégorie). DIALYSE et BSF_CEC sont conservés uniquement
 * pour lire les données existantes — plus proposés à la sélection.
 */
export enum Regime {
  CONTRIBUTIF = 'CONTRIBUTIF',
  SESAME = 'SESAME',
  CESARIENNE = 'CESARIENNE',
  ZERO_CINQ_ANS = 'ZERO_CINQ_ANS',
  DIALYSE_PERITONEALE = 'DIALYSE_PERITONEALE',
  HEMODIALYSE = 'HEMODIALYSE',
  BSF = 'BSF',
  CEC = 'CEC',
  NDONGO_DARA = 'NDONGO_DARA',
  /** Régime contributif des élèves (distinct de Ndongo Daara). */
  ELEVES = 'ELEVES',
  /** @deprecated scindé en DIALYSE_PERITONEALE / HEMODIALYSE. */
  DIALYSE = 'DIALYSE',
  /** BSF et CEC facturés ensemble : catégorie du poste de santé (les centres les distinguent). */
  BSF_CEC = 'BSF_CEC'
}

export const REGIME_LABELS: Record<Regime, string> = {
  [Regime.CONTRIBUTIF]: 'Classique (Contributif)',
  [Regime.SESAME]: 'Sésame',
  [Regime.CESARIENNE]: 'Césarienne',
  [Regime.ZERO_CINQ_ANS]: 'Enfants 0-5 ans',
  [Regime.DIALYSE_PERITONEALE]: 'Dialyse péritonéale',
  [Regime.HEMODIALYSE]: 'Hémodialyse',
  [Regime.BSF]: 'BSF (Bourse de Sécurité Familiale)',
  [Regime.CEC]: 'CEC (Carte Égalité des Chances)',
  [Regime.NDONGO_DARA]: 'Ndongo Daara',
  [Regime.ELEVES]: 'Élèves',
  [Regime.DIALYSE]: 'Dialyse (ancien)',
  [Regime.BSF_CEC]: 'BSF / CEC'
};

/** Catégories sélectionnables dans les formulaires (les régimes hérités sont exclus). */
export const REGIME_OPTIONS: Regime[] = [
  Regime.CONTRIBUTIF,
  Regime.ZERO_CINQ_ANS,
  Regime.CESARIENNE,
  Regime.DIALYSE_PERITONEALE,
  Regime.HEMODIALYSE,
  Regime.BSF,
  Regime.CEC,
  Regime.SESAME,
  Regime.NDONGO_DARA,
  Regime.ELEVES
];

/**
 * Catégories proposées au niveau Poste de santé : liste restreinte (demande métier).
 * BSF et CEC y sont regroupés en une seule entrée (Regime.BSF_CEC) ; dialyse,
 * hémodialyse et Ndongo Dara ne sont pas proposés au poste.
 */
export const REGIME_OPTIONS_POSTE: Regime[] = [
  Regime.ZERO_CINQ_ANS,
  Regime.SESAME,
  Regime.CONTRIBUTIF,
  Regime.CESARIENNE,
  Regime.BSF_CEC
];

/** Libellés spécifiques au Poste : « Classique » (au lieu de « Classique (Contributif) ») et « BSF / CEC » regroupé. */
export const REGIME_LABELS_POSTE: Partial<Record<Regime, string>> = {
  [Regime.CONTRIBUTIF]: 'Classique',
  [Regime.BSF_CEC]: 'BSF / CEC'
};

/**
 * Régimes dont le bénéficiaire porte une carte CSU : elle est vérifiée sur
 * carte.sencsu.sn avant toute saisie (poste de santé comme agent BCSU). Les autres
 * régimes (gratuités) s'identifient par une pièce d'identité.
 */
export const REGIMES_AVEC_CARTE: Regime[] = [Regime.CONTRIBUTIF, Regime.BSF, Regime.CEC, Regime.BSF_CEC];

export function exigeCarteCsu(regime: Regime | null | undefined): boolean {
  return !!regime && REGIMES_AVEC_CARTE.includes(regime);
}

/** Régimes contributifs (Classique, Ndongo Daara, Élèves) : 80 % SEN-CSU / 20 % patient. */
export const REGIMES_CONTRIBUTIFS: Regime[] = [Regime.CONTRIBUTIF, Regime.NDONGO_DARA, Regime.ELEVES];

/** Miroir de Regime.tauxBeneficiaire() côté backend, pour un aperçu instantané en formulaire. */
export function tauxBeneficiaire(regime: Regime | null | undefined): number {
  return !!regime && REGIMES_CONTRIBUTIFS.includes(regime) ? 0.20 : 0;
}

export function tauxSencsu(regime: Regime | null | undefined): number {
  return 1 - tauxBeneficiaire(regime);
}

export enum StatutLettreGarantie {
  BROUILLON = 'BROUILLON',
  EMISE = 'EMISE',
  ANNULEE = 'ANNULEE'
}

export enum StatutBonCommande {
  EMIS = 'EMIS',
  ANNULE = 'ANNULE'
}

export interface Patient {
  id?: string;
  nom: string;
  prenom: string;
  telephone: string;
  regime: Regime;
  numeroCni?: string;
  numeroAssure?: string;
  /** yyyy-MM-dd (extraite de la CNI par OCR ou saisie manuellement). */
  dateNaissance?: string;
  /** Sexe du bénéficiaire ("M"/"F") — colonne obligatoire du classeur CS_EPS. */
  sexe?: string;
  actif?: boolean;
  /** Date d'enregistrement (ISO) — sert au tri « dernier en haut » et au filtre par mois. */
  createdAt?: string;
}

export interface PrestationGarantie {
  designation: string;
  datePriseEnCharge: string;
  montant: number;
  motifCesarienne?: string;
  montantBeneficiaire?: number;
  montantSencsu?: number;
}

export interface LettreGarantie {
  id: string;
  numero: string;
  patientId: string;
  patientNom: string;
  patientPrenom: string;
  patientTelephone: string;
  patientDateNaissance?: string;
  /** Sexe du bénéficiaire ("M"/"F") capturé au moment du dossier. */
  patientSexe?: string;
  patientNumeroAssure?: string;
  structureNom?: string;
  regime: Regime;
  prestations: PrestationGarantie[];
  montantTotal: number;
  montantTotalBeneficiaire: number;
  montantTotalSencsu: number;
  statut: StatutLettreGarantie;
  cniRecto?: string;
  cniVerso?: string;
  /** Carte d'assuré (recto uniquement) — régimes Classique et BSF/CEC. */
  carteAssureRecto?: string;
  /** Document libre (extrait de naissance pour le régime 0-5 ans) + intitulé. */
  autreDocument?: string;
  autreDocumentTitre?: string;
  cniNumeroOcr?: string;
  /** Issue de la vérification de la carte CSU (« VERIFIEE » / « NON_VERIFIEE_PANNE »). */
  verificationCarte?: string;
  /** Date de prise en charge (« aaaa-mm-jj ») : range le patient dans la facture de son mois. */
  datePriseEnCharge?: string;
  /** Enfants 0-5 ans : accompagnant (sa CNI est la clé de rapprochement) et extrait de naissance. */
  accompagnantNom?: string;
  accompagnantCni?: string;
  numeroExtraitNaissance?: string;
  /** Centres et EPS : facture mensuelle où la saisie a placé le patient (à compléter par la structure). */
  factureStructureId?: string;
  factureStructureNumero?: string;
  commentaireAnnulation?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface LettreGarantieRequest {
  patientId?: string;
  nom: string;
  prenom: string;
  telephone: string;
  regime: Regime;
  numeroCni?: string;
  numeroAssure?: string;
  dateNaissance?: string;
  /** Sexe du bénéficiaire ("M"/"F") — colonne obligatoire du classeur CS_EPS. */
  sexe?: string;
  prestations: PrestationGarantie[];
  cniRecto?: string;
  cniVerso?: string;
  carteAssureRecto?: string;
  autreDocument?: string;
  autreDocumentTitre?: string;
  verificationCarte?: string;
  /** « aaaa-mm-jj » ; aujourd'hui si absente. */
  datePriseEnCharge?: string;
  accompagnantNom?: string;
  accompagnantCni?: string;
  numeroExtraitNaissance?: string;
}

export interface BonCommande {
  id: string;
  numero: string;
  lettreGarantieId: string;
  lettreGarantieNumero: string;
  patientNom: string;
  patientPrenom: string;
  patientMatricule?: string;
  regime: Regime;
  nombreLignes: number;
  /** Nombre de lignes déjà consommées (toutes pharmacies confondues). */
  lignesUtilisees?: number;
  prestations: PrestationGarantie[];
  montantTotal: number;
  montantTotalBeneficiaire: number;
  montantTotalSencsu: number;
  statut: StatutBonCommande;
  createdAt: string;
  createdBy?: string;
}

export interface Pointage {
  id?: string;
  userId: string;
  userNom: string;
  userPrenom: string;
  role: string;
  date: string;
  heureArrivee: string;
  heureDepart?: string;
  derniereConnexion: string;
}

/** Constat d'activité décrit par un agent BCSU pour un régime donné. */
export interface Constat {
  id: string;
  regime: Regime;
  description: string;
  agentNom?: string;
  agentPrenom?: string;
  structureNom?: string;
  createdAt: string;
  createdBy?: string;
}

export interface ConstatRequest {
  regime: Regime;
  description: string;
}


