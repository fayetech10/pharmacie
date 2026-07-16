import { Facture, StatutFacture } from './facture.model';
import { FactureStructure, StatutFactureStructure } from './structure.model';

export type ProviderType = 'PHARMACIE' | 'STRUCTURE';

export interface UnifiedProvider {
  id: string;
  nom: string;
  code: string;
  type: ProviderType;
}

export interface UnifiedFacture {
  id: string;
  providerId: string;
  providerNom: string;
  providerType: ProviderType;
  montantTotal: number;
  statut: string; // StatutFacture | StatutFactureStructure
  mois: number;
  annee: number;
  date?: string; // e.g. date d'envoi ou createdAt
  originalFacturePharmacie?: Facture;
  originalFactureStructure?: FactureStructure;
  regime?: string;
}

export function mapToUnifiedFacture(f: Facture | FactureStructure, type: ProviderType): UnifiedFacture {
  if (type === 'PHARMACIE') {
    const facture = f as Facture;
    let dateStr = facture.createdAt;
    if (facture.historique) {
      const envoi = facture.historique.find(h => h.statut === StatutFacture.ENVOYEE);
      if (envoi) dateStr = envoi.date;
    }
    return {
      id: facture.id,
      providerId: facture.pharmacieId,
      providerNom: facture.pharmacieNom,
      providerType: 'PHARMACIE',
      montantTotal: facture.montantTotal,
      statut: facture.statut,
      mois: facture.mois,
      annee: facture.annee,
      date: dateStr,
      originalFacturePharmacie: facture
    };
  } else {
    const factureStr = f as FactureStructure;
    return {
      id: factureStr.id,
      providerId: factureStr.structureSanitaireId,
      providerNom: factureStr.structureNom,
      providerType: 'STRUCTURE',
      annee: factureStr.annee,
      montantTotal: factureStr.montantTotalSencsu || 0, // La part de la caisse (Sencsu)
      statut: factureStr.statut,
      mois: factureStr.mois,
      date: factureStr.createdAt,
      originalFactureStructure: factureStr,
      regime: factureStr.regime
    };
  }
}
