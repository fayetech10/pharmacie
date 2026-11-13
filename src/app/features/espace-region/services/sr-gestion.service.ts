import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, forkJoin } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { UserService } from '../../../core/services/user.service';
import { StructureService } from '../../../core/services/structure.service';
import { DistrictService } from '../../../core/services/district.service';
import { PharmacieService } from '../../../core/services/pharmacie.service';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';
import { FactureEventsService, FactureEnvoyeeEvent } from '../../../core/services/facture-events.service';
import { User, Role } from '../../../core/models/user.model';
import { FactureStructure, DossierPatient, LigneFactureStructure, StructureSanitaire, typeEffectifStructure } from '../../../core/models/structure.model';
import { Facture, LigneFacture, StatutFacture } from '../../../core/models/facture.model';
import { District } from '../../../core/models/referentiel.model';
import { Pharmacie } from '../../../core/models/pharmacie.model';

export type StatutTraitementSR = 'A_TRAITER' | 'EN_COURS_SR' | 'VALIDEE_SR' | 'REJETEE_SR' | 'ENVOYEE_NC';

export interface ControleurSR {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  username: string;
  telephone?: string;
  actif: boolean;
  role: Role;
  dateCreation: string;
  motDePasseTemp?: string;
}

export interface FactureAssigneeResume {
  id: string;
  numero: string;
  typeEtablissement: 'STRUCTURE' | 'PHARMACIE';
  etablissementId: string;
  etablissementCode?: string;
  etablissementNom: string;
  typeStructure?: string; // EPS, CS, PS, PHARMACIE
  districtId?: string;
  districtNom?: string;
  posteId?: string;
  regime: string;
  mois: number;
  annee: number;
  montantTotal: number;
  montantSencsu: number;
  nombreBeneficiaires: number;
  statut: string; // A_TRAITER, EN_COURS_SR, VALIDEE_SR, REJETEE_SR, ENVOYEE_NC
  controleurId?: string;
  controleurNom?: string;
  dateAssignation?: string;
  commentaireRejet?: string;
  factureOrigine?: FactureStructure | Facture;
}

/** Agrégat anonyme d'une facture, utilisé pour rendre les brouillons visibles au suivi. */
interface FactureSaisieSuivi {
  structureSanitaireId: string;
  mois: number;
  annee: number;
  regime: string;
  statut: string;
  nombreBeneficiaires: number;
  montantTotal: number;
  montantSencsu: number;
}

export interface StatsRegimeSR {
  regime: string;
  codeRegime: string;
  libelle: string;
  couleur: string;
  montantFacture: number;
  montantSencsuTotal: number;
  /** Part SEN-CSU des factures validées par le SR, transmises au NC ou payées. */
  montantSencsuTraite: number;
  /** Part SEN-CSU restant à valider/transmettre pour la période choisie. */
  montantSencsuEnAttente: number;
  nombreBeneficiaires: number;
  nombreFactures: number;
}

export interface StructureEnregistrementRow {
  id: string;
  code: string;
  nom: string;
  type: string; // EPS, CS, PS
  districtNom: string;
  bcsuNom: string;
  actif: boolean;
  saisieActive: boolean;
  factureEnvoyeePeriode: boolean;
  statutSuiviPeriode: 'A_SAISIR' | 'EN_COURS' | 'A_CORRIGER' | 'ENVOYEE';
  nombreFactures: number;
  montantTotal: number;
  nombreBeneficiaires: number;
  dernierMoisSaisi?: string;
}

export interface DistrictEnregistrementRow {
  id: string;
  code: string;
  nom: string;
  nombrePostes: number;
  nombrePostesAvecSaisie: number;
  nombreFactures: number;
  nombreBeneficiaires: number;
  montantTotal: number;
  statutSuiviPeriode: 'A_SAISIR' | 'EN_COURS' | 'A_CORRIGER' | 'ENVOYEE';
}

export interface PostePolariseRow {
  id: string;
  code: string;
  nom: string;
  districtId: string;
  districtNom: string;
  type: string; // 'PS' ou 'CS'
  actif: boolean;
  saisieActive: boolean;
  factureEnvoyeePeriode: boolean;
  statutSuiviPeriode: 'A_SAISIR' | 'EN_COURS' | 'A_CORRIGER' | 'ENVOYEE';
  nombreFactures: number;
  montantTotal: number;
  montantSencsu: number;
  nombreBeneficiaires: number;
  statutsFactures: string[];
  dernierMoisSaisi?: string;
  regimesDisponibles: string[];
}

export interface PharmacieEnregistrementRow {
  id: string;
  code: string;
  nom: string;
  ville: string;
  telephone: string;
  actif: boolean;
  saisieActive: boolean;
  factureEnvoyeePeriode: boolean;
  statutSuiviPeriode: 'A_SAISIR' | 'EN_COURS' | 'A_CORRIGER' | 'ENVOYEE';
  nombreFactures: number;
  montantTotal: number;
  nombreBeneficiaires: number;
  dernierMoisSaisi?: string;
}

export interface SuiviBcsuRow {
  bcsuId: string;
  bcsuNom: string;
  responsableNom: string;
  nombreStructures: number;
  nombreFactures: number;
  montantFacture: number;
  montantPaye: number;
  resteAPayer: number;
  tauxPaiement: number;
  nombreBeneficiaires: number;
}

@Injectable({
  providedIn: 'root'
})
export class SrGestionService {
  private readonly STORAGE_FACTURES_STATE_KEY = 'csu_sr_factures_state_thies';

  readonly REGIMES_LIST = [
    { code: 'CONTRIBUTIF', libelle: 'Classique / Contributif (BSF, Mutuelles)', couleur: 'emerald' },
    { code: 'ENFANTS_MOINS_5_ANS', libelle: 'Gratuité Enfants < 5 ans', couleur: 'blue' },
    { code: 'PLAN_SESAME', libelle: 'Plan Sésame (60 ans et plus)', couleur: 'amber' },
    { code: 'CESARIENNE', libelle: 'Maternité sans risque / Césarienne', couleur: 'purple' },
    { code: 'DIALYSE', libelle: 'Prise en charge Dialyse', couleur: 'rose' }
  ];

  private controleurs$ = new BehaviorSubject<ControleurSR[]>([]);
  public controleursObservable = this.controleurs$.asObservable();

  constructor(
    private api: ApiService,
    private userService: UserService,
    private structureService: StructureService,
    private districtService: DistrictService,
    private pharmacieService: PharmacieService,
    private factureService: FactureService,
    private auth: AuthService,
    private factureEvents: FactureEventsService
  ) {
    this.initialiserControleurs();
    this.factureEvents.factureEnvoyee$.subscribe((event: FactureEnvoyeeEvent) => {
      this.assignerAutomatiquement(event.id, event.type);
    });
  }

  // =========================================================================
  // GESTION DES CONTRÔLEURS SR (CONNEXION BACKEND + CACHE LOCAL)
  // =========================================================================

  private initialiserControleurs(): void {
    const list: ControleurSR[] = [];
    const curUser = this.auth.getCurrentUser();
    this.controleurs$.next(list);
    this.userService.getAll().pipe(
      catchError(() => of([]))
    ).subscribe((users: User[]) => {
      const mapped: ControleurSR[] = (users || []).filter((u): u is User & { id: string } =>
        !!u.id && (u.role === Role.CONTROLEUR || u.role === Role.SERVICE_REGIONAL)
      ).map(u => ({
        id: u.id,
        nom: u.nom,
        prenom: u.prenom,
        email: u.email,
        username: u.username || u.email.split('@')[0],
        telephone: u.telephone,
        actif: u.actif !== false,
        role: u.role,
        dateCreation: (u as any).createdAt ? String((u as any).createdAt).substring(0, 10) : ''
      }));
      if (curUser && (curUser.role === Role.CONTROLEUR || curUser.role === Role.SERVICE_REGIONAL) && !mapped.some(c => c.id === curUser.userId)) {
        mapped.unshift({
          id: curUser.userId,
          nom: curUser.nom || '',
          prenom: curUser.prenom || '',
          email: curUser.email || '',
          username: curUser.username || curUser.email?.split('@')[0] || '',
          actif: true,
          role: curUser.role,
          dateCreation: ''
        });
      }
      this.controleurs$.next(mapped);
    });
  }

  getControleurs(): ControleurSR[] {
    return this.controleurs$.value;
  }

  getControleursActifs(): ControleurSR[] {
    return this.controleurs$.value.filter(c => c.actif);
  }

  creerControleur(data: { nom: string; prenom: string; email: string; telephone?: string }): Observable<ControleurSR> {
    const username = `${data.prenom.toLowerCase().replace(/[^a-z0-9]/g, '')}.${data.nom.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const mdpTemp = 'CSU-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const email = data.email || `${username}@sencsu.sn`;

    const nouveau: ControleurSR = {
      id: '',
      nom: data.nom,
      prenom: data.prenom,
      email,
      username,
      telephone: data.telephone,
      actif: true,
      role: Role.CONTROLEUR,
      dateCreation: new Date().toISOString().substring(0, 10),
      motDePasseTemp: mdpTemp
    };

    return this.userService.create({
      nom: data.nom,
      prenom: data.prenom,
      email: nouveau.email,
      username: nouveau.username,
      telephone: data.telephone,
      role: Role.CONTROLEUR,
      password: mdpTemp
    }).pipe(
      map(res => {
        if (!res?.utilisateur?.id) throw new Error('Le backend n’a pas retourné le contrôleur créé.');
        nouveau.id = res.utilisateur.id;
        nouveau.username = res.utilisateur.username || nouveau.username;
        nouveau.email = res.utilisateur.email || nouveau.email;
        if (res?.motDePasseTemporaire) {
          nouveau.motDePasseTemp = res.motDePasseTemporaire;
        }
        this.controleurs$.next([...this.controleurs$.value, nouveau]);
        return nouveau;
      })
    );
  }

  modifierControleur(id: string, modifs: Partial<ControleurSR>): void {
    const list = this.controleurs$.value.map(c => c.id === id ? { ...c, ...modifs } : c);
    this.controleurs$.next(list);
    this.userService.update(id, modifs).subscribe({ error: () => {} });
  }

  basculerActivationControleur(id: string): void {
    const target = this.controleurs$.value.find(c => c.id === id);
    const nouvelEtat = target ? !target.actif : true;
    const list = this.controleurs$.value.map(c => c.id === id ? { ...c, actif: nouvelEtat } : c);
    this.controleurs$.next(list);
    this.userService.basculerActivation(id, nouvelEtat).subscribe({ error: () => {} });
  }

  reinitialiserMotDePasseControleur(id: string): Observable<string> {
    return this.userService.reinitialiserMotDePasse(id).pipe(
      map(res => {
        const mdp = res?.motDePasseTemporaire;
        if (!mdp) throw new Error('Le backend n’a pas retourné de nouveau mot de passe.');
        const list = this.controleurs$.value.map(c => c.id === id ? { ...c, motDePasseTemp: mdp } : c);
        this.controleurs$.next(list);
        return mdp;
      })
    );
  }

  // =========================================================================
  // GESTION DES FACTURES ET ASSIGNATIONS
  // =========================================================================

  private getFacturesState(): Record<string, {
    statut?: string;
    controleurId?: string;
    controleurNom?: string;
    reassigneManuellement?: boolean;
    dateAssignation?: string;
    commentaireRejet?: string;
    lignesRejetees?: Record<string, string>;
    patientsRejetes?: Record<string, string>;
    historique?: any[];
    supprimee?: boolean;
    montantTotal?: number;
    montantSencsu?: number;
    nombreBeneficiaires?: number;
    customPatients?: any[];
  }> {
    const raw = localStorage.getItem(this.STORAGE_FACTURES_STATE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private setFacturesState(state: any): void {
    localStorage.setItem(this.STORAGE_FACTURES_STATE_KEY, JSON.stringify(state));
  }

  assignerAutomatiquement(factureId: string, type: 'STRUCTURE' | 'PHARMACIE'): void {
    const options = {
      next: () => this.factureEvents.notifyChanged(),
      error: (erreur: unknown) => console.error('Échec de l’assignation automatique côté backend.', erreur)
    };
    if (type === 'PHARMACIE') {
      this.factureService.assignerAutomatiquement(factureId).subscribe(options);
    } else {
      this.structureService.assignerFactureAutomatiquement(factureId).subscribe(options);
    }
  }

  reassignerFacture(factureId: string, controleurId: string): void {
    const state = this.getFacturesState();
    const ctrl = this.getControleurs().find(c => c.id === controleurId);
    if (!ctrl) return;

    state[factureId] = {
      ...(state[factureId] || {}),
      controleurId: ctrl.id,
      controleurNom: `${ctrl.prenom} ${ctrl.nom}`,
      reassigneManuellement: true,
      dateAssignation: new Date().toISOString()
    };
    this.setFacturesState(state);
  }

  changerStatutFacture(
    factureId: string,
    nouveauStatut: StatutTraitementSR,
    options?: {
      motif?: string;
      rejetLigne?: { ligneKey: string; motif: string };
      rejetPatient?: { patientKey: string; motif: string };
      annulerRejetLigne?: string;
      annulerRejetPatient?: string;
      agentNom?: string;
      typeEtablissement?: 'STRUCTURE' | 'PHARMACIE';
    }
  ): void {
    const state = this.getFacturesState();
    const cur = state[factureId] || {
      statut: 'A_TRAITER',
      controleurId: '',
      controleurNom: '',
      dateAssignation: new Date().toISOString()
    };

    cur.statut = nouveauStatut;
    if (options?.motif !== undefined) {
      cur.commentaireRejet = options.motif;
    }

    if (options?.rejetLigne) {
      cur.lignesRejetees = cur.lignesRejetees || {};
      cur.lignesRejetees[options.rejetLigne.ligneKey] = options.rejetLigne.motif;
    }
    if (options?.annulerRejetLigne && cur.lignesRejetees) {
      delete cur.lignesRejetees[options.annulerRejetLigne];
    }

    if (options?.rejetPatient) {
      cur.patientsRejetes = cur.patientsRejetes || {};
      cur.patientsRejetes[options.rejetPatient.patientKey] = options.rejetPatient.motif;
    }
    if (options?.annulerRejetPatient && cur.patientsRejetes) {
      delete cur.patientsRejetes[options.annulerRejetPatient];
    }

    cur.historique = cur.historique || [];
    cur.historique.push({
      date: new Date().toISOString(),
      statut: nouveauStatut,
      agentNom: options?.agentNom || this.auth.getCurrentUser()?.nom || cur.controleurNom || 'Service Régional',
      commentaire: options?.motif || `Facture passée au statut ${nouveauStatut}`
    });

    state[factureId] = cur;
    this.setFacturesState(state);

    // Synchronisation directe avec l'API backend
    if (nouveauStatut === 'VALIDEE_SR') {
      if (options?.typeEtablissement === 'PHARMACIE') {
        this.factureService.valider(factureId, { commentaire: options?.motif || 'Validation SR' }).subscribe({ error: () => {} });
      } else {
        this.structureService.validerFacture(factureId, options?.motif).subscribe({ error: () => {} });
      }
    } else if (nouveauStatut === 'REJETEE_SR') {
      const motifRejet = options?.motif || 'Rejet par le Service Régional';
      if (options?.typeEtablissement === 'PHARMACIE') {
        this.factureService.rejeter(factureId, { commentaire: motifRejet }).subscribe({ error: () => {} });
      } else {
        this.structureService.rejeterFacture(factureId, motifRejet).subscribe({ error: () => {} });
      }
    }

    this.factureEvents.notifyChanged();
  }

  getFactureState(factureId: string) {
    const state = this.getFacturesState();
    return state[factureId];
  }

  // =========================================================================
  // DONNÉES RÉELLES DU BACKEND (STRUCTURES, PHARMACIES, FACTURES)
  // =========================================================================

  /**
   * Récupère toutes les factures réelles depuis le backend (/api/factures-structure et /api/factures).
   */
  getToutesFacturesResumes(inclureBrouillons = false): Observable<FactureAssigneeResume[]> {
    return forkJoin({
      facturesStructures: this.structureService.getFactures().pipe(catchError(() => of([]))),
      facturesPharmacies: this.factureService.getAll().pipe(catchError(() => of([]))),
      structures: this.structureService.getStructures().pipe(catchError(() => of([]))),
      pharmacies: this.pharmacieService.getAll().pipe(catchError(() => of([]))),
      districts: this.districtService.getDistricts().pipe(catchError(() => of([])))
    }).pipe(
      map(({ facturesStructures, facturesPharmacies, structures, pharmacies, districts }) => {
        const structMap = new Map<string, StructureSanitaire>(structures.map(s => [s.id, s]));
        const pharmaMap = new Map<string, Pharmacie>(pharmacies.map(p => [p.id, p]));
        const districtMap = new Map<string, District>(districts.map(d => [d.id, d]));
        const result: FactureAssigneeResume[] = [];

        // 1. Factures des structures de soins réelles
        for (const fs of (facturesStructures || [])) {
          if (!fs || (!inclureBrouillons && fs.statut === StatutFacture.BROUILLON)) continue;
          const fsAny = fs as any;
          const struct = fs.structureSanitaireId ? structMap.get(fs.structureSanitaireId) : undefined;
          const dist = (fsAny.districtId ? districtMap.get(fsAny.districtId) : undefined)
                    || (struct?.districtId ? districtMap.get(struct.districtId) : undefined);
          const nbBen = (fs.dossiers && fs.dossiers.length > 0)
            ? fs.dossiers.length
            : ((fs.lignes && fs.lignes.length > 0)
              ? new Set(fs.lignes.map((l, index) => l.patientMatricule || l.patientNom || l.lettreGarantieNumero || `ligne-${index}`)).size
              : 0);

          result.push({
            id: fs.id,
            numero: fs.numero || `FAC-${fs.mois}${fs.annee}`,
            typeEtablissement: 'STRUCTURE',
            etablissementId: fs.structureSanitaireId || struct?.id || '',
            etablissementCode: struct?.code || fs.structureSanitaireId,
            etablissementNom: fs.structureNom || struct?.nom || '',
            typeStructure: fs.typeStructure || struct?.typeStructure || '',
            districtId: fsAny.districtId || struct?.districtId,
            districtNom: fsAny.districtNom || dist?.nom || '',
            posteId: (fs.typeStructure === 'PS' || struct?.typeStructure === 'PS') ? (fs.structureSanitaireId || struct?.id) : undefined,
            regime: fs.regime ? String(fs.regime) : '',
            mois: fs.mois,
            annee: fs.annee,
            montantTotal: fs.montantTotal || 0,
            montantSencsu: fs.montantTotalSencsu || 0,
            nombreBeneficiaires: nbBen,
            // Côté backend, ENVOYEE désigne une facture reçue par le SR ; dans le
            // tableau de suivi SR, cette étape est libellée A_TRAITER.
            statut: this.statutPourSuiviSR(String(fs.statut || '')),
            controleurId: fs.controleurId,
            controleurNom: fs.controleurNom,
            dateAssignation: fs.dateAssignation ? String(fs.dateAssignation) : undefined,
            commentaireRejet: fs.commentaireRejet,
            factureOrigine: fs
          });
        }

        // 2. Factures des officines de pharmacie réelles
        for (const fp of (facturesPharmacies || [])) {
          if (!fp || (!inclureBrouillons && fp.statut === StatutFacture.BROUILLON)) continue;
          const pharma = fp.pharmacieId ? pharmaMap.get(fp.pharmacieId) : undefined;
          const nbBen = (fp.lignes && fp.lignes.length > 0)
            ? new Set(fp.lignes.map((l, index) => l.patientMatricule || l.patientNomPrenom || `ligne-${index}`)).size
            : 0;

          result.push({
            id: fp.id,
            numero: `PH-${fp.annee}-${String(fp.mois).padStart(2, '0')}-${fp.id.substring(0, 5)}`,
            typeEtablissement: 'PHARMACIE',
            etablissementId: fp.pharmacieId || pharma?.id || '',
            etablissementCode: pharma?.code || fp.pharmacieId,
            etablissementNom: fp.pharmacieNom || pharma?.nom || '',
            typeStructure: 'PHARMACIE',
            districtNom: pharma?.adresse || '',
            regime: 'CONTRIBUTIF',
            mois: fp.mois,
            annee: fp.annee,
            montantTotal: fp.montantTotal || 0,
            montantSencsu: Number((fp as any).montantSencsu) || 0,
            nombreBeneficiaires: nbBen,
            statut: this.statutPourSuiviSR(String(fp.statut || '')),
            controleurId: fp.controleurId,
            controleurNom: fp.controleurNom,
            dateAssignation: fp.dateAssignation ? String(fp.dateAssignation) : undefined,
            commentaireRejet: fp.commentaireRejet,
            factureOrigine: fp
          });
        }

        return result;
      })
    );
  }

  private statutPourSuiviSR(statut: string): string {
    return statut === 'ENVOYEE' ? 'A_TRAITER' : statut;
  }

  /**
   * Calcule les agrégats réels du Tableau de bord à partir des factures du backend
   */
  calculerTableauDeBord(filtres: { annee: number; trimestre?: number; mois?: number }): Observable<StatsRegimeSR[]> {
    return this.getToutesFacturesResumes().pipe(
      map(factures => {
        const filtrees = factures.filter(f => {
          if (f.annee !== filtres.annee) return false;
          if (filtres.mois && f.mois !== filtres.mois) return false;
          if (filtres.trimestre) {
            const m = f.mois;
            const t = filtres.trimestre;
            if (t === 1 && (m < 1 || m > 3)) return false;
            if (t === 2 && (m < 4 || m > 6)) return false;
            if (t === 3 && (m < 7 || m > 9)) return false;
            if (t === 4 && (m < 10 || m > 12)) return false;
          }
          return true;
        });

        return this.REGIMES_LIST.map(r => {
          const fDuRegime = filtrees.filter(f => f.regime === r.code);
          const montantFacture = fDuRegime.reduce((s, f) => s + f.montantTotal, 0);
          const montantSencsuTotal = fDuRegime.reduce((s, f) => s + f.montantSencsu, 0);
          const montantSencsuTraite = fDuRegime
            .filter(f => f.statut === 'VALIDEE_SR' || f.statut === 'ENVOYEE_NC' || f.statut === 'PAYEE')
            .reduce((s, f) => s + f.montantSencsu, 0);
          const nombreBeneficiaires = fDuRegime.reduce((s, f) => s + f.nombreBeneficiaires, 0);

          return {
            regime: r.code,
            codeRegime: r.code,
            libelle: r.libelle,
            couleur: r.couleur,
            montantFacture,
            montantSencsuTotal,
            montantSencsuTraite,
            montantSencsuEnAttente: Math.max(0, montantSencsuTotal - montantSencsuTraite),
            nombreBeneficiaires,
            nombreFactures: fDuRegime.length
          };
        });
      })
    );
  }

  /**
   * Suivi d'enregistrement réel basé sur les structures et officines du backend
   */
  getSuiviEnregistrement(annee = new Date().getFullYear(), mois?: number, trimestre?: number): Observable<{
    districts: DistrictEnregistrementRow[];
    structures: StructureEnregistrementRow[];
    pharmacies: PharmacieEnregistrementRow[];
  }> {
    return forkJoin({
      structures: this.structureService.getStructures(),
      pharmacies: this.pharmacieService.getAll(),
      districts: this.districtService.getDistricts(),
      factures: this.getToutesFacturesResumes(true),
      saisies: this.getSaisiesPourSuivi(annee, mois, trimestre)
    }).pipe(
      map(({ structures, pharmacies, districts, factures, saisies }) => {
        const districtMap = new Map<string, District>(districts.map(d => [d.id, d]));

        // La première vue est agrégée par district : seules les structures de type PS
        // entrent dans le numérateur et le dénominateur des postes ayant commencé.
        const districtRows: DistrictEnregistrementRow[] = (districts || []).filter(d => d.actif !== false).map(d => {
          const structuresDuDistrict = structures.filter(s => s.districtId === d.id);
          const idsStructuresDuDistrict = new Set(structuresDuDistrict.map(s => s.id));
          const postes = structures.filter(s => {
            const estPoste = typeEffectifStructure(s) === 'PS';
            const rattacheAuDistrict = s.districtId === d.id ||
              (!!s.structureRattachementId && idsStructuresDuDistrict.has(s.structureRattachementId));
            return estPoste && s.actif !== false && rattacheAuDistrict;
          });
          const saisiesPostes = postes.map(poste => saisies.filter(f =>
            f.structureSanitaireId === poste.id && f.annee === annee &&
            (mois === undefined || f.mois === mois) &&
            (trimestre === undefined || Math.ceil(f.mois / 3) === trimestre)
          ));
          const nombrePostesAvecSaisie = saisiesPostes.filter(fs => fs.length > 0).length;
          const facturesPostes = saisiesPostes.flat();
          const contientRejet = facturesPostes.some(f => ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const tousEnvoyes = postes.length > 0 && saisiesPostes.every(fs => fs.length > 0 && fs.every(f =>
            f.statut !== 'BROUILLON' && !['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut)
          ));
          const statutSuiviPeriode = contientRejet ? 'A_CORRIGER' : tousEnvoyes ? 'ENVOYEE' :
            nombrePostesAvecSaisie > 0 ? 'EN_COURS' : 'A_SAISIR';

          return {
            id: d.id,
            code: d.code || 'DS',
            nom: d.nom,
            nombrePostes: postes.length,
            nombrePostesAvecSaisie,
            nombreFactures: facturesPostes.length,
            nombreBeneficiaires: facturesPostes.reduce((sum, f) => sum + f.nombreBeneficiaires, 0),
            montantTotal: facturesPostes.reduce((sum, f) => sum + f.montantTotal, 0),
            statutSuiviPeriode
          };
        });

        // 1. Structures réelles
        const structRows: StructureEnregistrementRow[] = (structures || []).map(s => {
          const dist = s.districtId ? districtMap.get(s.districtId) : undefined;
          const fSiennes = saisies.filter(f =>
            f.structureSanitaireId === s.id &&
            f.annee === annee &&
            (mois === undefined || f.mois === mois) &&
            (trimestre === undefined || Math.ceil(f.mois / 3) === trimestre)
          );
          const hasSaisie = fSiennes.length > 0;
          const hasRejet = fSiennes.some(f => ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const hasEnvoi = fSiennes.some(f => f.statut !== 'BROUILLON' && !['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const statutSuiviPeriode = hasRejet ? 'A_CORRIGER' : hasEnvoi ? 'ENVOYEE' : hasSaisie ? 'EN_COURS' : 'A_SAISIR';
          const dernierMois = hasSaisie ? Math.max(...fSiennes.map(f => f.mois)) : undefined;

          return {
            id: s.id,
            code: s.code || 'STR',
            nom: s.nom,
            type: typeEffectifStructure(s),
            districtNom: dist?.nom || 'District sanitaire',
            bcsuNom: 'BCSU Régional',
            actif: s.actif !== false,
            saisieActive: hasSaisie,
            factureEnvoyeePeriode: statutSuiviPeriode === 'ENVOYEE',
            statutSuiviPeriode,
            nombreFactures: fSiennes.length,
            montantTotal: fSiennes.reduce((sum, f) => sum + f.montantTotal, 0),
            nombreBeneficiaires: fSiennes.reduce((sum, f) => sum + f.nombreBeneficiaires, 0),
            dernierMoisSaisi: dernierMois ? `Mois ${dernierMois} / ${annee}` : 'Aucune'
          };
        });

        // 2. Pharmacies réelles
        const pharmaRows: PharmacieEnregistrementRow[] = (pharmacies || []).map(p => {
          const fSiennes = factures.filter(f =>
            f.typeEtablissement === 'PHARMACIE' &&
            f.etablissementId === p.id &&
            f.annee === annee &&
            (mois === undefined || f.mois === mois) &&
            (trimestre === undefined || Math.ceil(f.mois / 3) === trimestre)
          );
          const hasSaisie = fSiennes.length > 0;
          const hasRejet = fSiennes.some(f => ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const hasEnvoi = fSiennes.some(f => f.statut !== 'BROUILLON' && !['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const statutSuiviPeriode = hasRejet ? 'A_CORRIGER' : hasEnvoi ? 'ENVOYEE' : hasSaisie ? 'EN_COURS' : 'A_SAISIR';
          const dernierMois = hasSaisie ? Math.max(...fSiennes.map(f => f.mois)) : undefined;

          return {
            id: p.id,
            code: p.code || 'PH',
            nom: p.nom,
            ville: (p as any).ville || p.adresse || 'Thiès',
            telephone: p.telephone || '—',
            actif: p.actif !== false,
            saisieActive: hasSaisie,
            factureEnvoyeePeriode: statutSuiviPeriode === 'ENVOYEE',
            statutSuiviPeriode,
            nombreFactures: fSiennes.length,
            montantTotal: fSiennes.reduce((sum, f) => sum + f.montantTotal, 0),
            nombreBeneficiaires: fSiennes.reduce((sum, f) => sum + f.nombreBeneficiaires, 0),
            dernierMoisSaisi: dernierMois ? `Mois ${dernierMois} / ${annee}` : 'Aucune'
          };
        });

        return { districts: districtRows, structures: structRows, pharmacies: pharmaRows };
      })
    );
  }

  private getSaisiesPourSuivi(annee: number, mois?: number, trimestre?: number): Observable<FactureSaisieSuivi[]> {
    // Les brouillons changent depuis les postes (autre session) : bypass du cache GET de 60 s.
    const params = [`annee=${annee}`];
    if (mois !== undefined) params.push(`mois=${mois}`);
    if (trimestre !== undefined) params.push(`trimestre=${trimestre}`);
    return this.api.get<FactureSaisieSuivi[]>(
      `/factures-structure/suivi-saisies?${params.join('&')}`,
      { skipLoading: true, fresh: true }
    );
  }

  /**
   * Suivi BCSU réel
   */
  getSuiviBcsu(filtres: { annee: number; trimestre?: number; mois?: number }): Observable<SuiviBcsuRow[]> {
    return forkJoin({
      factures: this.getToutesFacturesResumes(),
      structures: this.structureService.getStructures().pipe(catchError(() => of([]))),
      bcsus: this.userService.getBcsu().pipe(catchError(() => of([])))
    }).pipe(map(({ factures, structures, bcsus }) => {
        const facturesPeriode = factures.filter(f => this.estDansPeriode(f, filtres));
        return bcsus.map(b => {
          const structuresDuBcsu = structures.filter(s => s.bcsuId === b.id);
          const idsStructures = new Set(structuresDuBcsu.map(s => s.id));
          const fDuBcsu = facturesPeriode.filter(f => idsStructures.has(f.etablissementId));
          const mFacture = fDuBcsu.reduce((s, f) => s + f.montantTotal, 0);
          const mPaye = fDuBcsu.filter(f => f.statut === 'VALIDEE_SR' || f.statut === 'ENVOYEE_NC' || f.statut === 'PAYEE').reduce((s, f) => s + f.montantSencsu, 0);
          const nbBen = fDuBcsu.reduce((s, f) => s + f.nombreBeneficiaires, 0);
          const tx = mFacture > 0 ? Math.round((mPaye / mFacture) * 100) : 0;

          return {
            bcsuId: b.id || '',
            bcsuNom: `${b.prenom} ${b.nom}`.trim(),
            responsableNom: `${b.prenom} ${b.nom}`.trim(),
            nombreStructures: structuresDuBcsu.length,
            nombreFactures: fDuBcsu.length,
            montantFacture: mFacture,
            montantPaye: mPaye,
            resteAPayer: Math.max(0, mFacture - mPaye),
            tauxPaiement: tx,
            nombreBeneficiaires: nbBen
          };
        });
    }));
  }

  private estDansPeriode(f: FactureAssigneeResume, filtres: { annee: number; trimestre?: number; mois?: number }): boolean {
    if (f.annee !== filtres.annee || (filtres.mois && f.mois !== filtres.mois)) return false;
    return !filtres.trimestre || Math.ceil(f.mois / 3) === filtres.trimestre;
  }

  /**
   * Récupère les postes polarisés réels d'un district
   */
  getPostesPolarises(districtId: string, annee = new Date().getFullYear(), mois?: number): Observable<PostePolariseRow[]> {
    return forkJoin({
      structures: this.structureService.getStructures().pipe(catchError(() => of([]))),
      districts: this.districtService.getDistricts().pipe(catchError(() => of([]))),
      saisies: this.getSaisiesPourSuivi(annee, mois).pipe(catchError(() => of([])))
    }).pipe(
      map(({ structures, districts, saisies }) => {
        const district = districts.find(d => d.id === districtId);
        const districtNom = district?.nom || 'District Sanitaire';

        const structuresDuDistrict = structures.filter(s => s.districtId === districtId);
        const idsStructuresDuDistrict = new Set(structuresDuDistrict.map(s => s.id));
        const postesSanitaires = structures.filter(s => {
          const type = typeEffectifStructure(s);
          const rattacheAuDistrict = s.districtId === districtId ||
            (type === 'PS' && !!s.structureRattachementId && idsStructuresDuDistrict.has(s.structureRattachementId));
          const estHopitalOuPoste = type === 'PS' || type === 'EPS';
          return rattacheAuDistrict && estHopitalOuPoste && s.actif !== false;
        });

        // Cette liste représente les données réellement enregistrées. Ne pas créer de
        // postes fictifs : leurs IDs ne peuvent correspondre à aucune facture backend.
        const definitions = postesSanitaires;

        return definitions.map(def => {
          const fSiennes = saisies.filter(f =>
            f.structureSanitaireId === def.id &&
            f.annee === annee &&
            (!mois || f.mois === mois)
          );
          const hasSaisie = fSiennes.length > 0;
          const hasRejet = fSiennes.some(f => ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const hasEnvoi = fSiennes.some(f => f.statut !== 'BROUILLON' && !['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'].includes(f.statut));
          const statutSuiviPeriode = hasRejet ? 'A_CORRIGER' : hasEnvoi ? 'ENVOYEE' : hasSaisie ? 'EN_COURS' : 'A_SAISIR';
          const dernierMois = hasSaisie ? Math.max(...fSiennes.map(f => f.mois)) : undefined;
          const regimes = Array.from(new Set(fSiennes.map(f => f.regime)));

          return {
            id: def.id,
            code: def.code || 'PS',
            nom: def.nom,
            districtId: districtId,
            districtNom: districtNom,
            type: def.typeStructure || 'PS',
            actif: true,
            saisieActive: hasSaisie,
            factureEnvoyeePeriode: statutSuiviPeriode === 'ENVOYEE',
            statutSuiviPeriode,
            nombreFactures: fSiennes.length,
            montantTotal: fSiennes.reduce((s, f) => s + f.montantTotal, 0),
            montantSencsu: fSiennes.reduce((s, f) => s + f.montantSencsu, 0),
            nombreBeneficiaires: fSiennes.reduce((s, f) => s + f.nombreBeneficiaires, 0),
            statutsFactures: Array.from(new Set(fSiennes.map(f => f.statut))),
            dernierMoisSaisi: dernierMois ? `Mois ${dernierMois} / ${annee}` : 'Aucune',
            regimesDisponibles: regimes.length ? regimes : ['ENFANTS_MOINS_5_ANS', 'PLAN_SESAME', 'CONTRIBUTIF']
          };
        });
      })
    );
  }

  /**
   * Récupère en temps réel toutes les factures d'un prestataire
   */
  getFacturesParPrestataire(prestataireId: string, annee: number): Observable<FactureAssigneeResume[]> {
    return this.getToutesFacturesResumes(true).pipe(
      map(all => all.filter(f =>
        (f.etablissementId === prestataireId || f.posteId === prestataireId || f.districtId === prestataireId) &&
        f.annee === annee
      ))
    );
  }

  /**
   * Récupère les patients réels et leurs prestations depuis l'objet facture backend
   */
  getPatientsPourFacture(fac: FactureAssigneeResume): any[] {
    // 1. Extraire les patients réels si factureOrigine est une FactureStructure
    if (fac.factureOrigine && fac.typeEtablissement === 'STRUCTURE') {
      const fs = fac.factureOrigine as FactureStructure;

      // Cas A : dossiers patients existants dans la facture backend
      if (fs.dossiers && fs.dossiers.length > 0) {
        return fs.dossiers.map(d => {
          const matchingLines = (fs.lignes || []).filter(l =>
            (l.dossierId && l.dossierId === d.id) ||
            (l.patientMatricule && d.matricule && l.patientMatricule === d.matricule) ||
            (l.patientNom && d.nom && l.patientNom.toLowerCase() === d.nom.toLowerCase())
          );

          const prestations = matchingLines.map((l, lIdx) => ({
            id: l.prestationId || `${d.id}-l${lIdx}`,
            dossierId: d.id,
            designation: l.designation,
            codeActe: l.codeActe || `ACT-${lIdx + 1}`,
            datePriseEnCharge: l.datePriseEnCharge || '',
            quantite: l.quantite || 1,
            prixUnitaire: l.prixUnitaire || 0,
            montant: l.montant || ((l.quantite || 1) * (l.prixUnitaire || 0)),
            montantSencsu: l.montantSencsu || Math.round((l.montant || 0) * 0.8),
            montantBeneficiaire: l.montantBeneficiaire || Math.round((l.montant || 0) * 0.2),
            statutLigne: l.statutLigne || 'CONFORME'
          }));

          const mntTotal = prestations.reduce((sum, p) => sum + p.montant, 0);

          return {
            id: d.id,
            nom: d.nom || '',
            prenom: d.prenom || '',
            matricule: d.matricule || '',
            cni: d.numeroCni || '',
            sexe: d.sexe || '',
            dateNaissance: d.dateNaissance || '',
            datePriseEnCharge: d.datePriseEnCharge || prestations[0]?.datePriseEnCharge || '',
            statutDossier: d.statut || 'COMPLET',
            montantTotal: mntTotal,
            statutLigne: 'CONFORME',
            prestations,
            pieces: Array.isArray(d.pieces) ? d.pieces : [],
            documents: []
          };
        });
      }

      // Cas B : reconstituer les patients depuis les lignes réelles
      if (fs.lignes && fs.lignes.length > 0) {
        const groups: Record<string, LigneFactureStructure[]> = {};
        fs.lignes.forEach((l, idx) => {
          const key = l.patientMatricule || l.patientNom || l.lettreGarantieNumero || `p-${idx}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(l);
        });

        return Object.entries(groups).map(([key, lines]) => {
          const first = lines[0];
          const prestations = lines.map((l, lIdx) => ({
            id: l.prestationId || `${key}-l${lIdx}`,
            dossierId: key,
            designation: l.designation,
            codeActe: l.codeActe || `ACT-${lIdx + 1}`,
            datePriseEnCharge: l.datePriseEnCharge || '',
            quantite: l.quantite || 1,
            prixUnitaire: l.prixUnitaire || 0,
            montant: l.montant || ((l.quantite || 1) * (l.prixUnitaire || 0)),
            montantSencsu: l.montantSencsu || Math.round((l.montant || 0) * 0.8),
            montantBeneficiaire: l.montantBeneficiaire || Math.round((l.montant || 0) * 0.2),
            statutLigne: l.statutLigne || 'CONFORME'
          }));

          const mntTotal = prestations.reduce((sum, p) => sum + p.montant, 0);

          return {
            id: key,
            nom: first.patientNom || '',
            prenom: first.patientPrenom || '',
            matricule: first.patientMatricule || first.lettreGarantieNumero || '',
            cni: first.patientNumeroCni || '',
            sexe: first.patientSexe || '',
            dateNaissance: first.patientDateNaissance || '',
            datePriseEnCharge: first.datePriseEnCharge || prestations.find(p => p.datePriseEnCharge)?.datePriseEnCharge || '',
            statutDossier: 'A_COMPLETER',
            montantTotal: mntTotal,
            statutLigne: 'CONFORME',
            prestations,
            pieces: [],
            documents: []
          };
        });
      }
    }

    // 2. Extraire les patients réels si factureOrigine est une Facture d'officine
    if (fac.factureOrigine && fac.typeEtablissement === 'PHARMACIE') {
      const fp = fac.factureOrigine as Facture;
      if (fp.lignes && fp.lignes.length > 0) {
        const groups: Record<string, LigneFacture[]> = {};
        fp.lignes.forEach((l, idx) => {
          const key = l.patientMatricule || l.patientNomPrenom || `p-${idx}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(l);
        });

        return Object.entries(groups).map(([key, lines]) => {
          const first = lines[0];
          const nomPrenom = (first.patientNomPrenom || '').split(' ');
          const prestations = lines.map((l, lIdx) => ({
            id: `${key}-l${lIdx}`,
            dossierId: key,
            designation: l.medicament || '',
            codeActe: l.codeProduit || `MED-${lIdx + 1}`,
            datePriseEnCharge: '',
            quantite: l.quantite || 1,
            prixUnitaire: l.prixUnitaire || 0,
            montant: l.montant || ((l.quantite || 1) * (l.prixUnitaire || 0)),
            montantSencsu: Math.round((l.montant || 0) * 0.8),
            montantBeneficiaire: Math.round((l.montant || 0) * 0.2),
            statutLigne: String(l.statutLigne || 'CONFORME')
          }));

          const mntTotal = prestations.reduce((sum, p) => sum + p.montant, 0);

          const pieces = [
            ...(lines.some(l => !!l.ticketCaisse) ? ['TICKET_CAISSE'] : []),
            ...(lines.some(l => !!l.bonCommande) ? ['BON_COMMANDE'] : []),
            ...(lines.some(l => !!l.ordonnance) ? ['ORDONNANCE'] : [])
          ];
          const documents = [
            { type: 'TICKET_CAISSE', image: lines.find(l => l.ticketCaisse)?.ticketCaisse },
            { type: 'BON_COMMANDE', image: lines.find(l => l.bonCommande)?.bonCommande },
            { type: 'ORDONNANCE', image: lines.find(l => l.ordonnance)?.ordonnance }
          ].filter(document => !!document.image);

          return {
            id: key,
            nom: nomPrenom[0] || '',
            prenom: nomPrenom.slice(1).join(' ') || '',
            matricule: first.patientMatricule || '',
            cni: '',
            sexe: '',
            dateNaissance: '',
            datePriseEnCharge: '',
            statutDossier: pieces.length ? 'COMPLET' : 'A_COMPLETER',
            montantTotal: mntTotal,
            statutLigne: 'CONFORME',
            prestations,
            pieces,
            documents
          };
        });
      }
    }

    return [];
  }

  /**
   * Modifie en temps réel une prestation au sein d'une facture
   */
  modifierPrestation(
    factureId: string,
    patientId: string,
    prestationId: string,
    modifs: { designation: string; codeActe: string; quantite: number; prixUnitaire: number }
  ): void {
    const state = this.getFacturesState();
    const patients = state[factureId]?.customPatients;
    if (!patients) return;

    for (const pat of patients) {
      if (pat.id === patientId || pat.prestations.some((pr: any) => pr.id === prestationId)) {
        for (const pr of pat.prestations) {
          if (pr.id === prestationId) {
            pr.designation = modifs.designation;
            pr.codeActe = modifs.codeActe;
            pr.quantite = Number(modifs.quantite);
            pr.prixUnitaire = Number(modifs.prixUnitaire);
            pr.montant = pr.quantite * pr.prixUnitaire;
            pr.montantSencsu = Math.round(pr.montant * 0.8);
            pr.montantBeneficiaire = Math.round(pr.montant * 0.2);
          }
        }
        pat.montantTotal = pat.prestations.reduce((sum: number, p: any) => sum + p.montant, 0);
      }
    }

    const totalFacture = patients.reduce((sum: number, p: any) => sum + p.montantTotal, 0);
    const totalSencsu = Math.round(totalFacture * 0.8);

    state[factureId] = {
      ...(state[factureId] || {}),
      customPatients: patients,
      montantTotal: totalFacture,
      montantSencsu: totalSencsu
    };
    this.setFacturesState(state);
    this.factureEvents.notifyChanged();
  }

  /**
   * Supprime en temps réel une prestation d'une facture
   */
  supprimerPrestation(factureId: string, patientId: string, prestationId: string): void {
    const state = this.getFacturesState();
    const patients = state[factureId]?.customPatients;
    if (!patients) return;

    for (const pat of patients) {
      if (pat.id === patientId || pat.prestations.some((pr: any) => pr.id === prestationId)) {
        pat.prestations = pat.prestations.filter((pr: any) => pr.id !== prestationId);
        pat.montantTotal = pat.prestations.reduce((sum: number, p: any) => sum + p.montant, 0);
      }
    }

    const patientsActifs = patients.filter((pat: any) => pat.prestations.length > 0);
    const totalFacture = patients.reduce((sum: number, p: any) => sum + p.montantTotal, 0);
    const totalSencsu = Math.round(totalFacture * 0.8);

    state[factureId] = {
      ...(state[factureId] || {}),
      customPatients: patients,
      montantTotal: totalFacture,
      montantSencsu: totalSencsu,
      nombreBeneficiaires: patientsActifs.length
    };
    this.setFacturesState(state);
    this.factureEvents.notifyChanged();
  }

  /**
   * Supprime définitivement une facture
   */
  supprimerFacture(factureId: string): void {
    const state = this.getFacturesState();
    state[factureId] = {
      ...(state[factureId] || {}),
      supprimee: true
    };
    this.setFacturesState(state);

    this.structureService.deleteFacture(factureId).pipe(
      catchError(() => of(null))
    ).subscribe();

    this.factureService.delete(factureId).pipe(
      catchError(() => of(null))
    ).subscribe();

    this.factureEvents.notifyChanged();
  }
}
