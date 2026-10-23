import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { StructureSanitaire, StructureSanitaireRequest, FactureStructure, FactureStructureRequest, ImportResult, LigneFactureStructure, AccesCompte, TypePiece, ResultatImportFactures, RapportRapprochement, RechercheTicket, TicketResume,
  VisiteTicket } from '../models/structure.model';
import { LettreGarantie } from '../models/bcsu.model';
import { FactureStatutLight } from '../models/facture.model';
import { HttpParams } from '@angular/common/http';

/** La facture que représente un fichier d'import, choisie à l'écran. */
export interface ChoixImportFacture {
  structureId: string;
  regime: string;
  mois: number;
  annee: number;
  /** Statut de la facture dans l'ancienne application. */
  statut: string;
  /** Facultatif : à défaut, le « N° Référence facture » du fichier. */
  numeroOrigine?: string;
}

/** Paramètres renseignés seulement (le modèle se préremplit de ce qui est déjà choisi). */
function paramsImport(choix: Partial<ChoixImportFacture>): HttpParams {
  let params = new HttpParams();
  Object.entries(choix).forEach(([cle, valeur]) => {
    if (valeur !== null && valeur !== undefined && String(valeur).trim() !== '') {
      params = params.set(cle, String(valeur).trim());
    }
  });
  return params;
}

@Injectable({
  providedIn: 'root'
})
export class StructureService {

  constructor(private api: ApiService) {}

  // ----- Gestion des structures (ADMIN / Service Régional) -----
  getStructures(): Observable<StructureSanitaire[]> {
    return this.api.get<StructureSanitaire[]>('/structures-sanitaires');
  }
  /** Récupère les structures rattachées à un agent BCSU (accessible à tout rôle). */
  getStructuresByBcsu(bcsuId: string): Observable<StructureSanitaire[]> {
    return this.api.get<StructureSanitaire[]>(`/structures-sanitaires/by-bcsu/${bcsuId}`, { skipLoading: true });
  }
  createStructure(req: StructureSanitaireRequest): Observable<StructureSanitaire> {
    return this.api.post<StructureSanitaire>('/structures-sanitaires', req);
  }
  updateStructure(id: string, req: StructureSanitaireRequest): Observable<StructureSanitaire> {
    return this.api.put<StructureSanitaire>(`/structures-sanitaires/${id}`, req);
  }
  deleteStructure(id: string): Observable<void> {
    return this.api.delete<void>(`/structures-sanitaires/${id}`);
  }
  /** Active / désactive la structure ; son compte de connexion suit (une structure désactivée ne se connecte plus). */
  basculerActivation(id: string, actif: boolean): Observable<StructureSanitaire> {
    return this.api.put<StructureSanitaire>(`/structures-sanitaires/${id}/activation?actif=${actif}`, {});
  }
  /** Nouveau mot de passe temporaire pour le compte de la structure (créé s'il n'existe pas). */
  reinitialiserMotDePasse(id: string): Observable<AccesCompte> {
    return this.api.post<AccesCompte>(`/structures-sanitaires/${id}/reinitialiser-mot-de-passe`, {});
  }
  /** Postes de santé polarisés (rattachés) par une structure sanitaire. */
  getPostes(structureId: string): Observable<StructureSanitaire[]> {
    return this.api.get<StructureSanitaire[]>(`/structures-sanitaires/${structureId}/postes`, { skipLoading: true });
  }
  /** Import Excel d'une liste de postes de santé (Service Régional). */
  importPostes(file: File): Observable<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.api.post<ImportResult>('/structures-sanitaires/import-postes', formData);
  }
  /** Modèle Excel à remplir pour l'import des structures (EPS, CS, PS). */
  downloadModeleImportPostes(): Observable<Blob> {
    return this.api.getBlob('/structures-sanitaires/import-postes-template');
  }

  // ----- Reprise des factures de l'ancienne application (Service Régional) -----
  /**
   * Modèle Excel d'un régime : la facture de ce régime telle que l'application l'exporte,
   * préremplie de ce qui est déjà choisi (structure, période, n° d'origine).
   */
  telechargerModeleImportFactures(choix: Partial<ChoixImportFacture> & { regime: string }): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/import/modele?${paramsImport(choix).toString()}`);
  }
  /**
   * Import d'une facture déjà générée (un fichier = une facture, au format du régime) pour une
   * structure de la région. Tout ou rien. `simulation` : contrôle et aperçu, rien n'est enregistré.
   */
  importerFactures(choix: ChoixImportFacture, fichier: File, simulation: boolean): Observable<ResultatImportFactures> {
    const formData = new FormData();
    formData.append('fichier', fichier);
    const params = paramsImport(choix).set('simulation', simulation);
    return this.api.post<ResultatImportFactures>(`/factures-structure/import?${params.toString()}`, formData);
  }

  // ─── Import de fin de mois d'un centre / EPS (prestations des patients du BCSU) ───

  /** Modèle Excel du régime pour le mois, prérempli des patients enregistrés par le BCSU. */
  telechargerModeleRapprochement(regime: string, mois: number, annee: number): Observable<Blob> {
    const params = new HttpParams().set('regime', regime).set('mois', mois).set('annee', annee);
    return this.api.getBlob(`/factures-structure/rapprochement/modele?${params.toString()}`);
  }

  /** Rapprochement du fichier avec les patients du BCSU. `simulation` : aperçu, rien n'est enregistré. */
  importerRapprochement(regime: string, mois: number, annee: number, fichier: File,
                        simulation: boolean): Observable<RapportRapprochement> {
    const formData = new FormData();
    formData.append('fichier', fichier);
    const params = new HttpParams().set('regime', regime).set('mois', mois).set('annee', annee)
      .set('simulation', simulation);
    return this.api.post<RapportRapprochement>(`/factures-structure/rapprochement?${params.toString()}`, formData);
  }

  /** Rapport du dernier import confirmé de la facture du mois (null s'il n'y en a pas). */
  dernierRapprochement(regime: string, mois: number, annee: number): Observable<RapportRapprochement | null> {
    const params = new HttpParams().set('regime', regime).set('mois', mois).set('annee', annee);
    return this.api.get<RapportRapprochement | null>(`/factures-structure/rapprochement/dernier?${params.toString()}`,
      { skipLoading: true });
  }

  // ─── Tickets de caisse en série (centre / EPS) ───

  /** Visites du BCSU pour un identifiant du régime et une date de prise en charge (« aaaa-mm-jj »). */
  rechercherVisitesTicket(regime: string, identifiant: string, date: string): Observable<RechercheTicket> {
    const params = new HttpParams().set('regime', regime).set('identifiant', identifiant).set('date', date);
    return this.api.get<RechercheTicket>(`/factures-structure/tickets/visites?${params.toString()}`, { skipLoading: true });
  }

  /** Ajoute un ticket au dossier (un de plus, jamais à la place d'un autre). */
  ajouterTicket(factureId: string, dossierId: string, image: string): Observable<VisiteTicket> {
    return this.api.post<VisiteTicket>(`/factures-structure/${factureId}/dossiers/${dossierId}/tickets`, { image });
  }

  ticketsDossier(factureId: string, dossierId: string): Observable<TicketResume[]> {
    return this.api.get<TicketResume[]>(`/factures-structure/${factureId}/dossiers/${dossierId}/tickets`, { skipLoading: true });
  }

  ticketImage(factureId: string, dossierId: string, ticketId: string): Observable<{ image: string }> {
    return this.api.get<{ image: string }>(
      `/factures-structure/${factureId}/dossiers/${dossierId}/tickets/${ticketId}`, { skipLoading: true, cacheFirst: true });
  }

  retirerTicket(factureId: string, dossierId: string, ticketId: string): Observable<VisiteTicket> {
    return this.api.delete<VisiteTicket>(`/factures-structure/${factureId}/dossiers/${dossierId}/tickets/${ticketId}`);
  }

  /** Export Excel des structures avec leurs identifiants de connexion. */
  exportStructures(): Observable<Blob> {
    return this.api.getBlob('/structures-sanitaires/export');
  }

  /** PDF des identifiants de connexion des structures données (ordre conservé). */
  exportIdentifiantsPdf(ids: string[]): Observable<Blob> {
    return this.api.postBlob('/structures-sanitaires/export-pdf', ids);
  }

  /** Purge les factures de structure restées en brouillon (jamais envoyées). */
  purgerBrouillons(structureId?: string): Observable<{ supprimees: number }> {
    const qs = structureId ? `?structureId=${encodeURIComponent(structureId)}` : '';
    return this.api.delete<{ supprimees: number }>(`/factures-structure/brouillons${qs}`);
  }

  // ----- Facturation structure sanitaire -----
  rechercherLettre(numero: string): Observable<LettreGarantie> {
    return this.api.get<LettreGarantie>(`/factures-structure/rechercher-lettre?numero=${encodeURIComponent(numero)}`, { skipLoading: true });
  }
  getFactures(params?: { mois?: number; annee?: number; regime?: string }): Observable<FactureStructure[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<FactureStructure[]>('/factures-structure', { params: queryParams });
  }
  /**
   * Identifiants + statuts des factures structure visibles, pour les badges de
   * notification. Charge utile minimale et sans overlay de chargement.
   */
  getFacturesStatuts(): Observable<FactureStatutLight[]> {
    return this.api.get<FactureStatutLight[]>('/factures-structure/statuts', { skipLoading: true, arrierePlan: true });
  }

  getFacture(id: string): Observable<FactureStructure> {
    return this.api.get<FactureStructure>(`/factures-structure/${id}`);
  }
  createFacture(req: FactureStructureRequest, options?: { silencieux?: boolean }): Observable<FactureStructure> {
    return this.api.post<FactureStructure>('/factures-structure', req, options);
  }
  updateFacture(id: string, req: FactureStructureRequest): Observable<FactureStructure> {
    return this.api.put<FactureStructure>(`/factures-structure/${id}`, req);
  }
  envoyerFacture(id: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/envoyer`, {});
  }
  /** Envoi groupé de la facture mensuelle : tous les brouillons du régime + mois/année. */
  envoyerGroupe(regime: string, mois: number, annee: number): Observable<FactureStructure[]> {
    return this.api.post<FactureStructure[]>('/factures-structure/envoyer-groupe', { regime, mois, annee });
  }
  /** Service Régional : valide une facture reçue (ENVOYEE → VALIDEE_SR). */
  validerFacture(id: string, commentaire?: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/valider`, { commentaire });
  }
  /** Service Régional : rejette une facture reçue (ENVOYEE → REJETEE_SR), motif obligatoire. */
  rejeterFacture(id: string, motif: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/rejeter`, { commentaire: motif });
  }
  /** Centre de Santé : valide la facture d'un poste (SOUMISE_CS → ENVOYEE). */
  /**
   * Pointe « vérifié » (ou dépointe) les dossiers d'un patient pendant le contrôle de la
   * facture — centre de rattachement ou service régional, selon le compte connecté.
   */
  pointerPatient(factureId: string, dossierIds: string[], verifie: boolean): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${factureId}/verification`, { dossierIds, verifie });
  }

  /**
   * Rejet « par ligne » : marque (ou annule) le rejet d'un patient pendant le contrôle, avec son
   * motif — district ou service régional selon le compte. Le renvoi effectif de la facture se
   * fait ensuite par rejeterFacture / rejeterFacturePoste.
   */
  rejeterPatient(factureId: string, dossierIds: string[], motif: string, rejete: boolean): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${factureId}/rejet-lignes`, { dossierIds, motif, rejete });
  }

  validerFacturePoste(id: string, commentaire?: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/valider-poste`, { commentaire });
  }
  /** Centre de Santé : rejette la facture d'un poste (SOUMISE_CS → REJETEE_CS), motif obligatoire. */
  rejeterFacturePoste(id: string, motif: string): Observable<FactureStructure> {
    return this.api.post<FactureStructure>(`/factures-structure/${id}/rejeter-poste`, { commentaire: motif });
  }
  deleteFacture(id: string): Observable<void> {
    return this.api.delete<void>(`/factures-structure/${id}`);
  }
  /** Factures (envoyées et suivantes) des postes de santé rattachés à la structure courante. */
  getFacturesPostes(params?: { mois?: number; annee?: number; regime?: string }): Observable<FactureStructure[]> {
    let queryParams = new HttpParams();
    if (params) {
      if (params.mois) queryParams = queryParams.set('mois', params.mois.toString());
      if (params.annee) queryParams = queryParams.set('annee', params.annee.toString());
      if (params.regime) queryParams = queryParams.set('regime', params.regime);
    }
    return this.api.get<FactureStructure[]>('/factures-structure/postes-rattaches', { params: queryParams });
  }
  /*
   * Retraits (patient, prestation, dossier) : la facture à jour, ou `null` quand, vidée de sa
   * dernière prestation, elle a été supprimée par le serveur (23/10/2026).
   */

  /** Supprime la saisie complète d'un patient (par n° de LG) avant l'envoi mensuel. */
  deleteFacturePatient(factureId: string, lettreNumero: string): Observable<FactureStructure | null> {
    return this.api.delete<FactureStructure | null>(`/factures-structure/${factureId}/patients?lettre=${encodeURIComponent(lettreNumero)}`);
  }
  /** Modifie une prestation (ligne) avant l'envoi mensuel. */
  updateFactureLigne(factureId: string, index: number, ligne: Partial<LigneFactureStructure>): Observable<FactureStructure> {
    return this.api.put<FactureStructure>(`/factures-structure/${factureId}/lignes/${index}`, ligne);
  }
  /** Supprime une prestation (ligne) avant l'envoi mensuel. */
  deleteFactureLigne(factureId: string, index: number): Observable<FactureStructure | null> {
    return this.api.delete<FactureStructure | null>(`/factures-structure/${factureId}/lignes/${index}`);
  }

  // ----- Dossiers patients (poste de santé) -----

  /** Complète / corrige un patient : prestations remplacées en bloc, pièces, coordonnées. */
  modifierDossier(factureId: string, dossierId: string, req: FactureStructureRequest): Observable<FactureStructure> {
    return this.api.put<FactureStructure>(`/factures-structure/${factureId}/dossiers/${dossierId}`, req);
  }
  supprimerDossier(factureId: string, dossierId: string): Observable<FactureStructure | null> {
    return this.api.delete<FactureStructure | null>(`/factures-structure/${factureId}/dossiers/${dossierId}`);
  }
  /**
   * Photo justificative d'un dossier, lue à la demande. Pièces, fiche et attestation ont leur
   * propre indicateur de chargement : elles ne retiennent pas l'affichage de la page, sauf
   * `retenirPage` (formulaire qui modifie ces pièces : il ne s'affiche qu'une fois tout lu).
   */
  getPiece(factureId: string, dossierId: string, type: TypePiece, retenirPage = false): Observable<{ type: TypePiece; libelle: string; image: string }> {
    return this.api.get<{ type: TypePiece; libelle: string; image: string }>(
      `/factures-structure/${factureId}/dossiers/${dossierId}/pieces/${type}`, { skipLoading: true, arrierePlan: !retenirPage });
  }
  /**
   * Aperçu JPEG de l'attestation / de la fiche, rendu par le serveur : un PDF dans un `<iframe>`
   * reste vide sur Chrome Android. Le PDF (téléchargement) : `attestationSoinsPdf` / `ficheAssurePdf`.
   */
  attestationSoinsImage(factureId: string, dossierId: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${factureId}/dossiers/${dossierId}/attestation?format=image`, { arrierePlan: true });
  }
  ficheAssureImage(factureId: string, dossierId: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${factureId}/dossiers/${dossierId}/fiche-assure?format=image`, { arrierePlan: true });
  }
  attestationSoinsPdf(factureId: string, dossierId: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${factureId}/dossiers/${dossierId}/attestation`);
  }
  ficheAssurePdf(factureId: string, dossierId: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${factureId}/dossiers/${dossierId}/fiche-assure`);
  }

  exportFactureExcel(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/excel`);
  }

  exportFactureWord(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/word`);
  }

  exportFacturePdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/pdf`);
  }

  /** 0-5 ans : page de garde (facture) + liste nominative dans un seul PDF. */
  exportEnfantsPdf(id: string): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/${id}/export/enfants-pdf`);
  }

  exportGroupeExcel(structureId: string, regime: string, mois: number, annee: number): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/export-groupe/excel?structureId=${structureId}&regime=${regime}&mois=${mois}&annee=${annee}`);
  }

  exportGroupePdf(structureId: string, regime: string, mois: number, annee: number): Observable<Blob> {
    return this.api.getBlob(`/factures-structure/export-groupe/pdf?structureId=${structureId}&regime=${regime}&mois=${mois}&annee=${annee}`);
  }
}
