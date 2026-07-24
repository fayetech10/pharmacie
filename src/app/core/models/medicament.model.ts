export enum StatutMedicament {
  ELIGIBLE = 'ELIGIBLE',
  EXCLU = 'EXCLU',
  // Ajouté par un pharmacien, ni éligible ni exclu : en attente de classement par la SEN-CSU.
  NON_REPERTORIE = 'NON_REPERTORIE'
}

export interface Medicament {
  id: string;
  code: string;
  nom: string;
  dci?: string;
  classeTherapeutique?: string;
  liste?: string;
  /** Prix de référence (FCFA) issu de l'import éligibles ; classe les équivalences. */
  prixReference?: number;
  statut: StatutMedicament;
  description: string;
  motif?: string; // Motif d'exclusion (pour les médicaments EXCLU)
  actif: boolean;
  createdAt: string;
  updatedAt: string;
}
