import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { StructureSanitaire, StructureSanitaireRequest, FactureStructure, FactureStructureRequest } from '../models/structure.model';
import { LettreGarantie } from '../models/bcsu.model';
import { HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class StructureService {

  constructor(private api: ApiService) {}

  // ----- Gestion des structures (ADMIN / Service Régional) -----
  getStructures(): Observable<StructureSanitaire[]> {
    return this.api.get<StructureSanitaire[]>('/structures-sanitaires');
  }
  /** Récupère les structures rattachées à un agent BCSU (accessible à tout rôle). */
  getStructuresByBcsu(bcsuId: string): Observable<StructureSanitaire[]> {
    return this.api.get<StructureSanitaire[]>(`/structures-sanitaires/by-bcsu/${bcsuId}`, { skipLoading: true });
  }
  createStructure(req: StructureSanitaireRequest): Observable<StructureSanitaire> {
    return this.api.post<StructureSanitaire>('/structures-sanitaires', req);
  }
  updateStructure(id: string, req: StructureSanitaireRequest): Observable<StructureSanitaire> {
    return this.api.put<StructureSanitaire>(`/structures-sanitaires/${id}`, req);
  }
  deleteStructure(id: string): Observable<void> {
    return this.api.delete<void>(`/structures-sanitaires/${id}`);
  }

  // ----- Facturation structure sanitaire -----
  rechercherLettre(numero: string): Observable<LettreGarantie> {
    return this.api.get<LettreGarantie>(`/factures-structure/rechercher-lettre?numero=${encodeURIComponent(numero)}`, { skipLoading: true });
  }
  getFactures(params?: { mois?: number; annee?: number; regime?: string }): Observable<FactureStructure[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<FactureStructure[]>('/factures-structure', { params: queryParams });
  }
  getFacture(id: string): Observable<FactureStructure> {
    return this.api.get<FactureStructure>(`/factures-structure/${id}`);
  }
  createFacture(req: FactureStructureRequest): Observable<FactureStructure> {
    return this.api.post<FactureStructure>('/factures-structure', req);
  }
  updateFacture(id: string, req: FactureStructureRequest): Observable<FactureStructure> {
    return this.api.put<FactureStructure>(`/factures-structure/${id}`, req);
  }
  envoyerFacture(id: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/envoyer`, {});
  }
  /** Envoi groupé de la facture mensuelle : tous les brouillons du régime + mois/année. */
  envoyerGroupe(regime: string, mois: number, annee: number): Observable<FactureStructure[]> {
    return this.api.post<FactureStructure[]>('/factures-structure/envoyer-groupe', { regime, mois, annee });
  }
  /** Service Régional : valide une facture reçue (ENVOYEE → VALIDEE_SR). */
  validerFacture(id: string, commentaire?: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/valider`, { commentaire });
  }
  /** Service Régional : rejette une facture reçue (ENVOYEE → REJETEE_SR), motif obligatoire. */
  rejeterFacture(id: string, motif: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/rejeter`, { commentaire: motif });
  }
  deleteFacture(id: string): Observable<void> {
    return this.api.delete<void>(`/factures-structure/${id}`);
  }

  exportFactureExcel(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/excel`);
  }

  exportFactureWord(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/word`);
  }

  exportFacturePdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/pdf`);
  }

  exportGroupeExcel(structureId: string, regime: string, mois: number, annee: number): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/export-groupe/excel?structureId=${structureId}&regime=${regime}&mois=${mois}&annee=${annee}`);
  }

  exportGroupePdf(structureId: string, regime: string, mois: number, annee: number): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/export-groupe/pdf?structureId=${structureId}&regime=${regime}&mois=${mois}&annee=${annee}`);
  }
}
