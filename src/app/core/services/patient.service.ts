import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Patient } from '../models/bcsu.model';
import { DossierPatientDto } from '../models/patient.model';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Patient[]> {
    return this.api.get<Patient[]>('/patients');
  }

  getDossierCsu(id: string): Observable<DossierPatientDto> {
    return this.api.get<DossierPatientDto>(`/patients/${id}/dossier-csu`);
  }

  getDossierCsuPdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/patients/${id}/dossier-csu/pdf`);
  }
}
