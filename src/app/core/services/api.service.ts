import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, of, concat, EMPTY, asapScheduler } from 'rxjs';
import { tap, catchError, distinctUntilChanged, observeOn } from 'rxjs/operators';
import { SKIP_LOADING } from '../interceptors/loading.interceptor';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  /**
   * Cache mémoire des réponses GET (clé = URL complète).
   *
   * Stratégie « stale-while-revalidate » : quand une donnée est déjà en cache, on
   * la renvoie immédiatement (navigation fluide, sans rechargement visible) puis on
   * rafraîchit en arrière-plan, en silence. Le cache est vidé dès qu'une
   * modification (POST/PUT/DELETE) a lieu, ainsi qu'au login/logout.
   */
  private cache = new Map<string, unknown>();

  constructor(private http: HttpClient) {}

  get<T>(path: string): Observable<T> {
    const url = `${this.baseUrl}${path}`;
    const hasCache = this.cache.has(url);

    // Si on sert déjà du cache, la revalidation est silencieuse (pas de barre de chargement).
    const fresh$ = this.http
      .get<T>(url, { context: new HttpContext().set(SKIP_LOADING, hasCache) })
      .pipe(tap(data => this.cache.set(url, data)));

    if (!hasCache) {
      return fresh$;
    }

    const cached = this.cache.get(url) as T;
    return concat(
      of(cached),
      // Échec de la revalidation : on conserve la donnée en cache (aucune erreur visible).
      fresh$.pipe(catchError(() => EMPTY))
    ).pipe(
      // Émissions asynchrones (micro-tâche) : la donnée en cache arrive après le cycle
      // de rendu initial, donc les @ViewChild (paginator, tri…) sont déjà disponibles.
      observeOn(asapScheduler),
      // On ne ré-émet la version fraîche que si elle diffère réellement du cache.
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
    );
  }

  post<T>(path: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body).pipe(
      tap(() => this.invalidateCache())
    );
  }

  put<T>(path: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body).pipe(
      tap(() => this.invalidateCache())
    );
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`).pipe(
      tap(() => this.invalidateCache())
    );
  }

  getBlob(path: string): Observable<Blob> {
    // Exports / téléchargements : jamais mis en cache, toujours frais.
    return this.http.get(`${this.baseUrl}${path}`, { responseType: 'blob' });
  }

  /** Vide le cache GET (après une modification, ou au changement de session). */
  invalidateCache(): void {
    this.cache.clear();
  }
}
