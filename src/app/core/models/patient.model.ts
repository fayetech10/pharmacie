import { Patient, LettreGarantie, BonCommande } from './bcsu.model';
import { LigneFacture } from './facture.model';
import { FactureStructure } from './structure.model';
import { FeuilleSoins } from './feuille-soins.model';

export interface DossierPatientDto {
  patient: Patient;
  lettresGarantie: LettreGarantie[];
  bonsCommande: BonCommande[];
  lignesFactureOfficine: LigneFacture[];
  facturesStructure: FactureStructure[];
  feuillesSoins: FeuilleSoins[];
  /** Photo du porteur reprise de sa carte CSU (contrôle d'éligibilité en Espace PS), si connue. */
  photoAssure?: string | null;
}
