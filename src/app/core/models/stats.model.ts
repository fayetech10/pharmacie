export interface StatsData {
  nombreFactures: number;
  montantTotal: number;
  facturesParStatut: { [key: string]: number };
  facturesParRegion: { [key: string]: number };
  evolutionMensuelle: MonthData[];
}

export interface MonthData {
  mois: number;
  annee: number;
  nombreFactures: number;
  montantTotal: number;
}
