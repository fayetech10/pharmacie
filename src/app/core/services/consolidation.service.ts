import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { SyntheseDistrict, TableauBord } from '../models/referentiel.model';
import { FactureStructure } from '../models/structure.model';

/** Filtres communs à toutes les vues de consolidation. */
export interface FiltresConsolidation {
  districtId?: string;
  mois?: number;
  annee?: number;
  regime?: string;
}

/**
 * Consolidation district (§9) et tableaux de bord (§10).
 *
 * <p>Une seule requête ramène les factures des postes ET des centres du district : le
 * service centre agrège les deux origines, le client n'a pas à savoir qu'elles viennent
 * de deux microservices différents.</p>
 */
@Injectable({ providedIn: 'root' })
export class ConsolidationService {

  constructor(private api: ApiService) {}

  /** Factures consolidées du district — postes et centres réunis. */
  getFactures(filtres: FiltresConsolidation): Observable<FactureStructure[]> {
    return this.api.get<FactureStructure[]>('/consolidation/factures',
      { params: this.parametres(filtres) });
  }

  /** Synthèse : volumétrie, montants, structures facturées et non facturées. */
  getSynthese(filtres: FiltresConsolidation): Observable<SyntheseDistrict> {
    return this.api.get<SyntheseDistrict>('/consolidation/synthese',
      { params: this.parametres(filtres) });
  }

  getTableauBord(filtres: FiltresConsolidation): Observable<TableauBord> {
    return this.api.get<TableauBord>('/consolidation/tableau-bord',
      { params: this.parametres(filtres) });
  }

  /** Classeur Excel : synthèse, facturation, régimes, puis une feuille par structure (§9). */
  exporterExcel(filtres: FiltresConsolidation): Observable<Blob> {
    return this.api.getBlob(`/consolidation/export.xlsx?${this.parametres(filtres)}`);
  }

  /** « Situation 0-5 ans » 1/2 : classeur des factures 0-5 ans, une feuille par poste / centre. */
  exporterSituationEnfantsExcel(filtres: FiltresConsolidation): Observable<Blob> {
    return this.api.getBlob(`/consolidation/enfants/situation.xlsx?${this.parametres(filtres)}`);
  }

  /** « Situation 0-5 ans » 2/2 : « Liste + facture 0-5 ans » de chaque poste et centre, en un PDF. */
  exporterFacturesEnfantsPdf(filtres: FiltresConsolidation): Observable<Blob> {
    return this.api.getBlob(`/consolidation/enfants/factures.pdf?${this.parametres(filtres)}`);
  }

  /** PDF de situation globale du district (§9). */
  exporterPdf(filtres: FiltresConsolidation): Observable<Blob> {
    return this.api.getBlob(`/consolidation/situation.pdf?${this.parametres(filtres)}`);
  }

  /** Enfants de moins de 5 ans : situation globale du district (modèle RECAP_ENFANTS_5ANS). */
  exporterSituationEnfants(filtres: FiltresConsolidation): Observable<Blob> {
    return this.api.getBlob(`/consolidation/enfants/situation.pdf?${this.parametres(filtres)}`);
  }

  /** Enfants de moins de 5 ans : liste nominative consolidée du district (modèle LISTE_ENFANTS_5ANS). */
  exporterListeEnfants(filtres: FiltresConsolidation): Observable<Blob> {
    return this.api.getBlob(`/consolidation/enfants/liste.pdf?${this.parametres(filtres)}`);
  }

  private parametres(filtres: FiltresConsolidation): HttpParams {
    let params = new HttpParams();
    if (filtres.districtId) params = params.set('districtId', filtres.districtId);
    if (filtres.mois) params = params.set('mois', String(filtres.mois));
    if (filtres.annee) params = params.set('annee', String(filtres.annee));
    if (filtres.regime) params = params.set('regime', filtres.regime);
    return params;
  }
}
