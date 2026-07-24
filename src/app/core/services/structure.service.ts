import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { StructureSanitaire, StructureSanitaireRequest, FactureStructure, FactureStructureRequest, ImportResult, LigneFactureStructure } from '../models/structure.model';
import { LettreGarantie } from '../models/bcsu.model';
import { FactureStatutLight } from '../models/facture.model';
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
  /** Postes de santé polarisés (rattachés) par une structure sanitaire. */
  getPostes(structureId: string): Observable<StructureSanitaire[]> {
    return this.api.get<StructureSanitaire[]>(`/structures-sanitaires/${structureId}/postes`, { skipLoading: true });
  }
  /** Import Excel d'une liste de postes de santé (Service Régional). */
  importPostes(file: File): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<ImportResult>('/structures-sanitaires/import-postes', formData);
  }
  /** Modèle Excel à remplir pour l'import des structures (EPS, CS, PS). */
  downloadModeleImportPostes(): Observable<Blob> {
    return this.api.getBlob('/structures-sanitaires/import-postes-template');
  }

  /** Export Excel des structures avec leurs identifiants de connexion. */
  exportStructures(): Observable<Blob> {
    return this.api.getBlob('/structures-sanitaires/export');
  }

  /** Purge les factures de structure restées en brouillon (jamais envoyées). */
  purgerBrouillons(structureId?: string): Observable<{ supprimees: number }> {
    const qs = structureId ? `?structureId=${encodeURIComponent(structureId)}` : '';
    return this.api.delete<{ supprimees: number }>(`/factures-structure/brouillons${qs}`);
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
  /**
   * Identifiants + statuts des factures structure visibles, pour les badges de
   * notification. Charge utile minimale et sans overlay de chargement.
   */
  getFacturesStatuts(): Observable<FactureStatutLight[]> {
    return this.api.get<FactureStatutLight[]>('/factures-structure/statuts', { skipLoading: true });
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
  /** Centre de Santé : valide la facture d'un poste (SOUMISE_CS → ENVOYEE). */
  validerFacturePoste(id: string, commentaire?: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/valider-poste`, { commentaire });
  }
  /** Centre de Santé : rejette la facture d'un poste (SOUMISE_CS → REJETEE_CS), motif obligatoire. */
  rejeterFacturePoste(id: string, motif: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/rejeter-poste`, { commentaire: motif });
  }
  deleteFacture(id: string): Observable<void> {
    return this.api.delete<void>(`/factures-structure/${id}`);
  }
  /** Factures (envoyées et suivantes) des postes de santé rattachés à la structure courante. */
  getFacturesPostes(params?: { mois?: number; annee?: number; regime?: string }): Observable<FactureStructure[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<FactureStructure[]>('/factures-structure/postes-rattaches', { params: queryParams });
  }
  /** Supprime la saisie complète d'un patient (par n° de LG) avant l'envoi mensuel. */
  deleteFacturePatient(factureId: string, lettreNumero: string): Observable<FactureStructure> {
    return this.api.delete<FactureStructure>(`/factures-structure/${factureId}/patients?lettre=${encodeURIComponent(lettreNumero)}`);
  }
  /** Modifie une prestation (ligne) avant l'envoi mensuel. */
  updateFactureLigne(factureId: string, index: number, ligne: Partial<LigneFactureStructure>): Observable<FactureStructure> {
    return this.api.put<FactureStructure>(`/factures-structure/${factureId}/lignes/${index}`, ligne);
  }
  /** Supprime une prestation (ligne) avant l'envoi mensuel. */
  deleteFactureLigne(factureId: string, index: number): Observable<FactureStructure> {
    return this.api.delete<FactureStructure>(`/factures-structure/${factureId}/lignes/${index}`);
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
