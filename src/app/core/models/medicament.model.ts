export enum StatutMedicament {
  ELIGIBLE = 'ELIGIBLE',
  EXCLU = 'EXCLU'
}

export interface Medicament {
  id: string;
  code: string;
  nom: string;
  dci?: string;
  classeTherapeutique?: string;
  liste?: string;
  statut: StatutMedicament;
  description: string;
  motif?: string; // Motif d'exclusion (pour les médicaments EXCLU)
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}
