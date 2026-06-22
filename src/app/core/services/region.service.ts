import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Role } from '../models/user.model';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Region {
  id: string;
  code: string;
  nom: string;
}

/** Nom de région (normalisé : sans accent ni casse) ouvrant l'accès aux « bases ». */
const REGION_THIES = 'thies';

@Injectable({
  providedIn: 'root'
})
export class RegionService {
  constructor(private api: ApiService, private auth: AuthService) {}

  getAll(): Observable<Region[]> {
    return this.api.get<Region[]>('/regions');
  }

  /**
   * Vrai si l'utilisateur connecté est un Service Régional rattaché à la région de
   * Thiès. Utilisé pour n'exposer la fonctionnalité « bases » qu'à ce service.
   * Le contrôle d'accès réel est de toute façon ré-appliqué côté backend.
   */
  isCurrentUserThies(): Observable<boolean> {
    const user = this.auth.getCurrentUser();
    if (!user || user.role !== Role.SERVICE_REGIONAL || !user.regionId) {
      return of(false);
    }
    return this.getAll().pipe(
      map(regions => {
        const region = regions.find(r => r.id === user.regionId);
        return !!region && this.normaliser(region.nom) === REGION_THIES;
      })
    );
  }

  /** Normalise une chaîne pour comparaison : sans accents, sans casse, sans espaces périphériques. */
  private normaliser(s: string | null | undefined): string {
    if (!s) return '';
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  }
}
