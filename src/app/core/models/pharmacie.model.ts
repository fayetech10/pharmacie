export interface Pharmacie {
  id: string;
  code: string;
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  regionId: string;
  responsableId?: string;
  actif: boolean;
}

export interface PharmacieRequest {
  code: string;
  nom: string;
  adresse: string;
  telephone: string;
  email: string;
  regionId: string;
  password?: string;
}

export interface PharmacieImportResult {
  importes: number;
  echecs: number;
  erreurs: string[];
}
