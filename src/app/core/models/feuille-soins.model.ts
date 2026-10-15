import { Regime } from './bcsu.model';

/**
 * Feuille de soins (formulaire papier ASCSU) — circuit :
 *  1. EMISE : délivrée au patient par l'agent bureau (BCSU) ;
 *  2. DEPOSEE_STRUCTURE : prise en charge remplie par la structure sanitaire ;
 *  3. FACTUREE : rattachée à la facture de la structure (fin du circuit).
 */
export enum StatutFeuilleSoins {
  EMISE = 'EMISE',
  DEPOSEE_STRUCTURE = 'DEPOSEE_STRUCTURE',
  FACTUREE = 'FACTUREE',
  ANNULEE = 'ANNULEE'
}

export const STATUT_FEUILLE_LABELS: Record<StatutFeuilleSoins, string> = {
  [StatutFeuilleSoins.EMISE]: 'Délivrée au patient',
  [StatutFeuilleSoins.DEPOSEE_STRUCTURE]: 'Déposée en structure',
  [StatutFeuilleSoins.FACTUREE]: 'Facturée',
  [StatutFeuilleSoins.ANNULEE]: 'Annulée'
};

/** Ligne du tableau « PRISE EN CHARGE » : Date | Désignation | Montant | Part Assuré | Part Assureur. */
export interface PrestationSoins {
  date: string; // yyyy-MM-dd
  designation: string;
  montant: number;
  partAssure?: number;
  partAssureur?: number;
}

export interface FeuilleSoins {
  id: string;
  numero: string;
  structureSanitaireId?: string;
  structureNom?: string;
  lettreGarantieId?: string;
  lettreGarantieNumero?: string;
  patientId?: string;
  patientNom: string;
  patientPrenom: string;
  patientTelephone?: string;
  /** Code assuré / N° immatriculation. */
  codeAssure?: string;
  sexe?: string;
  age?: number;
  accompagnantPrenomNom?: string;
  regime: Regime;
  prestations: PrestationSoins[];
  montantTotal: number;
  montantTotalAssure: number;
  montantTotalAssureur: number;
  statut: StatutFeuilleSoins;
  factureStructureId?: string;
  factureStructureNumero?: string;
  commentaireAnnulation?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

/** Délivrance par l'agent bureau (BCSU). */
export interface FeuilleSoinsRequest {
  patientId?: string;
  lettreGarantieNumero?: string;
  nom: string;
  prenom: string;
  regime: Regime;
  telephone?: string;
  codeAssure?: string;
  sexe?: string;
  age?: number;
  accompagnantPrenomNom?: string;
}

/** Remplissage de la prise en charge par la structure sanitaire. */
export interface PriseEnChargeFeuilleRequest {
  prestations: { date: string; designation: string; montant: number }[];
}
