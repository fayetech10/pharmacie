import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, of, concat, EMPTY, asapScheduler } from 'rxjs';
import { tap, catchError, distinctUntilChanged, observeOn, shareReplay, finalize } from 'rxjs/operators';
import { ARRIERE_PLAN, SKIP_LOADING } from '../interceptors/loading.interceptor';

/**
 * Durée pendant laquelle une réponse est resservie telle quelle, SANS requête : passer d'un
 * écran à l'autre puis revenir n'interroge pas le serveur à chaque fois. Au-delà, la donnée
 * en cache s'affiche quand même tout de suite et se rafraîchit en silence.
 */
const FRAICHEUR_MS = 60_000;

interface EntreeCache {
  donnees: unknown;
  /** Date de réception (ms) : sert à juger la fraîcheur. */
  recueLe: number;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  /**
   * Cache mémoire des réponses GET (clé = URL complète).
   *
   * - Reçue il y a moins de `FRAICHEUR_MS` : resservie sans requête.
   * - Plus ancienne : « stale-while-revalidate » — renvoyée immédiatement (navigation
   *   fluide, sans rechargement visible) puis rafraîchie en arrière-plan, en silence.
   * Le cache est vidé dès qu'une modification (POST/PUT/DELETE) a lieu, ainsi qu'au
   * login/logout : on ne revoit jamais une donnée rendue périmée par sa propre action.
   */
  private cache = new Map<string, EntreeCache>();

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
   * Donnée récente (< `FRAICHEUR_MS`) : renvoyée sans requête. Plus ancienne : renvoyée
   * immédiatement puis rafraîchie en arrière-plan. Les requêtes simultanées sur la
   * même URL sont mutualisées (une seule requête réseau).
   * @param opts.skipLoading masque la barre de chargement globale (ex: autocomplétion).
   * @param opts.cacheFirst sert la valeur en cache SANS revalider (idéal pour les données
   *   de référence quasi-statiques comme les médicaments → vraiment « chargé une seule fois »).
   * @param opts.arrierePlan ne retient pas l'affichage de la page (compteurs, contenus qui ont
   *   leur propre indicateur de chargement) — voir `ARRIERE_PLAN`.
   */
  get<T>(path: string, opts?: { skipLoading?: boolean; cacheFirst?: boolean; arrierePlan?: boolean; params?: any }): Observable<T> {
    let url = `${this.baseUrl}${path}`;
    if (opts?.params) {
      url += (url.includes('?') ? '&' : '?') + opts.params.toString();
    }
    const entree = this.cache.get(url);
    const hasCache = entree !== undefined;

    // Cache-first : on renvoie le cache tel quel, aucune requête de revalidation.
    if (hasCache && opts?.cacheFirst) {
      return of(entree.donnees as T);
    }

    // Donnée récente : resservie sans requête. Émission asynchrone, comme plus bas.
    if (hasCache && Date.now() - entree.recueLe < FRAICHEUR_MS) {
      return of(entree.donnees as T).pipe(observeOn(asapScheduler));
    }

    const fresh$ = this.fetch<T>(url, hasCache, opts?.skipLoading === true, opts?.arrierePlan === true);

    if (!hasCache) {
      return fresh$;
    }

    const cached = entree.donnees as T;
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
  private fetch<T>(url: string, hasCache: boolean, skipLoading: boolean, arrierePlan: boolean): Observable<T> {
    const existing = this.inFlight.get(url);
    if (existing) {
      return existing as Observable<T>;
    }
    // Revalidation silencieuse si on sert déjà du cache, ou si l'appelant le demande.
    // Le cache étant déjà affiché, sa revalidation ne retient pas non plus l'affichage de la page.
    const context = new HttpContext()
      .set(SKIP_LOADING, hasCache || skipLoading)
      .set(ARRIERE_PLAN, hasCache || arrierePlan);
    const request$ = this.http
      .get<T>(url, { context })
      .pipe(
        tap(data => this.cache.set(url, { donnees: data, recueLe: Date.now() })),
        finalize(() => this.inFlight.delete(url)),
        shareReplay(1)
      );
    this.inFlight.set(url, request$ as Observable<unknown>);
    return request$;
  }

  /** `silencieux` : envoi en arrière-plan (synchronisation hors ligne), sans le voile de chargement. */
  post<T>(path: string, body: any, options?: { silencieux?: boolean }): Observable<T> {
    const silencieux = !!options?.silencieux;
    return this.http.post<T>(`${this.baseUrl}${path}`, body,
      { context: new HttpContext().set(SKIP_LOADING, silencieux).set(ARRIERE_PLAN, silencieux) }).pipe(
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

  getBlob(path: string, opts?: { arrierePlan?: boolean }): Observable<Blob> {
    // Exports / téléchargements : jamais mis en cache, toujours frais.
    return this.http.get(`${this.baseUrl}${path}`, {
      responseType: 'blob',
      context: new HttpContext().set(ARRIERE_PLAN, !!opts?.arrierePlan)
    });
  }

  /** Export généré à partir d'une sélection envoyée dans le corps (ex. ids filtrés à l'écran). Lecture seule : cache intact. */
  postBlob(path: string, body: unknown): Observable<Blob> {
    return this.http.post(`${this.baseUrl}${path}`, body, { responseType: 'blob' });
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
