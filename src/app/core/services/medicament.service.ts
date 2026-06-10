import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable, of, shareReplay } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Medicament } from '../models/medicament.model';
import { environment } from '../../../environments/environment';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';

@Injectable({
  providedIn: 'root'
})
export class MedicamentService {
  private apiUrl = `${environment.apiUrl}/medicaments`;

  /**
   * Cache de la liste complète des médicaments.
   * Chargée une seule fois (shareReplay) puis réutilisée : la recherche
   * d'autocomplétion filtre ce cache localement → instantané, sans requête répétée.
   */
  private medicaments$?: Observable<Medicament[]>;

  constructor(private http: HttpClient) {}

  /** Liste complète, toujours fraîche depuis le serveur (ex: tableau de gestion). */
  getAll(): Observable<Medicament[]> {
    return this.http.get<Medicament[]>(this.apiUrl);
  }

  /** Liste complète mise en cache (chargée une fois par session, sans overlay de chargement). */
  getAllCached(): Observable<Medicament[]> {
    if (!this.medicaments$) {
      this.medicaments$ = this.http.get<Medicament[]>(this.apiUrl, {
        context: new HttpContext().set(SKIP_LOADING, true)
      }).pipe(shareReplay(1));
    }
    return this.medicaments$;
  }

  /** Vide le cache (à appeler après un import ou une modification). */
  invalidateCache(): void {
    this.medicaments$ = undefined;
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
