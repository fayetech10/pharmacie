import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { FeuilleSoins, FeuilleSoinsRequest, PriseEnChargeFeuilleRequest } from '../models/feuille-soins.model';
import { HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class FeuilleSoinsService {

  constructor(private api: ApiService) {}

  /** Liste selon le rôle (BCSU : les siennes, SR : sa région, structure : déposées chez elle). */
  getAll(params?: { mois?: number; annee?: number; regime?: string }): Observable<FeuilleSoins[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<FeuilleSoins[]>('/feuilles-soins', { params: queryParams });
  }

  getById(id: string): Observable<FeuilleSoins> {
    return this.api.get<FeuilleSoins>(`/feuilles-soins/${id}`);
  }

  /** La structure retrouve la feuille présentée par le patient. */
  searchByNumero(numero: string): Observable<FeuilleSoins> {
    return this.api.get<FeuilleSoins>(`/feuilles-soins/search?numero=${encodeURIComponent(numero)}`, { skipLoading: true });
  }

  /** Étape 1 — délivrance par l'agent bureau (BCSU). */
  delivrer(req: FeuilleSoinsRequest): Observable<FeuilleSoins> {
    return this.api.post<FeuilleSoins>('/feuilles-soins', req);
  }

  /** Étape 2 — la structure sanitaire remplit la prise en charge. */
  remplirPriseEnCharge(id: string, req: PriseEnChargeFeuilleRequest): Observable<FeuilleSoins> {
    return this.api.post<FeuilleSoins>(`/feuilles-soins/${id}/prise-en-charge`, req);
  }

  annuler(id: string, motif: string): Observable<FeuilleSoins> {
    return this.api.post<FeuilleSoins>(`/feuilles-soins/${id}/annuler`, { motif });
  }

  /** PDF au format du formulaire papier ASCSU. */
  exportPdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/feuilles-soins/${id}/export/pdf`);
  }
}
