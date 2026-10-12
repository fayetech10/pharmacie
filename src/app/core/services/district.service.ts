import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { District, ResultatImport, StructureConsolidee } from '../models/referentiel.model';

/** Identifiants de connexion d'un district, à communiquer (renvoyés une seule fois). */
export interface AccesDistrict {
  identifiant: string;
  motDePasseTemporaire: string;
  compteCree: boolean;
}

/** Réponse de création : le district, et les accès de son compte s'il vient d'être créé. */
export interface CreationDistrict extends Partial<AccesDistrict> {
  district: District;
  /** Centre de santé siège créé avec le district (option « c'est aussi un centre de santé »). */
  centre?: { id: string; code: string; nom: string };
}

/** Options de création : le district est aussi un centre de santé (créé en même temps, siège). */
export interface OptionsCreationDistrict {
  avecCentre?: boolean;
  nomCentre?: string;
}

/**
 * Districts sanitaires (§6) — l'échelon de consolidation introduit par le document.
 *
 * <p>Le monolithe ne connaissait que la région : le district s'intercale entre elle et
 * la structure, et c'est lui qui donne son périmètre à la consolidation du §9.</p>
 */
@Injectable({ providedIn: 'root' })
export class DistrictService {

  constructor(private api: ApiService, private http: HttpClient) {}

  getDistricts(regionId?: string): Observable<District[]> {
    const qs = regionId ? `?regionId=${encodeURIComponent(regionId)}` : '';
    return this.api.get<District[]>(`/districts${qs}`);
  }

  getDistrict(id: string): Observable<District> {
    return this.api.get<District>(`/districts/${id}`);
  }

  /** Structures rattachées au district — la liste que la consolidation doit couvrir. */
  getStructures(id: string): Observable<StructureConsolidee[]> {
    return this.api.get<StructureConsolidee[]>(`/districts/${id}/structures`);
  }

  /** Crée le district ET son compte de connexion ; les accès ne sont renvoyés qu'une fois. */
  creer(district: Partial<District>, options?: OptionsCreationDistrict): Observable<CreationDistrict> {
    const params: string[] = [];
    if (options?.avecCentre) {
      params.push('avecCentre=true');
      if (options.nomCentre?.trim()) params.push('nomCentre=' + encodeURIComponent(options.nomCentre.trim()));
    }
    return this.api.post<CreationDistrict>('/districts' + (params.length ? '?' + params.join('&') : ''), district);
  }

  /** Accès du district : mot de passe remis au défaut, ou compte créé s'il n'en a pas encore. */
  reinitialiserAcces(id: string): Observable<AccesDistrict> {
    return this.api.post<AccesDistrict>(`/districts/${id}/reinitialiser-mot-de-passe`, {});
  }

  modifier(id: string, district: Partial<District>): Observable<District> {
    return this.api.put<District>(`/districts/${id}`, district);
  }

  basculerActivation(id: string, actif: boolean): Observable<District> {
    return this.api.put<District>(`/districts/${id}/activation?actif=${actif}`, {});
  }

  importer(fichier: File): Observable<ResultatImport> {
    const formulaire = new FormData();
    formulaire.append('fichier', fichier);
    return this.http.post<ResultatImport>(`${environment.apiUrl}/districts/import`, formulaire);
  }
}
