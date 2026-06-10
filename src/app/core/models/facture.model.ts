export enum StatutFacture {
  BROUILLON = 'BROUILLON',
  ENVOYEE = 'ENVOYEE',
  EN_VERIFICATION = 'EN_VERIFICATION',
  CONFORME = 'CONFORME',
  REJETEE = 'REJETEE',
  VALIDEE = 'VALIDEE'
}

export interface LigneFacture {
  patientNomPrenom?: string;
  patientMatricule?: string;
  medicament: string;
  codeProduit: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
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
}

export interface ValidationRequest {
  commentaire: string;
}
