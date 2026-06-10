import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { StatsData, MonthData } from '../models/stats.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class StatsService {

  constructor(private api: ApiService) {}

  getStatsRegional(regionId: string): Observable<StatsData> {
    return this.api.get<StatsData>(`/stats/regional?regionId=${regionId}`);
  }

  getStatsNational(): Observable<StatsData> {
    return this.api.get<StatsData>('/stats/national');
  }

  getEvolutionMensuelle(annee: number, regionId?: string): Observable<MonthData[]> {
    let url = `/stats/evolution?annee=${annee}`;
    if (regionId) url += `&regionId=${regionId}`;
    return this.api.get<MonthData[]>(url);
  }
}
