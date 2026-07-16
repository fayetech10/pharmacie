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
  actif: boolean;
}

export interface StructureSanitaireRequest {
  code: string;
  nom: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  regionId: string;
  bcsuId?: string;
  password?: string;
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
  | 'BROUILLON' | 'ENVOYEE' | 'VALIDEE_SR' | 'REJETEE_SR'
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
  lettreGarantieNumero: string;
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
