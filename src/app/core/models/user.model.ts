export enum Role {
  PHARMACIEN = 'PHARMACIEN',
  SERVICE_REGIONAL = 'SERVICE_REGIONAL',
  SERVICE_CENTRAL = 'SERVICE_CENTRAL',
  ADMIN = 'ADMIN',
  BCSU = 'BCSU',
  /** Échelon de consolidation entre la structure et la région. */
  DISTRICT = 'DISTRICT',
  /** Agent d'un poste de santé — soumet ses factures à son centre de rattachement. */
  POSTE_SANTE = 'POSTE_SANTE',
  /** Agent d'un centre de santé / EPS — facture et valide les factures de ses postes. */
  CENTRE_SANTE = 'CENTRE_SANTE',
  /**
   * Rôle générique historique. Toujours accepté : il se résout côté serveur en
   * POSTE_SANTE ou CENTRE_SANTE selon le type de la structure rattachée (`structureType`).
   */
  STRUCTURE_SANITAIRE = 'STRUCTURE_SANITAIRE'
}

export interface User {
  id?: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  /** Identifiant de connexion simple (prenom.nom), généré à la création. */
  username?: string;
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
  /** Identifiant de connexion attribué à l'import (pharmacies, structures). */
  username?: string;
  /** Mot de passe générique non encore changé : l'application impose le changement. */
  mustChangePassword?: boolean;
  nom: string;
  prenom: string;
  role: Role;
  pharmacieId?: string;
  regionId?: string;
  structureSanitaireId?: string;
  structureType?: string;
  structureNom?: string;
  /** Rôle réellement appliqué (les comptes STRUCTURE_SANITAIRE sont résolus à la connexion). */
  roleEffectif?: Role;
  /** Pour un poste : centre de santé / EPS qui le polarise et valide ses factures. */
  structureRattachementId?: string;
  structureRattachementNom?: string;
  /** Centre de santé siège du district : ouvre aussi les écrans du district (sur son district). */
  siegeDistrict?: boolean;
  /** District de consolidation (§9) — nouveau dans l'architecture microservices. */
  districtId?: string;
  districtNom?: string;
  /** Pointage à la connexion (rôle BCSU) : heure d'arrivée « HH:mm ». */
  pointageHeure?: string;
  /** Vrai si l'agent doit se pointer (n'a pas encore fait son arrivée). */
  premierPointage?: boolean;
  /** Pointage de départ (rôle BCSU) : heure de départ « HH:mm ». */
  pointageDepartHeure?: string;
}

