export enum Role {
  PHARMACIEN = 'PHARMACIEN',
  SERVICE_REGIONAL = 'SERVICE_REGIONAL',
  SERVICE_CENTRAL = 'SERVICE_CENTRAL',
  ADMIN = 'ADMIN'
}

export interface User {
  id?: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  pharmacieId?: string;
  regionId?: string;
  actif?: boolean;
}

export interface LoginRequest {
  email?: string;
  password?: string;
}

export interface LoginResponse {
  token: string;
  userId: string;
  email: string;
  nom: string;
  prenom: string;
  role: Role;
  pharmacieId?: string;
  regionId?: string;
}
