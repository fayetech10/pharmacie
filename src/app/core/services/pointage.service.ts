import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface Pointage {
  id: string;
  userId: string;
  userNom: string;
  userPrenom: string;
  role: string;
  date: string;
  heureArrivee: string;
  heureDepart: string;
  derniereConnexion: string;
  structureNom: string;
}

@Injectable({
  providedIn: 'root'
})
export class PointageService {

  constructor(private api: ApiService) { }

  /**
   * Récupère les pointages d'une date donnée (format YYYY-MM-DD).
   * Nécessite le rôle ADMIN ou SERVICE_REGIONAL.
   */
  getByDate(date: string): Observable<Pointage[]> {
    return this.api.get<Pointage[]>(`/pointages?date=${date}`);
  }

  /**
   * Récupère l'historique complet des pointages d'un agent spécifique.
   */
  getPointagesByAgent(userId: string): Observable<Pointage[]> {
    return this.api.get<Pointage[]>(`/pointages/agent/${userId}`);
  }

  /**
   * Récupère l'historique des pointages de l'agent connecté.
   */
  getMesPointages(): Observable<Pointage[]> {
    return this.api.get<Pointage[]>('/pointages/mes-pointages');
  }

  marquerArrivee(): Observable<Pointage> {
    return this.api.post<Pointage>('/pointages/arrivee', {});
  }

  marquerDepart(): Observable<Pointage> {
    return this.api.post<Pointage>('/pointages/depart', {});
  }
}
