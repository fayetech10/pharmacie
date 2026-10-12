import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';
import { FactureHorsCsu, ResultatImport, SituationCaisse, TarifHorsCsu } from '../models/referentiel.model';

/**
 * Module Hors CSU (§8) : facturation des patients payants, caisse et situations.
 *
 * <p>Les tarifs viennent du référentiel (service-referentiel), les factures du point de
 * soins connecté (poste ou centre, selon l'aiguillage de la passerelle). Ces montants
 * n'entrent dans aucune consolidation SEN-CSU : c'est de la recette propre à la structure.</p>
 */
@Injectable({ providedIn: 'root' })
export class HorsCsuService {

  constructor(private api: ApiService, private http: HttpClient) {}

  // ----- Référentiel des tarifs -----

  /** Tarifs applicables à ma structure : national + surcharges locales. */
  getTarifsApplicables(): Observable<TarifHorsCsu[]> {
    return this.api.get<TarifHorsCsu[]>('/hors-csu/tarifs/applicables', { cacheFirst: true });
  }

  getTarifs(): Observable<TarifHorsCsu[]> {
    return this.api.get<TarifHorsCsu[]>('/hors-csu/tarifs');
  }

  /** Tarifs que MA structure administre (écran Paramètres) — hors référentiel national. */
  getMesTarifs(): Observable<TarifHorsCsu[]> {
    return this.api.get<TarifHorsCsu[]>('/hors-csu/tarifs/miens');
  }

  /** Modèle Excel prérempli du catalogue applicable : il ne reste qu'à saisir les prix. */
  telechargerModeleTarifs(): Observable<Blob> {
    return this.api.getBlob('/hors-csu/tarifs/modele');
  }

  creerTarif(tarif: Partial<TarifHorsCsu>): Observable<TarifHorsCsu> {
    return this.api.post<TarifHorsCsu>('/hors-csu/tarifs', tarif);
  }

  modifierTarif(id: string, tarif: Partial<TarifHorsCsu>): Observable<TarifHorsCsu> {
    return this.api.put<TarifHorsCsu>(`/hors-csu/tarifs/${id}`, tarif);
  }

  basculerActivationTarif(id: string, actif: boolean): Observable<TarifHorsCsu> {
    return this.api.put<TarifHorsCsu>(`/hors-csu/tarifs/${id}/activation?actif=${actif}`, {});
  }

  /**
   * Import Excel du référentiel Hors CSU (§8).
   *
   * <p>Passe par HttpClient et non par ApiService (multipart) : l'invalidation du cache,
   * automatique sur les POST d'ApiService, doit donc être faite à la main — sans elle
   * `getTarifsApplicables` (servi en `cacheFirst`, jamais revalidé) continuerait de
   * renvoyer l'ancienne liste et les tarifs importés resteraient invisibles à la caisse.</p>
   */
  importerTarifs(fichier: File, structureId?: string): Observable<ResultatImport> {
    const formulaire = new FormData();
    formulaire.append('fichier', fichier);
    const qs = structureId ? `?structureId=${encodeURIComponent(structureId)}` : '';
    return this.http.post<ResultatImport>(
      `${environment.apiUrl}/hors-csu/tarifs/import${qs}`, formulaire)
      .pipe(tap(() => this.api.invalidateCache()));
  }

  // ----- Caisse -----

  /** Historique des factures Hors CSU de la structure (§8). */
  getFactures(): Observable<FactureHorsCsu[]> {
    return this.api.get<FactureHorsCsu[]>('/hors-csu/factures');
  }

  getFacture(id: string): Observable<FactureHorsCsu> {
    return this.api.get<FactureHorsCsu>(`/hors-csu/factures/${id}`);
  }

  encaisser(facture: Partial<FactureHorsCsu>): Observable<FactureHorsCsu> {
    return this.api.post<FactureHorsCsu>('/hors-csu/factures', facture);
  }

  /** Annulation avec motif — la facture reste dans la situation de caisse. */
  annuler(id: string, motif: string): Observable<FactureHorsCsu> {
    return this.api.post<FactureHorsCsu>(`/hors-csu/factures/${id}/annuler`, { motif });
  }

  /** Réimpression : le reçu est régénéré depuis la facture stockée (§8). */
  telechargerRecu(id: string): Observable<Blob> {
    return this.api.getBlob(`/hors-csu/factures/${id}/recu.pdf`);
  }

  situationJournaliere(jour?: string): Observable<SituationCaisse> {
    const qs = jour ? `?jour=${jour}` : '';
    return this.api.get<SituationCaisse>(`/hors-csu/situation/journaliere${qs}`, { skipLoading: true });
  }

  situationMensuelle(mois?: number, annee?: number): Observable<SituationCaisse> {
    const parametres: string[] = [];
    if (mois) parametres.push(`mois=${mois}`);
    if (annee) parametres.push(`annee=${annee}`);
    const qs = parametres.length ? `?${parametres.join('&')}` : '';
    return this.api.get<SituationCaisse>(`/hors-csu/situation/mensuelle${qs}`, { skipLoading: true });
  }
}
