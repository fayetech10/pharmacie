import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';
import { Pharmacie, PharmacieRequest, PharmacieImportResult } from '../models/pharmacie.model';

@Injectable({
  providedIn: 'root'
})
export class PharmacieService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Pharmacie[]> {
    return this.api.get<Pharmacie[]>('/pharmacies');
  }

  getById(id: string): Observable<Pharmacie> {
    return this.api.get<Pharmacie>(`/pharmacies/${id}`);
  }

  create(req: PharmacieRequest): Observable<Pharmacie> {
    return this.api.post<Pharmacie>('/pharmacies', req);
  }

  update(id: string, req: PharmacieRequest): Observable<Pharmacie> {
    return this.api.put<Pharmacie>(`/pharmacies/${id}`, req);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/pharmacies/${id}`);
  }

  /** Importe des pharmacies (et leurs comptes) depuis un fichier Excel. */
  importPharmacies(file: File): Observable<PharmacieImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<PharmacieImportResult>('/pharmacies/import', formData);
  }

  /** Télécharge le fichier Excel modèle à remplir pour l'import. */
  downloadTemplate(): Observable<Blob> {
    return this.api.getBlob('/pharmacies/import-template');
  }
}
