export enum Role {
  PHARMACIEN = 'PHARMACIEN',
  SERVICE_REGIONAL = 'SERVICE_REGIONAL',
  SERVICE_CENTRAL = 'SERVICE_CENTRAL',
  ADMIN = 'ADMIN',
  BCSU = 'BCSU',
  STRUCTURE_SANITAIRE = 'STRUCTURE_SANITAIRE'
}

export interface User {
  id?: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  pharmacieId?: string;
  regionId?: string;
  /** Structure sanitaire de rattachement (rôle STRUCTURE_SANITAIRE). */
  structureSanitaireId?: string;
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
  structureSanitaireId?: string;
  /** Pointage à la connexion (rôle BCSU) : heure d'arrivée « HH:mm ». */
  pointageHeure?: string;
  /** Vrai si l'agent doit se pointer (n'a pas encore fait son arrivée). */
  premierPointage?: boolean;
  /** Pointage de départ (rôle BCSU) : heure de départ « HH:mm ». */
  pointageDepartHeure?: string;
}

