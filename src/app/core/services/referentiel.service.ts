import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { PagePrestations, Prestation, ResultatImport, ServiceMedical } from '../models/referentiel.model';

/**
 * Référentiel Service → Prestation → Prix (§5 du document).
 *
 * <p>C'est la source des prix : le formulaire de facturation y choisit ses prestations,
 * et le serveur retarife de toute façon la facture à l'enregistrement. Le référentiel
 * complet est mis en cache une fois pour toutes (`cacheFirst`) car il change rarement et
 * doit rester disponible pour la saisie hors ligne (§12).</p>
 */
@Injectable({ providedIn: 'root' })
export class ReferentielService {

  /** Le référentiel complet est partagé entre tous les abonnés : une seule requête. */
  private cache$?: Observable<Prestation[]>;

  constructor(private api: ApiService, private http: HttpClient) {}

  // ----- Services -----
  getServices(actifSeulement = true): Observable<ServiceMedical[]> {
    return this.api.get<ServiceMedical[]>(`/referentiel/services?actifSeulement=${actifSeulement}`,
      { cacheFirst: true });
  }

  creerService(service: Partial<ServiceMedical>): Observable<ServiceMedical> {
    return this.api.post<ServiceMedical>('/referentiel/services', service);
  }

  modifierService(id: string, service: Partial<ServiceMedical>): Observable<ServiceMedical> {
    return this.api.put<ServiceMedical>(`/referentiel/services/${id}`, service);
  }

  // ----- Prestations -----
  rechercher(filtres: { serviceId?: string; recherche?: string; actifSeulement?: boolean;
                        page?: number; taille?: number }): Observable<PagePrestations> {
    let params = new HttpParams();
    if (filtres.serviceId) params = params.set('serviceId', filtres.serviceId);
    if (filtres.recherche) params = params.set('recherche', filtres.recherche);
    if (filtres.actifSeulement) params = params.set('actifSeulement', 'true');
    params = params.set('page', String(filtres.page ?? 0));
    params = params.set('taille', String(filtres.taille ?? 25));
    return this.api.get<PagePrestations>('/referentiel/prestations', { params, skipLoading: true });
  }

  /**
   * Référentiel actif complet, pour alimenter les listes déroulantes de la facturation
   * et la saisie hors ligne. Mis en cache pour la durée de la session.
   */
  getCache(): Observable<Prestation[]> {
    if (!this.cache$) {
      this.cache$ = this.api
        .get<Prestation[]>('/referentiel/prestations/cache', { cacheFirst: true, skipLoading: true })
        .pipe(shareReplay(1));
    }
    return this.cache$;
  }

  /** À appeler après toute modification du référentiel, sinon la saisie garde les anciens prix. */
  viderCache(): void {
    this.cache$ = undefined;
    this.api.invalidate('/referentiel');
  }

  creer(prestation: Partial<Prestation>): Observable<Prestation> {
    return this.api.post<Prestation>('/referentiel/prestations', prestation);
  }

  modifier(id: string, prestation: Partial<Prestation>): Observable<Prestation> {
    return this.api.put<Prestation>(`/referentiel/prestations/${id}`, prestation);
  }

  basculerActivation(id: string, actif: boolean): Observable<Prestation> {
    return this.api.put<Prestation>(`/referentiel/prestations/${id}/activation?actif=${actif}`, {});
  }

  supprimer(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/referentiel/prestations/${id}`);
  }

  /**
   * Import Excel du référentiel (§5). Passe par HttpClient directement : ApiService
   * pose un Content-Type JSON, incompatible avec un envoi multipart.
   */
  importer(fichier: File): Observable<ResultatImport> {
    const formulaire = new FormData();
    formulaire.append('fichier', fichier);
    return this.http.post<ResultatImport>(
      `${environment.apiUrl}/referentiel/prestations/import`, formulaire)
      .pipe(tap(() => this.api.invalidateCache()));
  }
}
