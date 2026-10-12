import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { CarteCsu } from '../models/carte-csu.model';

/**
 * Vérification des cartes CSU (poste de santé, agent BCSU). Le site officiel est
 * interrogé par le serveur, jamais directement par le navigateur.
 */
@Injectable({ providedIn: 'root' })
export class CarteCsuService {

  constructor(private api: ApiService) {}

  verifier(code: string): Observable<CarteCsu> {
    return this.api.get<CarteCsu>('/carte-csu', {
      params: new HttpParams().set('code', code),
      skipLoading: true
    });
  }
}
