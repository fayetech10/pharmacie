import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Facture, FactureRequest, ValidationRequest, LigneDecisionRequest } from '../models/facture.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FactureService {

  constructor(private api: ApiService) {}

  getAll(): Observable<Facture[]> {
    return this.api.get<Facture[]>('/factures');
  }

  getById(id: string): Observable<Facture> {
    return this.api.get<Facture>(`/factures/${id}`);
  }

  create(req: FactureRequest): Observable<Facture> {
    return this.api.post<Facture>('/factures', req);
  }

  getCurrent(): Observable<Facture> {
    return this.api.get<Facture>('/factures/current');
  }

  getRetards(): Observable<Facture[]> {
    return this.api.get<Facture[]>('/factures/retards');
  }

  addLignesToCurrent(lignes: any[]): Observable<Facture> {
    return this.api.post<Facture>('/factures/current/lignes', lignes);
  }

  update(id: string, req: FactureRequest): Observable<Facture> {
    return this.api.put<Facture>(`/factures/${id}`, req);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/factures/${id}`);
  }

  envoyer(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/envoyer`, {});
  }

  verifier(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/verifier`, {});
  }

  valider(id: string, req: ValidationRequest): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/valider`, req);
  }

  rejeter(id: string, req: ValidationRequest): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/rejeter`, req);
  }

  conformer(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/conformer`, {});
  }

  deciderLigne(id: string, index: number, req: LigneDecisionRequest): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/lignes/${index}/decision`, req);
  }

  renvoyerPourCorrection(id: string): Observable<Facture> {
    return this.api.post<Facture>(`/factures/${id}/renvoyer-correction`, {});
  }

  exportExcel(): Observable<Blob> {
    return this.api.getBlob('/factures/export/excel');
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
    return this.api.post<void>('/factures/import', formData);
  }
}
