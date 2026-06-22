import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';
import { BaseTraite, BaseImmatricule, BaseImportResult } from '../models/base.model';

/**
 * Bases « traité » et « immatriculé & imprimé » — import Excel + consultation.
 * Réservé au service régional de Thiès (vérifié côté backend).
 */
@Injectable({ providedIn: 'root' })
export class BaseService {
  constructor(private api: ApiService) {}

  // ----- Consultation -----
  getTraite(): Observable<BaseTraite[]> {
    return this.api.get<BaseTraite[]>('/bases/traite');
  }

  getImmatricule(): Observable<BaseImmatricule[]> {
    return this.api.get<BaseImmatricule[]>('/bases/immatricule');
  }

  // ----- Import -----
  importTraite(file: File): Observable<BaseImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.api.post<BaseImportResult>('/bases/traite/import', form);
  }

  importImmatricule(file: File): Observable<BaseImportResult> {
    const form = new FormData();
    form.append('file', file);
    return this.api.post<BaseImportResult>('/bases/immatricule/import', form);
  }

  // ----- Modèles Excel -----
  downloadTemplateTraite(): Observable<Blob> {
    return this.api.getBlob('/bases/traite/template');
  }

  downloadTemplateImmatricule(): Observable<Blob> {
    return this.api.getBlob('/bases/immatricule/template');
  }
}
