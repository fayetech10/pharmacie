/** Ligne de la « base traité » (import Excel réservé au service régional de Thiès). */
export interface BaseTraite {
  id?: string;
  region?: string;
  departement?: string;
  commune?: string;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  sexe?: string;
  telephone?: string;
  adresse?: string;
  cniExtrait?: string;
  assureur?: string;
  regime?: string;
  typeAdhesion?: string;
  typeBeneficiaire?: string;
  typeCotisation?: string;
  dateCotisation?: string;
  photo?: string;
  indexExcel?: string;
  importedAt?: string;
  importedBy?: string;
}

/** Ligne de la « base immatriculé & imprimé ». */
export interface BaseImmatricule {
  id?: string;
  externalId?: string;
  dateEnregistrement?: string;
  codeImmatriculation?: string;
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  sexe?: string;
  telephone?: string;
  adresse?: string;
  regime?: string;
  assureur?: string;
  typeBeneficiaire?: string;
  dateCotisation?: string;
  dateFinCotisation?: string;
  qrCodeUrl?: string;
  region?: string;
  departement?: string;
  commune?: string;
  groupe?: string;
  typeAdhesion?: string;
  typeCotisation?: string;
  cni?: string;
  photo?: string;
  importedAt?: string;
  importedBy?: string;
}

/** Résultat d'un import de base (ajout sans doublons). */
export interface BaseImportResult {
  importes: number;
  doublons: number;
  echecs: number;
  erreurs: string[];
}
