import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Medicament } from '../models/medicament.model';
import { environment } from '../../../environments/environment';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class MedicamentService {
  private apiUrl = `${environment.apiUrl}/medicaments`;
  /** Chemin relatif utilisé par le cache central (ApiService). */
  private readonly path = '/medicaments';

  // Le cache est désormais centralisé dans ApiService (partagé avec le reste du projet,
  // dédoublonnage des requêtes simultanées, invalidation après écriture).
  constructor(private http: HttpClient, private api: ApiService) {}

  /** Liste complète, via le cache projet (chargée une fois puis réutilisée). */
  getAll(): Observable<Medicament[]> {
    return this.api.get<Medicament[]>(this.path);
  }

  /**
   * Liste complète en cache-first (chargée une seule fois, sans overlay et sans revalidation) :
   * la recherche d'autocomplétion filtre ce cache localement → instantané, zéro requête répétée.
   */
  getAllCached(): Observable<Medicament[]> {
    return this.api.get<Medicament[]>(this.path, { skipLoading: true, cacheFirst: true });
  }

  /** Vide le cache des médicaments (à appeler après un import ou une modification). */
  invalidateCache(): void {
    this.api.invalidate(this.path);
  }

  /**
   * Recherche pour l'autocomplétion : filtre le cache local (nom contient, actif),
   * limité à 10 résultats — reproduit le comportement du backend sans appel réseau.
   */
  search(query: string): Observable<Medicament[]> {
    const q = (query || '').trim().toLowerCase();
    if (q.length === 0) {
      return of([]);
    }
    return this.getAllCached().pipe(
      map(list => list
        .filter(m => m.actif && (m.nom || '').toLowerCase().includes(q))
        .slice(0, 10))
    );
  }

  create(medicament: Partial<Medicament>): Observable<Medicament> {
    return this.http.post<Medicament>(this.apiUrl, medicament, {
      context: new HttpContext().set(SKIP_LOADING, true)
    }).pipe(tap(() => this.invalidateCache()));
  }

  update(id: string, medicament: Partial<Medicament>): Observable<Medicament> {
    return this.http.put<Medicament>(`${this.apiUrl}/${id}`, medicament)
      .pipe(tap(() => this.invalidateCache()));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(tap(() => this.invalidateCache()));
  }

  importEligibles(file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`${this.apiUrl}/import-eligibles`, formData)
      .pipe(tap(() => this.invalidateCache()));
  }

  importExclusions(file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>(`${this.apiUrl}/import-exclusions`, formData)
      .pipe(tap(() => this.invalidateCache()));
  }
}
