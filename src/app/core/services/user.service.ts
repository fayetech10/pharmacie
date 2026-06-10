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

  getById(id: string): Observable<User> {
    return this.api.get<User>(`/users/${id}`);
  }

  create(user: any): Observable<User> {
    return this.api.post<User>('/users', user);
  }

  update(id: string, user: any): Observable<User> {
    return this.api.put<User>(`/users/${id}`, user);
  }

  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/users/${id}`);
  }
}
