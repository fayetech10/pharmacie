import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  constructor(private api: ApiService) {}

  getAll(): Observable<User[]> {
    return this.api.get<User[]>('/users');
  }

  /** Agents BCSU (formulaire structures) : accessible au SR, contrairement à getAll() (Admin). */
  getBcsu(): Observable<User[]> {
    return this.api.get<User[]>('/users/bcsu');
  }

  getById(id: string): Observable<User> {
    return this.api.get<User>(`/users/${id}`);
  }

  create(user: any): Observable<{ utilisateur: User; motDePasseTemporaire: string }> {
    return this.api.post<{ utilisateur: User; motDePasseTemporaire: string }>('/users', user);
  }

  update(id: string, user: any): Observable<User> {
    return this.api.put<User>(`/users/${id}`, user);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/users/${id}`);
  }

  // Activation et réinitialisation passent par le service d'identité (/utilisateurs) : la
  // base est partagée, et c'est lui qui borne ce qu'un service régional peut administrer.

  /** Active / désactive un compte : désactivé, il ne peut plus se connecter. */
  basculerActivation(id: string, actif: boolean): Observable<User> {
    return this.api.put<User>(`/utilisateurs/${id}/activation?actif=${actif}`, {});
  }

  /** Nouveau mot de passe temporaire, renvoyé une seule fois (à changer à la connexion). */
  reinitialiserMotDePasse(id: string): Observable<{ motDePasseTemporaire: string }> {
    return this.api.post<{ motDePasseTemporaire: string }>(`/utilisateurs/${id}/reinitialiser-mot-de-passe`, {});
  }
}
