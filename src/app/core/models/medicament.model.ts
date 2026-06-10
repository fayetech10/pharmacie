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
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}
