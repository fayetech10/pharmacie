export enum StatutFacture {
  BROUILLON = 'BROUILLON',
  ENVOYEE = 'ENVOYEE',
  EN_VERIFICATION = 'EN_VERIFICATION',
  A_CORRIGER = 'A_CORRIGER',
  CONFORME = 'CONFORME',
  REJETEE = 'REJETEE',
  VALIDEE = 'VALIDEE'
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
  // Pièces justificatives du dossier patient (images base64 / data URL)
  ticketCaisse?: string;
  bonCommande?: string;
  ordonnance?: string;
}

export interface LigneDecisionRequest {
  accepter: boolean;
  motif?: string;
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
  ordonnance?: string;
}

export interface ValidationRequest {
  commentaire: string;
}
