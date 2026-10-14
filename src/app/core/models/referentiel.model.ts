/**
 * Modèles des fonctionnalités ajoutées d'après le document « Fonctionnalités SEN-CSU » :
 * référentiel Service → Prestation → Prix (§5), districts (§6), module Hors CSU (§8),
 * consolidation et tableaux de bord (§9-§10).
 */

/** §5 — premier niveau du référentiel : Consultation, Maternité, Laboratoire… */
export interface ServiceMedical {
  id: string;
  code: string;
  nom: string;
  ordre: number;
  actif: boolean;
}

/** §5 — acte tarifé. Le prix porté ici fait foi : le serveur retarife chaque facture. */
export interface Prestation {
  id: string;
  code: string;
  designation: string;
  serviceId?: string;
  /** Renseigné par l'API de cache, pas par le CRUD. */
  serviceNom?: string;
  prix: number;
  /** §14 — prestation servie par la pharmacie : sa facturation sort du stock. */
  depositaire: boolean;
  /** Article de stock associé, obligatoire quand `depositaire` est vrai. */
  medicamentId?: string;
  actif: boolean;
}

/** Page renvoyée par la recherche paginée des prestations. */
export interface PagePrestations {
  content: Prestation[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/** §6 et §9 — échelon de consolidation entre la structure et la région. */
export interface District {
  id: string;
  code: string;
  nom: string;
  regionId?: string;
  regionNom?: string;
  telephone?: string;
  email?: string;
  actif: boolean;
}

/** §8 — tarif applicable aux patients payants. */
export interface TarifHorsCsu {
  id: string;
  code: string;
  designation: string;
  categorie?: string;
  prix: number;
  /** Null = tarif national ; sinon surcharge propre à la structure. */
  structureId?: string;
  /** Ligne nationale réservée à un type : « PS » = prestation par défaut des postes de santé. */
  typeStructure?: string | null;
  actif: boolean;
}

/**
 * Services proposés d'office ; s'y ajoutent ceux qu'emploient les tarifs de la structure
 * (catégories). Partagé par le paramétrage et la facturation, qui proposent la même liste.
 */
export const SERVICES_PAR_DEFAUT = ['Consultation', 'Soins', 'Maternité', 'Laboratoire', 'Vaccination',
  'Dépositaire', 'Analyses', 'Imagerie', 'Autre'];

export interface LigneHorsCsu {
  tarifId?: string;
  code?: string;
  designation: string;
  categorie?: string;
  quantite: number;
  prixUnitaire: number;
  montant?: number;
}

/** §8 — facture d'un patient payant. */
export interface FactureHorsCsu {
  id: string;
  numero: string;
  structureId: string;
  structureNom?: string;
  date: string;
  patientNom?: string;
  patientPrenom?: string;
  patientTelephone?: string;
  lignes: LigneHorsCsu[];
  montantTotal: number;
  montantEncaisse: number;
  modePaiement?: string;
  annulee: boolean;
  motifAnnulation?: string;
  createdByNom?: string;
}

/** §8 — situation de caisse journalière ou mensuelle. */
export interface SituationCaisse {
  debut: string;
  fin: string;
  libellePeriode: string;
  nombreFactures: number;
  nombreFacturesAnnulees: number;
  montantFacture: number;
  montantEncaisse: number;
  resteARecouvrer: number;
  parCategorie: Record<string, number>;
  parModePaiement: Record<string, number>;
  parJour: Record<string, number>;
}

/** Structure vue par la consolidation (forme renvoyée par service-identite). */
export interface StructureConsolidee {
  id: string;
  code: string;
  nom: string;
  typeStructure?: string;
  structureRattachementNom?: string;
  districtNom?: string;
  regionNom?: string;
  actif: boolean;
}

/** §9 — synthèse d'un district sur une période. */
export interface SyntheseDistrict {
  districtId: string;
  districtNom?: string;
  periode: string;
  nombreStructures: number;
  nombreFactures: number;
  nombreBeneficiaires: number;
  nombrePrestations: number;
  montantTotal: number;
  montantBeneficiaire: number;
  montantSencsu: number;
  structuresFacturees: StructureConsolidee[];
  structuresNonFacturees: StructureConsolidee[];
  parRegime: Record<string, number>;
  tauxCouverture: number;
}

/** Structure du tableau de bord district, avec sa facturation sur la période. */
export interface LigneStructureTableau {
  id: string;
  nom: string;
  type?: string;
  facturee: boolean;
  /** Factures soumises au centre, envoyées, validées ou payées. */
  facturesTransmises: number;
  /** Factures en brouillon ou rejetées : à transmettre ou à corriger. */
  facturesEnCours: number;
  montantSencsu: number;
}

/** §10 — tableau de bord d'un district. Toutes les factures de la période sont comptées. */
export interface TableauBord {
  districtId: string;
  districtNom?: string;
  periode: string;
  nombreStructures: number;
  nombreFactures: number;
  nombreBeneficiaires: number;
  nombrePrestations: number;
  montantTotal: number;
  montantBeneficiaire: number;
  montantSencsu: number;
  montantSencsuTransmis: number;
  montantSencsuEnCours: number;
  nombreFacturesTransmises: number;
  nombreFacturesEnCours: number;
  tauxCouverture: number;
  structuresFacturees: LigneStructureTableau[];
  structuresNonFacturees: LigneStructureTableau[];
  parRegime: Record<string, number>;
  montantParMois: Record<string, number>;
  facturesParMois: Record<string, number>;
}

/**
 * Activités du réseau d'une région (service régional, 14/10/2026). Toutes les factures de la
 * période, brouillons compris, ventilées « en cours » (brouillon / rejetée) et « transmises ».
 */
export interface IndicateursActivite {
  nombreFactures: number;
  facturesEnCours: number;
  facturesTransmises: number;
  /** Nombre de factures par statut (nom de StatutFacture). */
  parStatut: Record<string, number>;
  /** Patients distincts du périmètre. */
  patients: number;
  /** Visites = dossiers patients. */
  visites: number;
  dossiersACompleter: number;
  montantTotal: number;
  montantSencsu: number;
  montantSencsuTransmis: number;
  montantSencsuEnCours: number;
  /** Dernière modification d'une facture du périmètre (ISO). */
  derniereSaisie?: string | null;
}

export interface ResumeFactureActivite {
  id: string;
  numero?: string;
  regime: string;
  mois: number;
  annee: number;
  statut: string;
  etape?: string | null;
  patients: number;
  visites: number;
  dossiersACompleter: number;
  montantTotal: number;
  montantSencsu: number;
  importee: boolean;
  derniereSaisie?: string | null;
}

export interface ActiviteStructure {
  id: string;
  code?: string;
  nom: string;
  type?: 'PS' | 'CS' | 'EPS' | null;
  actif: boolean;
  siegeDistrict: boolean;
  structureRattachementNom?: string | null;
  indicateurs: IndicateursActivite;
  factures: ResumeFactureActivite[];
}

export interface ActiviteDistrict {
  /** null : structures de la région sans district (EPS notamment). */
  id: string | null;
  code?: string | null;
  nom: string;
  actif: boolean;
  nombrePostes: number;
  nombreCentres: number;
  nombreStructures: number;
  /** Structures ayant au moins une facture sur la période. */
  structuresActives: number;
  tauxActivite: number;
  indicateurs: IndicateursActivite;
  structures: ActiviteStructure[];
}

export interface ActivitesRegion {
  regionId: string;
  regionNom?: string | null;
  /** null : toute l'année. */
  mois: number | null;
  annee: number;
  periode: string;
  nombreDistricts: number;
  nombreStructures: number;
  structuresActives: number;
  indicateurs: IndicateursActivite;
  districts: ActiviteDistrict[];
}

/** Compte rendu d'un import Excel (référentiel, districts, structures). */
export interface ResultatImport {
  lignesLues: number;
  crees: number;
  misAJour: number;
  ignores?: number;
  servicesCrees?: number;
  erreurs: string[];
  /** Points à vérifier qui n'ont pas empêché l'import (prix manquants, services douteux…). */
  avertissements?: string[];
  comptesCrees?: string[];
}
