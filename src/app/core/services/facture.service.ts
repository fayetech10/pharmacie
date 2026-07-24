import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { FactureEventsService } from './facture-events.service';
import { Facture, FactureRequest, ValidationRequest, LigneDecisionRequest, FactureStatutLight } from '../models/facture.model';
import { Observable, tap } from 'rxjs';
import { HttpParams } from '@angular/common/http';

/** Résultat du contrôle de délivrance mensuelle (voir FactureService.controlerDelivrance). */
export interface ControleDelivrance {
  quantiteDejaDelivree: number;
  delivrances: { pharmacieNom?: string; medicament?: string; quantite: number }[];
}

@Injectable({
  providedIn: 'root'
})
export class FactureService {

  constructor(private api: ApiService, private events: FactureEventsService) {}

  /** Notifie les vues abonnées qu'une facture a été modifiée (rafraîchissement live). */
  private notify<T>() {
    return tap<T>(() => this.events.notifyChanged());
  }

  getAll(params?: { mois?: number; annee?: number; regime?: string }): Observable<Facture[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime); // Backend for Facture controller might not use regime, but we'll send it if present
    }
    return this.api.get<Facture[]>('/factures', { params: queryParams });
  }

  /**
   * Identifiants + statuts des factures visibles, pour les badges de notification.
   * Charge utile minimale et sans overlay de chargement (rafraîchissement discret).
   */
  getStatuts(): Observable<FactureStatutLight[]> {
    return this.api.get<FactureStatutLight[]>('/factures/statuts', { skipLoading: true });
  }

  getById(id: string): Observable<Facture> {
    return this.api.get<Facture>(`/factures/${id}`);
  }

  create(req: FactureRequest): Observable<Facture> {
    return this.api.post<Facture>('/factures', req).pipe(this.notify());
  }

  getCurrent(): Observable<Facture> {
    return this.api.get<Facture>('/factures/current');
  }

  getRetards(): Observable<Facture[]> {
    return this.api.get<Facture[]>('/factures/retards');
  }

  /**
   * Contrôle « médicament déjà délivré durant le mois » sur la base NATIONALE
   * (toutes pharmacies, toutes régions). Le bénéficiaire est identifié par son
   * matricule et, à défaut, par son nom (cas d'un bon de commande physique).
   */
  controlerDelivrance(req: { matricule?: string; nom?: string; medicament: string }): Observable<ControleDelivrance> {
    let params = new HttpParams().set('medicament', req.medicament);
    if (req.matricule) params = params.set('matricule', req.matricule);
    if (req.nom) params = params.set('nom', req.nom);
    return this.api.get<ControleDelivrance>('/factures/controle-delivrance', { params, skipLoading: true });
  }

  addLignesToCurrent(lignes: any[]): Observable<Facture> {
    return this.api.post<Facture>('/factures/current/lignes', lignes).pipe(this.notify());
  }

  update(id: string, req: FactureRequest): Observable<Facture> {
    return this.api.put<Facture>(`/factures/${id}`, req).pipe(this.notify());
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/factures/${id}`).pipe(this.notify());
  }

  envoyer(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/envoyer`, {}).pipe(this.notify());
  }

  valider(id: string, req?: ValidationRequest): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/valider`, req || {}).pipe(this.notify());
  }

  rejeter(id: string, req: ValidationRequest): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/rejeter`, req).pipe(this.notify());
  }

  deciderLigne(factureId: string, ligneIndex: number, req: LigneDecisionRequest): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${factureId}/lignes/${ligneIndex}/decider`, req).pipe(this.notify());
  }

  payer(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/payer`, {}).pipe(this.notify());
  }

  renvoyerAPharmacie(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/renvoyer-pharmacie`, {}).pipe(this.notify());
  }

  renvoyerAuCentral(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/renvoyer-central`, {}).pipe(this.notify());
  }

  exportExcel(): Observable<Blob> {
    return this.api.getBlob('/factures/export/excel');
  }

  exportGlobalRegionExcel(): Observable<Blob> {
    return this.api.getBlob('/export/region-global/excel');
  }

  exportFactureExcel(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures/${id}/export/excel`);
  }

  exportPdf(): Observable<Blob> {
    return this.api.getBlob('/factures/export/pdf');
  }

  importExcel(file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<void>('/factures/import', formData).pipe(this.notify());
  }

  exportFacturePdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures/${id}/export/pdf`);
  }

  /** Réimporte une facture corrigée (format Excel détaillé) : remplace ses lignes. */
  importFactureExcel(id: string, file: File): Observable<Facture> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<Facture>(`/factures/${id}/import`, formData).pipe(this.notify());
  }
}
