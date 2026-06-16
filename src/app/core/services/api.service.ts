import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, of, concat, EMPTY, asapScheduler } from 'rxjs';
import { tap, catchError, distinctUntilChanged, observeOn, shareReplay, finalize } from 'rxjs/operators';
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

  /**
   * Requêtes GET en cours, par URL. Si plusieurs composants demandent la même donnée
   * « en même temps » (avant la 1ère réponse), ils partagent la MÊME requête réseau
   * au lieu d'en déclencher plusieurs (ex: dashboard régional + service de comptage
   * qui chargent /factures simultanément).
   */
  private inFlight = new Map<string, Observable<unknown>>();

  constructor(private http: HttpClient) {}

  /**
   * GET mis en cache pour tout le projet (médicaments, factures, etc.).
   * Stratégie « stale-while-revalidate » : la donnée déjà en cache est renvoyée
   * immédiatement puis rafraîchie en arrière-plan. Les requêtes simultanées sur la
   * même URL sont mutualisées (une seule requête réseau).
   * @param opts.skipLoading masque la barre de chargement globale (ex: autocomplétion).
   * @param opts.cacheFirst sert la valeur en cache SANS revalider (idéal pour les données
   *   de référence quasi-statiques comme les médicaments → vraiment « chargé une seule fois »).
   */
  get<T>(path: string, opts?: { skipLoading?: boolean; cacheFirst?: boolean }): Observable<T> {
    const url = `${this.baseUrl}${path}`;
    const hasCache = this.cache.has(url);

    // Cache-first : on renvoie le cache tel quel, aucune requête de revalidation.
    if (hasCache && opts?.cacheFirst) {
      return of(this.cache.get(url) as T);
    }

    const fresh$ = this.fetch<T>(url, hasCache, opts?.skipLoading === true);

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

  /** Requête réseau réelle, avec mutualisation des appels concurrents (in-flight). */
  private fetch<T>(url: string, hasCache: boolean, skipLoading: boolean): Observable<T> {
    const existing = this.inFlight.get(url);
    if (existing) {
      return existing as Observable<T>;
    }
    // Revalidation silencieuse si on sert déjà du cache, ou si l'appelant le demande.
    const request$ = this.http
      .get<T>(url, { context: new HttpContext().set(SKIP_LOADING, hasCache || skipLoading) })
      .pipe(
        tap(data => this.cache.set(url, data)),
        finalize(() => this.inFlight.delete(url)),
        shareReplay(1)
      );
    this.inFlight.set(url, request$ as Observable<unknown>);
    return request$;
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

  /** Vide tout le cache GET (après une modification, ou au changement de session). */
  invalidateCache(): void {
    this.cache.clear();
  }

  /** Vide uniquement les entrées de cache dont l'URL commence par ce chemin (ex: '/medicaments'). */
  invalidate(pathFragment: string): void {
    const prefix = `${this.baseUrl}${pathFragment}`;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
