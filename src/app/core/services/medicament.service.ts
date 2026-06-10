import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Medicament } from '../models/medicament.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class MedicamentService {
  private apiUrl = `${environment.apiUrl}/medicaments`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<Medicament[]> {
    return this.http.get<Medicament[]>(this.apiUrl);
  }

  search(query: string): Observable<Medicament[]> {
    return this.http.get<Medicament[]>(`${this.apiUrl}/search?query=${query}`);
  }

  create(medicament: Partial<Medicament>): Observable<Medicament> {
    return this.http.post<Medicament>(this.apiUrl, medicament);
  }

  update(id: string, medicament: Partial<Medicament>): Observable<Medicament> {
    return this.http.put<Medicament>(`${this.apiUrl}/${id}`, medicament);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  importEligibles(file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`${this.apiUrl}/import-eligibles`, formData);
  }
}
