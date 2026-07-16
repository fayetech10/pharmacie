import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Patient, LettreGarantie, LettreGarantieRequest, BonCommande } from '../models/bcsu.model';
import { HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class BcsuService {

  constructor(private api: ApiService) {}

  searchPatients(query: string): Observable<Patient[]> {
    return this.api.get<Patient[]>(`/patients/search?query=${encodeURIComponent(query)}`, { skipLoading: true });
  }

  createPatient(req: Partial<Patient>): Observable<Patient> {
    return this.api.post<Patient>('/patients', req);
  }

  getLettresGarantie(params?: { mois?: number; annee?: number; regime?: string }): Observable<LettreGarantie[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<LettreGarantie[]>('/lettres-garantie', { params: queryParams });
  }

  getLettreGarantie(id: string): Observable<LettreGarantie> {
    return this.api.get<LettreGarantie>(`/lettres-garantie/${id}`);
  }

  searchLettreGarantieByNumero(numero: string): Observable<LettreGarantie> {
    return this.api.get<LettreGarantie>(`/lettres-garantie/search?numero=${encodeURIComponent(numero)}`, { skipLoading: true });
  }

  createLettreGarantie(req: LettreGarantieRequest): Observable<LettreGarantie> {
    return this.api.post<LettreGarantie>('/lettres-garantie', req);
  }

  updateLettreGarantie(id: string, req: LettreGarantieRequest): Observable<LettreGarantie> {
    return this.api.put<LettreGarantie>(`/lettres-garantie/${id}`, req);
  }

  emettreLettreGarantie(id: string): Observable<LettreGarantie> {
    return this.api.post<LettreGarantie>(`/lettres-garantie/${id}/emettre`, {});
  }

  annulerLettreGarantie(id: string, motif: string): Observable<LettreGarantie> {
    return this.api.post<LettreGarantie>(`/lettres-garantie/${id}/annuler`, { motif });
  }

  exportLettreGarantiePdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/lettres-garantie/${id}/export/pdf`);
  }

  /** Liste des bons visibles par l'utilisateur (BCSU : les siens, SR : ceux de sa région). */
  getBonsCommande(params?: { mois?: number; annee?: number; regime?: string }): Observable<BonCommande[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<BonCommande[]>('/bons-commande', { params: queryParams });
  }

  createBonCommande(lettreGarantieId: string, nombreLignes: number): Observable<BonCommande> {
    return this.api.post<BonCommande>('/bons-commande', { lettreGarantieId, nombreLignes });
  }

  getBonCommande(id: string): Observable<BonCommande> {
    return this.api.get<BonCommande>(`/bons-commande/${id}`);
  }

  /** Bon existant pour une lettre (corps vide/null si aucun). */
  getBonByLettre(lettreGarantieId: string): Observable<BonCommande> {
    return this.api.get<BonCommande>(`/bons-commande/by-lettre/${lettreGarantieId}`);
  }

  searchBonCommandeByNumero(numero: string): Observable<BonCommande> {
    return this.api.get<BonCommande>(`/bons-commande/search?numero=${encodeURIComponent(numero)}`, { skipLoading: true });
  }

  exportBonCommandePdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/bons-commande/${id}/export/pdf`);
  }
}
