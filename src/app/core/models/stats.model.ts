export interface StatsData {
  // Indicateurs principaux
  nombreFactures: number;
  montantTotal: number;
  montantCsu: number;
  montantMoyen: number;

  // Nouveaux indicateurs (poussés)
  totalPatients: number;
  totalLettresGarantie: number;
  totalFeuillesSoins: number;

  // Indicateurs de performance
  tauxValidation: number;
  tauxRejet: number;
  delaiMoyenTraitementJours: number;
  lignesAcceptees: number;
  lignesRejetees: number;

  // Répartitions
  facturesParStatut: { [key: string]: number };
  montantParStatut: { [key: string]: number };
  lignesParRegime: { [key: string]: number };
  montantParRegime: { [key: string]: number };
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

export interface AgentStat {
  id: string;
  nom: string;
  structure: string;
  dossiersTraites: number;
  lettresEmises: number;
  feuillesSoins: number;
  anomalies: number;
  tempsMoyen: number;
  heuresTravailleesSemaine: number;
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
