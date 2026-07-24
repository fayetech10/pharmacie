import { Regime } from './bcsu.model';

export interface StructureSanitaire {
  id: string;
  code: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  regionId: string;
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
  bcsuId?: string;
  password?: string;
  /** Poste de santé : structure sanitaire (CS/EPS) de rattachement. */
  structureRattachementId?: string;
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

  // Champs spécifiques par catégorie
  numeroRegistre?: string;
  ircIra?: string;
  indicationCbt?: string;
  numeroRegistreBloc?: string;
  dateHeureIntervention?: string;
  dureeHospitalisationJours?: number;
}

export interface DocumentComplementaire {
  titre: string;
  image?: string;
  lettreGarantieNumero?: string;
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
  commentaireRejet?: string;
  createdAt: string;
  updatedAt: string;
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
  diagnostique?: string;
  /** Identité complémentaire du bénéficiaire (classeur CS_EPS). */
  patientDateNaissance?: string;
  patientSexe?: string;
  patientAdresse?: string;
  patientMatricule?: string;
  patientNumeroCni?: string;
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
}
