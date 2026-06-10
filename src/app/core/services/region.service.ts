import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface Region {
  id: string;
  code: string;
  nom: string;
}

@Injectable({
  providedIn: 'root'
})
export class RegionService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Region[]> {
    return this.api.get<Region[]>('/regions');
  }
}
