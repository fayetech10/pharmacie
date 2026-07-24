export enum StatutFacture {
  BROUILLON = 'BROUILLON',
  SOUMISE_CS = 'SOUMISE_CS',
  REJETEE_CS = 'REJETEE_CS',
  ENVOYEE = 'ENVOYEE',
  VALIDEE_SR = 'VALIDEE_SR',
  REJETEE_SR = 'REJETEE_SR',
  VALIDEE_NC = 'VALIDEE_NC',
  REJETEE_NC = 'REJETEE_NC',
  PAYEE = 'PAYEE'
}

export enum StatutLigne {
  EN_ATTENTE = 'EN_ATTENTE',
  ACCEPTEE = 'ACCEPTEE',
  REJETEE = 'REJETEE'
}

export interface LigneFacture {
  patientNomPrenom?: string;
  patientMatricule?: string;
  medicament: string;
  codeProduit: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  statutLigne?: StatutLigne;
  motifRejet?: string;
  // Vrai si le pharmacien a ajouté lui-même ce médicament (non répertorié) :
  // alimente la colonne « Observation » des factures Excel (à valider par la SEN-CSU).
  ajouteParPharmacien?: boolean;
  // Pièces justificatives du dossier patient (images base64 / data URL)
  ticketCaisse?: string;
  bonCommande?: string;
  bonCommandeNumero?: string;
  ordonnance?: string;
  
  // Ajouté pour l'affichage de l'historique dans le dossier patient
  pharmacieNom?: string;
}

export interface LigneDecisionRequest {
  accepter: boolean;
  motif?: string;
}

/**
 * Projection minimale d'une facture (identifiant + statut) servant les badges de
 * notification : évite de transférer les lignes de facture à chaque navigation.
 */
export interface FactureStatutLight {
  id: string;
  statut: string;
}

export interface HistoriqueAction {
  date: string;
  utilisateurId: string;
  utilisateurNom: string;
  statut: StatutFacture;
  commentaire: string;
}

export interface Facture {
  id: string;
  pharmacieId: string;
  pharmacieNom: string;
  regionId: string;
  mois: number;
  annee: number;
  montantTotal: number;
  statut: StatutFacture;
  lignes: LigneFacture[];
  historique: HistoriqueAction[];
  commentaireRejet?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactureRequest {
  mois: number;
  annee: number;
  lignes: LigneFactureDto[];
}

export interface LigneFactureDto {
  patientNomPrenom?: string;
  patientMatricule?: string;
  medicament: string;
  codeProduit: string;
  quantite: number;
  prixUnitaire: number;
  ticketCaisse?: string;
  bonCommande?: string;
  bonCommandeNumero?: string;
  ordonnance?: string;
}

export interface ValidationRequest {
  commentaire: string;
}
