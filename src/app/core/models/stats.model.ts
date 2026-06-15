export interface StatsData {
  // Indicateurs principaux
  nombreFactures: number;
  montantTotal: number;
  montantCsu: number;
  montantMoyen: number;

  // Indicateurs de performance
  tauxValidation: number;
  tauxRejet: number;
  delaiMoyenTraitementJours: number;
  lignesAcceptees: number;
  lignesRejetees: number;

  // Répartitions
  facturesParStatut: { [key: string]: number };
  montantParStatut: { [key: string]: number };
  parRegion: RegionStat[];
  topPharmacies: PharmacieStat[];
  topMedicaments: MedicamentStat[];

  evolutionMensuelle: MonthData[];
}

export interface MonthData {
  mois: number;
  annee: number;
  nombreFactures: number;
  montantTotal: number;
}

export interface MedicamentStat {
  nom: string;
  quantite: number;
  montant: number;
  nombreLignes: number;
}

export interface PharmacieStat {
  id: string;
  nom: string;
  nombreFactures: number;
  montant: number;
}

export interface RegionStat {
  id: string;
  nom: string;
  nombreFactures: number;
  montant: number;
}
