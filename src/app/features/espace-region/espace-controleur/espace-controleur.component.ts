import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SrGestionService, FactureAssigneeResume } from '../services/sr-gestion.service';
import { DossiersGlobauxService } from '../services/dossiers-globaux.service';
import { AuthService } from '../../../core/services/auth.service';
import { StructureService } from '../../../core/services/structure.service';
import { FactureService } from '../../../core/services/facture.service';
import { FactureCountService } from '../../../core/services/facture-count.service';
import { Facture } from '../../../core/models/facture.model';
import { REGIME_LABELS, Regime } from '../../../core/models/bcsu.model';
import { FactureStructure, TypePiece } from '../../../core/models/structure.model';
import { from, Observable, throwError } from 'rxjs';
import { concatMap, toArray } from 'rxjs/operators';

export interface PatientControleLigne {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  cni: string;
  sexe: string;
  dateNaissance: string;
  datePriseEnCharge: string;
  statutDossier: string;
  montantTotal: number;
  statutLigne: string; // CONFORME, REJETEE
  motifRejet?: string;
  pieces: string[];
  documents: { type: string; image?: string }[];
  prestations: {
    id: string;
      ligneIndex: number;
    designation: string;
    codeActe: string;
    date: string;
    quantite: number;
    prixUnitaire: number;
    montant: number;
    statut: string; // ACCEPTEE, REJETEE
    motifRejet?: string;
    verifiee?: boolean;
  }[];
}

export type ModeControleur = 'FACTURES' | 'CONTROLE';

@Component({
  selector: 'app-espace-controleur',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './espace-controleur.component.html'
})
export class EspaceControleurComponent implements OnInit {
  // Parcours direct :
  // - FACTURES : Liste des factures affectées au contrôleur
  // - CONTROLE : Écran de vérification approfondie de la facture
  mode: ModeControleur = 'FACTURES';

  factureEnControle: FactureAssigneeResume | null = null;

  // Recherche dans les factures affectées
  searchFacture = '';

  // Filtre de statut global (Toutes, A_TRAITER, EN_COURS_SR, VALIDEE_SR, REJETEE_SR) — par défaut « À traiter »
  filtreStatut: string = 'A_TRAITER';

  // Filtre par régime
  filtreRegime: string = '';

  facturesAssignees: FactureAssigneeResume[] = [];
  regimesDisponibles: { code: string; label: string; count: number }[] = [];
  facturesAffecteesCache: FactureAssigneeResume[] = [];
  private facturesConsultees = new Set<string>();
  patients: PatientControleLigne[] = [];
  patientSelectionne: PatientControleLigne | null = null;
  afficherIdentitePatient = false;
  searchPatient = '';
  filtreEtatPatient: 'TOUS' | 'CONFORMES' | 'REJETES' = 'TOUS';

  readonly motifsFrequents: string[] = [
    'Pièce justificative manquante ou illisible',
    'Tarif non conforme au référentiel national',
    'Prestation non prise en charge par ce régime',
    'Prestation déjà facturée ou en double',
    'Défaut de prescription médicale requise',
    'Bénéficiaire non éligible à la date des soins',
    'Dépassement du plafond autorisé sans entente préalable'
  ];

  // Modals
  afficherModalRejet = false;
  typeRejetActuel: 'FACTURE' | 'PATIENT' | 'PRESTATION' = 'FACTURE';
  cibleRejetId = '';
  cibleRejetNom = '';
  motifRejetInput = '';

  afficherModalDossier = false;
  patientDossierActif: PatientControleLigne | null = null;
  piecesDossier: Record<string, { image?: string; chargement: boolean; erreur: boolean }> = {};

  loading = false;
  factureDetailEnChargementId: string | null = null;
  actionControleEnCours = false;
  telechargementEnCours = false;

  constructor(
    public auth: AuthService,
    public factureCount: FactureCountService,
    private srService: SrGestionService,
    private dossiersGlobaux: DossiersGlobauxService,
    private structureService: StructureService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.chargerFacturesConsultees();
    this.chargerFacturesAssignees();
  }

  private get storageKeyConsultees(): string {
    return `csu_controleur_seen_${this.controleurAffiche.id || 'default'}`;
  }

  private chargerFacturesConsultees(): void {
    this.facturesConsultees.clear();
    try {
      const raw = localStorage.getItem(this.storageKeyConsultees);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(id => this.facturesConsultees.add(String(id)));
        }
      }
    } catch { /* stockage indisponible */ }
  }

  private marquerFactureConsultee(id: string): void {
    if (!id) return;
    if (!this.facturesConsultees.has(id)) {
      this.facturesConsultees.add(id);
      try {
        localStorage.setItem(this.storageKeyConsultees, JSON.stringify([...this.facturesConsultees]));
      } catch { /* stockage indisponible */ }
    }
    this.factureCount.markStructureInvoiceSeen(id);
  }

  estNouvelleFacture(f: FactureAssigneeResume): boolean {
    if (!f?.id) return false;
    return this.factureCount.isNewStructureInvoice(f.id)
      || (f.statut === 'A_TRAITER' && !this.facturesConsultees.has(f.id));
  }

  get nbNouvellesFactures(): number {
    return this.facturesAssignees.filter(f => this.estNouvelleFacture(f)).length;
  }

  getRegimeCodeEffectif(f?: FactureAssigneeResume | null): string {
    if (!f) return '';
    return (f.regime || (f.typeEtablissement === 'PHARMACIE' ? 'CONTRIBUTIF' : '') || '').trim();
  }

  controleurFiltreId = '';

  get controleursDisponibles(): any[] {
    return this.srService.getControleursActifs();
  }

  get controleurAffiche(): { id: string; nom: string } {
    if (this.controleurFiltreId) {
      const c = this.controleursDisponibles.find(ctrl => ctrl.id === this.controleurFiltreId);
      if (c) return { id: c.id, nom: `${c.prenom} ${c.nom}` };
    }
    return { id: this.controleurIdActuel, nom: this.controleurNomActuel };
  }

  get controleurNomActuel(): string {
    const user = this.auth.getCurrentUser();
    if (user?.nom && user?.prenom) {
      return `${user.prenom} ${user.nom}`;
    }
    return 'Contrôleur';
  }

  get controleurIdActuel(): string {
    return this.auth.getCurrentUser()?.userId || '';
  }

  chargerFacturesAssignees(): void {
    this.chargerFacturesConsultees();
    this.loading = true;
    // Ne pas convertir une erreur de lecture API en liste vide : pour le compte
    // contrôleur, la liste vient directement des factures qui lui sont assignées.
    this.srService.getToutesFacturesResumes(false, false, true).subscribe({
      next: all => {
        const monId = this.controleurAffiche.id;
        const monNom = this.controleurAffiche.nom.trim().toLowerCase();

        // Le contrôleur ne reçoit QUE ses assignations nominatives.
        // Seules les factures dont le contrôleur assigné correspond sont affichées.
        this.facturesAssignees = all.filter(f => {
          if (f.statut === 'ENVOYEE_NC') return false;

          const fId = f.controleurId || '';
          const fNom = (f.controleurNom || '').trim().toLowerCase();

          if (!fId && !fNom) return false;

          const estMonAssignation = (!!monId && fId === monId)
            || (!!monNom && monNom !== 'contrôleur' && (fNom === monNom || fNom.includes(monNom) || monNom.includes(fNom)));

          return estMonAssignation;
        });

        // Si l'administrateur / superviseur SR n'a pas sélectionné de contrôleur et n'a aucune assignation propre,
        // mais qu'un contrôleur a des factures assignées, pré-sélectionner ce contrôleur pour afficher directement ses factures
        if (this.auth.isAdminSR() && !this.controleurFiltreId && this.facturesAssignees.length === 0) {
          const assignee = all.find(f => f.statut !== 'ENVOYEE_NC' && !!f.controleurId);
          if (assignee && assignee.controleurId) {
            this.controleurFiltreId = assignee.controleurId;
            const cId = this.controleurFiltreId;
            const cNom = (assignee.controleurNom || '').trim().toLowerCase();
            this.facturesAssignees = all.filter(f => {
              if (f.statut === 'ENVOYEE_NC') return false;
              const fId = f.controleurId || '';
              const fNom = (f.controleurNom || '').trim().toLowerCase();
              return (!!cId && fId === cId) || (!!cNom && (fNom === cNom || fNom.includes(cNom) || cNom.includes(fNom)));
            });
          }
        }

        this.recalculerRegimesDisponibles();
        this.recalculerFacturesAffectees();
        if (this.mode !== 'CONTROLE') {
          this.mode = 'FACTURES';
        }
        this.loading = false;
      },
      error: () => {
        this.facturesAssignees = [];
        this.regimesDisponibles = [];
        this.facturesAffecteesCache = [];
        this.loading = false;
        this.snackBar.open('Impossible de charger les factures affectées.', 'Fermer', { duration: 5000 });
      }
    });
  }

  private recalculerRegimesDisponibles(): void {
    const map = new Map<string, number>();
    for (const f of this.facturesAssignees) {
      const code = this.getRegimeCodeEffectif(f);
      if (!code) continue;
      map.set(code, (map.get(code) || 0) + 1);
    }
    this.regimesDisponibles = [...map.entries()]
      .map(([code, count]) => ({ code, label: this.getRegimeLabel(code), count }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    if (this.filtreRegime && !map.has(this.filtreRegime)) {
      this.filtreRegime = '';
    }
  }

  setFiltreStatut(statut: string): void {
    this.filtreStatut = statut;
    this.recalculerFacturesAffectees();
  }

  onFiltreFacturesChange(): void {
    this.recalculerFacturesAffectees();
  }

  get facturesFiltrees(): FactureAssigneeResume[] {
    return this.facturesAssignees.filter(f => {
      if (this.filtreStatut && f.statut !== this.filtreStatut) return false;
      if (this.filtreRegime && this.getRegimeCodeEffectif(f) !== this.filtreRegime) return false;
      return true;
    });
  }

  recalculerFacturesAffectees(): void {
    const list = [...this.facturesFiltrees].sort((a, b) =>
      ((a.statut === 'A_TRAITER' ? 0 : 1) - (b.statut === 'A_TRAITER' ? 0 : 1))
      || (b.annee - a.annee)
      || (b.mois - a.mois)
      || (a.etablissementNom || '').localeCompare(b.etablissementNom || '', 'fr')
    );
    const term = this.searchFacture.toLowerCase().trim();
    if (!term) {
      this.facturesAffecteesCache = list;
      return;
    }
    this.facturesAffecteesCache = list.filter(f =>
      (f.numero && f.numero.toLowerCase().includes(term)) ||
      (f.etablissementNom && f.etablissementNom.toLowerCase().includes(term)) ||
      (f.etablissementCode && f.etablissementCode.toLowerCase().includes(term)) ||
      (f.districtNom && f.districtNom.toLowerCase().includes(term)) ||
      (f.regime && f.regime.toLowerCase().includes(term)) ||
      this.getRegimeLabel(this.getRegimeCodeEffectif(f)).toLowerCase().includes(term) ||
      this.getMoisLibelle(f.mois).toLowerCase().includes(term)
    );
  }

  get facturesAffectees(): FactureAssigneeResume[] {
    return this.facturesAffecteesCache;
  }

  libelleTypeEtablissement(facture: FactureAssigneeResume): string {
    if (facture.typeEtablissement === 'PHARMACIE') return 'Pharmacie';
    switch ((facture.typeStructure || '').toUpperCase()) {
      case 'PS': return 'Poste de santé';
      case 'EPS': return 'Hôpital / EPS';
      case 'CS': return 'Centre de santé';
      default: return 'Structure sanitaire';
    }
  }

  // ===================== NAVIGATION =====================

  retourAuxFactures(): void {
    this.mode = 'FACTURES';
    this.factureEnControle = null;
    this.patientSelectionne = null;
    this.factureDetailEnChargementId = null;
    this.recalculerFacturesAffectees();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Métriques d'avancement
  get nbATraiter(): number { return this.facturesAssignees.filter(f => f.statut === 'A_TRAITER').length; }
  get nbEnCours(): number { return this.facturesAssignees.filter(f => f.statut === 'EN_COURS_SR').length; }
  get nbValidees(): number { return this.facturesAssignees.filter(f => f.statut === 'VALIDEE_SR').length; }
  get nbRejetees(): number { return this.facturesAssignees.filter(f => f.statut === 'REJETEE_SR').length; }

  // ===================== OUVERTURE DU CONTRÔLE D'UNE FACTURE =====================

  ouvrirControle(fac: FactureAssigneeResume): void {
    this.factureEnControle = fac;
    this.mode = 'CONTROLE';
    this.patientSelectionne = null;
    this.searchPatient = '';
    this.chargerPatientsFacture(fac);
  }

  retourListe(): void {
    this.retourAuxFactures();
  }

  retourAuxPatients(): void {
    this.patientSelectionne = null;
    if (this.factureEnControle) this.chargerPatientsFacture(this.factureEnControle);
  }

  ouvrirPatient(patient: PatientControleLigne): void {
    this.patientSelectionne = patient;
    this.afficherIdentitePatient = false;
  }

  private chargerPatientsFacture(fac: FactureAssigneeResume): void {
    const origine = fac.factureOrigine;
    const sourceReelle = fac.typeEtablissement === 'STRUCTURE'
      ? !!origine && ('dossiers' in origine && !!origine.dossiers?.length || 'lignes' in origine && !!origine.lignes?.length)
      : !!origine && 'lignes' in origine && !!origine.lignes?.length;
    const patients = sourceReelle ? this.srService.getPatientsPourFacture(fac) as any[] : [];
    this.patients = patients.map((patient, index) => {
      const id = String(patient.id || `ligne-${index}`);
      const motifPatient = patient.motifRejet;
      const prestations = (patient.prestations || []).map((prestation: any, prestationIndex: number) => {
        const prestationId = String(prestation.id || `${id}-ligne-${prestationIndex}`);
        const motifLigne = prestation.motifRejet;
        const estRejet = !!motifPatient || !!motifLigne || prestation.statutLigne === 'REJETEE';
        return {
          id: prestationId,
          designation: prestation.designation || 'Prestation',
          codeActe: prestation.codeActe || '',
          date: prestation.datePriseEnCharge || prestation.date || '',
          quantite: Number(prestation.quantite) || 1,
          prixUnitaire: Number(prestation.prixUnitaire) || 0,
          montant: Number(prestation.montant) || 0,
          statut: estRejet ? 'REJETEE' : 'ACCEPTEE',
          motifRejet: motifLigne || motifPatient,
          verifiee: estRejet || prestation.statutLigne === 'ACCEPTEE' || !!prestation.controleRegionLe || fac.statut === 'VALIDEE_SR',
          ligneIndex: Number.isInteger(prestation.ligneIndex) ? prestation.ligneIndex : -1
        };
      });
      const estRejete = !!motifPatient || patient.statutLigne === 'REJETEE' || prestations.some((pr: any) => pr.statut === 'REJETEE');
      return {
        id,
        nom: patient.nom || 'Bénéficiaire',
        prenom: patient.prenom || '',
        matricule: patient.matricule || '',
        cni: patient.cni || '',
        sexe: patient.sexe || '',
        dateNaissance: patient.dateNaissance || '',
        datePriseEnCharge: patient.datePriseEnCharge || '',
        statutDossier: patient.statutDossier || 'COMPLET',
        montantTotal: Number(patient.montantTotal) || prestations.reduce((sum: number, p: any) => sum + p.montant, 0),
        statutLigne: estRejete ? 'REJETEE' : 'CONFORME',
        motifRejet: motifPatient,
        pieces: Array.isArray(patient.pieces) ? patient.pieces : [],
        documents: Array.isArray(patient.documents) ? patient.documents : [],
        prestations
      };
    });
    this.recalculerPatientsFiltres();
  }

  patientsFiltresCache: PatientControleLigne[] = [];

  get patientsFiltres(): PatientControleLigne[] {
    return this.patientsFiltresCache;
  }

  onFiltreChange(): void {
    this.recalculerPatientsFiltres();
  }

  recalculerPatientsFiltres(): void {
    let list = this.patients;
    if (this.filtreEtatPatient === 'CONFORMES') {
      list = list.filter(p => p.statutLigne === 'CONFORME' && !p.prestations.some(pr => pr.statut === 'REJETEE'));
    } else if (this.filtreEtatPatient === 'REJETES') {
      list = list.filter(p => p.statutLigne === 'REJETEE' || p.prestations.some(pr => pr.statut === 'REJETEE'));
    }

    if (!this.searchPatient) {
      this.patientsFiltresCache = list;
      return;
    }
    const q = this.searchPatient.toLowerCase().trim();
    this.patientsFiltresCache = list.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q) ||
      p.cni.toLowerCase().includes(q)
    );
  }

  trackById(_index: number, item: any): string {
    return item?.id || String(_index);
  }

  // === SYSTÈME DE CONTRÔLE : MÉTRIQUES FACTURE ===
  get totalPrestationsFacture(): number {
    return this.patients.reduce((sum, p) => sum + p.prestations.length, 0);
  }

  get nbPrestationsControlees(): number {
    return this.patients.reduce((sum, p) =>
      sum + p.prestations.filter(pr => pr.statut === 'REJETEE' || pr.verifiee).length, 0);
  }

  get nbPrestationsConformes(): number {
    return this.patients.reduce((sum, p) =>
      sum + p.prestations.filter(pr => pr.statut === 'ACCEPTEE' && pr.verifiee).length, 0);
  }

  get nbPrestationsRejetees(): number {
    return this.patients.reduce((sum, p) =>
      sum + p.prestations.filter(pr => pr.statut === 'REJETEE').length, 0);
  }

  get pourcentageControle(): number {
    const total = this.totalPrestationsFacture;
    if (total === 0) return 0;
    return Math.round((this.nbPrestationsControlees / total) * 100);
  }

  get montantValideFacture(): number {
    return this.patients.reduce((sum, p) => {
      const valid = p.prestations
        .filter(pr => pr.statut !== 'REJETEE')
        .reduce((s, pr) => s + pr.montant, 0);
      return sum + valid;
    }, 0);
  }

  get montantRejeteFacture(): number {
    return this.patients.reduce((sum, p) => {
      const rej = p.prestations
        .filter(pr => pr.statut === 'REJETEE')
        .reduce((s, pr) => s + pr.montant, 0);
      return sum + rej;
    }, 0);
  }

  get nbPatientsAvecRejet(): number {
    return this.patients.filter(p => p.statutLigne === 'REJETEE' || p.prestations.some(pr => pr.statut === 'REJETEE')).length;
  }

  // === SYSTÈME DE CONTRÔLE : MÉTRIQUES PATIENT SÉLECTIONNÉ ===
  montantValidePatient(p: PatientControleLigne): number {
    return p.prestations
      .filter(pr => pr.statut !== 'REJETEE')
      .reduce((sum, pr) => sum + pr.montant, 0);
  }

  montantRejetePatient(p: PatientControleLigne): number {
    return p.prestations
      .filter(pr => pr.statut === 'REJETEE')
      .reduce((sum, pr) => sum + pr.montant, 0);
  }

  // === NAVIGATION RAPIDE ENTRE PATIENTS ===
  get indexPatientSelectionne(): number {
    if (!this.patientSelectionne) return -1;
    return this.patientsFiltres.findIndex(p => p.id === this.patientSelectionne!.id);
  }

  get patientPrecedent(): PatientControleLigne | null {
    const idx = this.indexPatientSelectionne;
    return idx > 0 ? this.patientsFiltres[idx - 1] : null;
  }

  get patientSuivant(): PatientControleLigne | null {
    const idx = this.indexPatientSelectionne;
    return idx >= 0 && idx < this.patientsFiltres.length - 1 ? this.patientsFiltres[idx + 1] : null;
  }

  allerAuPatient(p: PatientControleLigne): void {
    this.patientSelectionne = p;
    this.afficherIdentitePatient = false;
  }

  selectionnerMotifFrequent(motif: string): void {
    this.motifRejetInput = motif;
  }

  // === CONTRÔLE PAR LIGNE DE PRESTATION ===
  validerPrestation(p: PatientControleLigne, pr: any): void {
    this.enregistrerDecisionPrestation(p, pr, true);
  }

  annulerRejetPrestation(p: PatientControleLigne, pr: any): void {
    this.enregistrerDecisionPrestation(p, pr, true);
  }

  validerToutesPrestationsPatient(p: PatientControleLigne): void {
    if (!this.peutControlerFacture || this.actionControleEnCours) return;
    if (!p.prestations.length) return;
    if (p.prestations.some(pr => !Number.isInteger(pr.ligneIndex) || pr.ligneIndex < 0)) {
      this.snackBar.open('Une prestation ne peut pas être identifiée dans la facture.', 'Fermer', { duration: 4000 });
      return;
    }
    this.actionControleEnCours = true;
    from(p.prestations).pipe(
      concatMap(pr => this.requeteDecisionPrestation(pr, true)),
      toArray()
    ).subscribe({
      next: () => {
        p.prestations.forEach(pr => this.appliquerDecisionLocale(p, pr, true));
        this.actionControleEnCours = false;
        this.snackBar.open(`Prestations de ${p.prenom} ${p.nom} marquées conformes.`, 'OK', { duration: 3000 });
      },
      error: () => {
        this.actionControleEnCours = false;
        this.snackBar.open('Impossible d’enregistrer toutes les décisions. Réessayez.', 'Fermer', { duration: 5000 });
      }
    });
  }

  private enregistrerDecisionPrestation(p: PatientControleLigne, pr: any, accepter: boolean, motif?: string): void {
    if (!this.factureEnControle || this.actionControleEnCours) return;
    if (!this.peutControlerFacture) {
      this.snackBar.open('Cette facture n’est plus en cours de contrôle.', 'Fermer', { duration: 3500 });
      return;
    }
    if (!Number.isInteger(pr.ligneIndex) || pr.ligneIndex < 0) {
      this.snackBar.open('Cette prestation ne peut pas être identifiée dans la facture.', 'Fermer', { duration: 4000 });
      return;
    }
    this.actionControleEnCours = true;
    this.requeteDecisionPrestation(pr, accepter, motif).subscribe({
      next: () => {
        this.appliquerDecisionLocale(p, pr, accepter, motif);
        this.actionControleEnCours = false;
        if (!accepter) this.afficherModalRejet = false;
        this.snackBar.open(accepter
          ? `Prestation « ${pr.designation} » validée conforme.`
          : `Prestation « ${pr.designation} » rejetée avec motif.`, 'OK', { duration: 3000 });
      },
      error: () => {
        this.actionControleEnCours = false;
        this.snackBar.open('La décision n’a pas été enregistrée. Vérifiez votre connexion puis réessayez.', 'Fermer', { duration: 5000 });
      }
    });
  }

  private requeteDecisionPrestation(pr: any, accepter: boolean, motif?: string): Observable<unknown> {
    const facture = this.factureEnControle;
    if (!facture || !Number.isInteger(pr.ligneIndex) || pr.ligneIndex < 0) {
      return throwError(() => new Error('Index de prestation invalide'));
    }
    return facture.typeEtablissement === 'PHARMACIE'
      ? this.factureService.deciderLigne(facture.id, pr.ligneIndex, { accepter, motif })
      : this.structureService.deciderLigne(facture.id, pr.ligneIndex, accepter, motif);
  }

  private appliquerDecisionLocale(p: PatientControleLigne, pr: any, accepter: boolean, motif?: string): void {
    pr.statut = accepter ? 'ACCEPTEE' : 'REJETEE';
    pr.motifRejet = accepter ? undefined : motif;
    pr.verifiee = true;
    if (!p.prestations.some(pre => pre.statut === 'REJETEE')) {
      p.statutLigne = 'CONFORME';
      p.motifRejet = undefined;
    }
  }

  get peutControlerFacture(): boolean {
    return !!this.factureEnControle && ['A_TRAITER', 'EN_COURS_SR'].includes(this.factureEnControle.statut);
  }

  get toutesPrestationsDecidees(): boolean {
    return this.patients.length > 0 && this.patients.every(p => p.prestations.length > 0
      && p.prestations.every(pr => pr.verifiee && (pr.statut === 'ACCEPTEE' || pr.statut === 'REJETEE')));
  }

  patientEstRejete(p: PatientControleLigne): boolean {
    return p.statutLigne === 'REJETEE' || p.prestations.some(pr => pr.statut === 'REJETEE');
  }

  patientEstVerifieConforme(p: PatientControleLigne): boolean {
    return p.prestations.length > 0 && p.prestations.every(pr => pr.statut === 'ACCEPTEE' && pr.verifiee);
  }

  // ===================== TÉLÉCHARGEMENTS (EXCEL & DOSSIERS GLOBAUX ZIP) =====================

  /**
   * Télécharger la facture en Excel pour un contrôle hors ligne
   */
  telechargerExcel(): void {
    if (!this.factureEnControle) return;
    this.snackBar.open('Téléchargement Excel de contrôle démarré.', 'OK', { duration: 3000 });

    if (this.factureEnControle.typeEtablissement === 'PHARMACIE') {
      this.factureService.exportFactureExcel(this.factureEnControle.id).subscribe({
        next: (blob) => this.declencherDownload(blob, `Controle_Pharmacie_${this.factureEnControle?.numero}.xlsx`),
        error: () => {}
      });
    } else {
      this.structureService.exportFactureExcel(this.factureEnControle.id).subscribe({
        next: (blob) => this.declencherDownload(blob, `Controle_Structure_${this.factureEnControle?.numero}.xlsx`),
        error: () => {}
      });
    }
  }

  /**
   * Télécharger les Dossiers globaux des patients (ZIP)
   */
  async telechargerDossiersGlobaux(): Promise<void> {
    if (!this.factureEnControle) return;
    if (this.factureEnControle.typeEtablissement !== 'STRUCTURE') {
      this.snackBar.open('Les dossiers globaux ne sont disponibles que pour les factures de structures.', 'Fermer', { duration: 4000 });
      return;
    }
    this.telechargementEnCours = true;
    this.snackBar.open('Génération du ZIP des dossiers globaux des patients...', 'OK', { duration: 3000 });

    try {
      const facStruct = this.factureEnControle.factureOrigine as FactureStructure | undefined;
      if (!facStruct) throw new Error('La facture backend ne contient pas son détail.');
      await this.dossiersGlobaux.telechargerDossiersGlobauxStructure(facStruct);
      this.snackBar.open('Dossiers globaux téléchargés avec succès !', 'Fermer', { duration: 4000 });
    } catch (e) {
      this.snackBar.open('Erreur lors de la génération du ZIP.', 'Fermer', { duration: 4000 });
    } finally {
      this.telechargementEnCours = false;
    }
  }

  private declencherDownload(blob: Blob, nom: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // ===================== REJET MULTI-NIVEAUX (1: FACTURE, 2: PATIENT, 3: PRESTATION) =====================

  ouvrirModalRejetFacture(): void {
    this.typeRejetActuel = 'FACTURE';
    this.cibleRejetId = this.factureEnControle?.id || '';
    this.cibleRejetNom = `la facture ${this.factureEnControle?.numero}`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  ouvrirModalRejetPatient(p: PatientControleLigne): void {
    this.typeRejetActuel = 'PATIENT';
    this.cibleRejetId = p.id;
    this.cibleRejetNom = `le patient ${p.prenom} ${p.nom} (${p.matricule})`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  ouvrirModalRejetPrestation(p: PatientControleLigne, pr: any): void {
    this.typeRejetActuel = 'PRESTATION';
    this.cibleRejetId = pr.id;
    this.cibleRejetNom = `la prestation « ${pr.designation} » de ${p.prenom} ${p.nom}`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  validerRejet(): void {
    if (!this.motifRejetInput.trim()) {
      this.snackBar.open('L\'explication de la non-conformité est obligatoire !', 'OK', { duration: 3000 });
      return;
    }
    if (!this.factureEnControle || !this.peutControlerFacture || this.actionControleEnCours) return;
    const facture = this.factureEnControle;
    const motif = this.motifRejetInput.trim();

    if (this.typeRejetActuel === 'FACTURE') {
      this.actionControleEnCours = true;
      const rejet$: Observable<unknown> = facture.typeEtablissement === 'PHARMACIE'
        ? this.factureService.rejeter(facture.id, { commentaire: motif })
        : this.structureService.rejeterFacture(facture.id, motif);
      rejet$.subscribe({
        next: () => {
          facture.statut = 'REJETEE_SR';
          facture.commentaireRejet = motif;
          this.actionControleEnCours = false;
          this.afficherModalRejet = false;
          this.snackBar.open('Facture rejetée et renvoyée à la structure pour correction.', 'Fermer', { duration: 4500 });
          this.retourListe();
        },
        error: () => {
          this.actionControleEnCours = false;
          this.snackBar.open('Le rejet n’a pas été enregistré. La facture reste à traiter.', 'Fermer', { duration: 5000 });
        }
      });
    } else if (this.typeRejetActuel === 'PATIENT') {
      const pat = this.patients.find(p => p.id === this.cibleRejetId);
      if (!pat || !pat.prestations.length) return;
      if (pat.prestations.some(pr => !Number.isInteger(pr.ligneIndex) || pr.ligneIndex < 0)) {
        this.snackBar.open('Impossible d’identifier toutes les prestations de ce patient.', 'Fermer', { duration: 4000 });
        return;
      }
      this.actionControleEnCours = true;
      from(pat.prestations).pipe(
        concatMap(pr => this.requeteDecisionPrestation(pr, false, motif)),
        toArray()
      ).subscribe({
        next: () => {
          pat.prestations.forEach(pr => this.appliquerDecisionLocale(pat, pr, false, motif));
          pat.motifRejet = motif;
          this.actionControleEnCours = false;
          this.afficherModalRejet = false;
          this.snackBar.open('Prestations du patient rejetées avec motif.', 'Fermer', { duration: 3500 });
        },
        error: () => {
          this.actionControleEnCours = false;
          this.snackBar.open('Le rejet du patient n’a pas été enregistré.', 'Fermer', { duration: 4500 });
        }
      });
    } else if (this.typeRejetActuel === 'PRESTATION') {
      const patient = this.patients.find(p => p.prestations.some(pr => pr.id === this.cibleRejetId));
      const prestation = patient?.prestations.find(pr => pr.id === this.cibleRejetId);
      if (!patient || !prestation) return;
      this.enregistrerDecisionPrestation(patient, prestation, false, motif);
    }
  }

  validerFacture(): void {
    if (!this.factureEnControle) return;
    if (!this.peutControlerFacture) return;
    if (!this.toutesPrestationsDecidees) {
      this.snackBar.open('Décidez chaque prestation avant de valider la facture.', 'Fermer', { duration: 4000 });
      return;
    }
    this.actionControleEnCours = true;
    const facture = this.factureEnControle;
    const validation$: Observable<unknown> = facture.typeEtablissement === 'PHARMACIE'
      ? this.factureService.valider(facture.id, { commentaire: 'Contrôle des prestations terminé' })
      : this.structureService.validerFacture(facture.id, 'Contrôle des prestations terminé');
    validation$.subscribe({
      next: () => {
        facture.statut = 'VALIDEE_SR';
        this.actionControleEnCours = false;
        this.snackBar.open('Facture validée après contrôle des prestations.', 'Fermer', { duration: 4000 });
        this.retourListe();
      },
      error: () => {
        this.actionControleEnCours = false;
        this.snackBar.open('La validation de la facture a échoué. Vérifiez qu’elle est toujours à traiter.', 'Fermer', { duration: 5000 });
      }
    });
  }

  voirDossier(p: PatientControleLigne): void {
    this.patientDossierActif = p;
    this.piecesDossier = {};
    this.afficherModalDossier = true;
    const typesPieceConnus: TypePiece[] = ['TICKET_CAISSE', 'CNI_RECTO', 'CNI_VERSO', 'EXTRAIT_NAISSANCE', 'CARTE_ASSURE', 'PHOTO_ASSURE'];
    for (const type of p.pieces) {
      this.piecesDossier[type] = { chargement: false, erreur: false };
      const document = p.documents.find(piece => piece.type === type && piece.image);
      if (document?.image) {
        this.piecesDossier[type] = { image: document.image, chargement: false, erreur: false };
      } else if (this.factureEnControle?.typeEtablissement === 'STRUCTURE' && typesPieceConnus.includes(type as TypePiece)) {
        this.piecesDossier[type].chargement = true;
        this.structureService.getPiece(this.factureEnControle.id, p.id, type as TypePiece).subscribe({
          next: result => this.piecesDossier[type] = { image: result?.image, chargement: false, erreur: !result?.image },
          error: () => this.piecesDossier[type] = { chargement: false, erreur: true }
        });
      } else {
        this.piecesDossier[type].erreur = true;
      }
    }
  }

  aLaPiece(patient: PatientControleLigne, type: string): boolean {
    return patient.pieces.includes(type);
  }

  libellePiece(type: string): string {
    const libelles: Record<string, string> = {
      CARTE_ASSURE: 'Carte d’assuré',
      TICKET_CAISSE: 'Ticket de caisse',
      CNI_RECTO: 'CNI — recto',
      CNI_VERSO: 'CNI — verso',
      EXTRAIT_NAISSANCE: 'Extrait de naissance',
      PHOTO_ASSURE: 'Photo de l’assuré',
      FEUILLE_SOINS: 'Feuille de soins'
    };
    return libelles[type] || type.replaceAll('_', ' ');
  }

  formatDate(date?: string): string {
    if (!date) return '—';
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
  }

  countParStatut(statut: string): number {
    return this.facturesAssignees.filter(f =>
      f.statut === statut && (!this.filtreRegime || this.getRegimeCodeEffectif(f) === this.filtreRegime)
    ).length;
  }

  get totalFacturesFiltreesParRegime(): number {
    if (!this.filtreRegime) return this.facturesAssignees.length;
    return this.facturesAssignees.filter(f => this.getRegimeCodeEffectif(f) === this.filtreRegime).length;
  }

  ouvrirFacture(f: FactureAssigneeResume): void {
    this.marquerFactureConsultee(f.id);
    if (this.factureDetailEnChargementId === f.id && this.mode === 'CONTROLE') return;

    // Ouvrir immédiatement la vérification avec les données de la liste. Le chargement
    // du détail complète ensuite les pièces ; une réponse lente/indisponible ne doit
    // pas rendre la facture assignée non cliquable.
    this.ouvrirControle(f);
    this.factureDetailEnChargementId = f.id;
    const detail$: Observable<FactureStructure | Facture> = f.typeEtablissement === 'PHARMACIE'
      ? this.factureService.getById(f.id)
      : this.structureService.getFacture(f.id, { fresh: true });

    detail$.subscribe({
      next: detail => {
        if (this.factureDetailEnChargementId === f.id) {
          this.factureDetailEnChargementId = null;
        }
        if (this.factureEnControle?.id !== f.id) return;
        f.factureOrigine = detail;
        const statut = String(detail.statut || '');
        if (statut) f.statut = statut === 'ENVOYEE' ? 'A_TRAITER' : statut;
        this.chargerPatientsFacture(f);
        if (!this.patients.some(patient => patient.prestations.length > 0)) {
          this.snackBar.open('Cette facture ne contient aucune prestation à vérifier.', 'Fermer', { duration: 4500 });
        }
      },
      error: () => {
        if (this.factureDetailEnChargementId === f.id) {
          this.factureDetailEnChargementId = null;
        }
        if (this.factureEnControle?.id === f.id) {
          this.snackBar.open('Facture ouverte. Le détail complémentaire est indisponible ; les données de la liste restent affichées.', 'Fermer', { duration: 5000 });
        }
      }
    });
  }

  getMoisLibelle(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || `Mois ${mois}`;
  }

  getStatutLibelle(statut: string): string {
    switch (statut) {
      case 'A_TRAITER': return 'À traiter';
      case 'EN_COURS_SR': return 'En cours SR';
      case 'VALIDEE_SR': return 'Validée SR';
      case 'REJETEE_SR': return 'Rejetée SR';
      case 'ENVOYEE_NC': return 'Envoyée au NC';
      case 'VALIDEE_NC': return 'Validée NC';
      case 'PAYEE': return 'Payée';
      default: return statut;
    }
  }

  getStatutBadgeClass(statut: string): string {
    switch (statut) {
      case 'A_TRAITER':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'EN_COURS_SR':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'VALIDEE_SR':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'REJETEE_SR':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'ENVOYEE_NC':
        return 'bg-blue-200 text-blue-900 border border-blue-300';
      case 'PAYEE':
        return 'bg-purple-100 text-purple-800 border border-purple-300';
      default:
        return 'bg-slate-100 text-slate-700 border border-slate-300';
    }
  }

  getInitiales(prenom?: string, nom?: string): string {
    const p = (prenom || '').trim().charAt(0).toUpperCase();
    const n = (nom || '').trim().charAt(0).toUpperCase();
    return `${p}${n}` || '—';
  }

  getRegimeLabel(code?: string): string {
    if (!code) return 'Régime non précisé';
    const connu = REGIME_LABELS[code as Regime];
    if (connu) return connu;
    switch (code) {
      case 'ENFANTS_MOINS_5_ANS': return 'Gratuité < 5 ans';
      case 'PLAN_SESAME': return 'Plan Sésame (60+)';
      case 'CONTRIBUTIF': return 'Contributif (Mutuelles/BSF)';
      case 'CESARIENNE': return 'Maternité / Césarienne';
      case 'DIALYSE': return 'Dialyse';
      default: return code.replace(/_/g, ' ');
    }
  }

  getRegimeBadgeClass(code?: string): string {
    if (!code) return 'bg-slate-100 text-slate-800';
    switch (code) {
      case 'ZERO_CINQ_ANS':
      case 'ENFANTS_MOINS_5_ANS': return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'SESAME':
      case 'PLAN_SESAME': return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'CONTRIBUTIF':
      case 'NDONGO_DARA':
      case 'ELEVES': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'CESARIENNE': return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'BSF':
      case 'CEC':
      case 'BSF_CEC': return 'bg-teal-100 text-teal-800 border border-teal-200';
      case 'DIALYSE':
      case 'DIALYSE_PERITONEALE':
      case 'HEMODIALYSE': return 'bg-rose-100 text-rose-800 border border-rose-200';
      default: return 'bg-slate-100 text-slate-800 border border-slate-200';
    }
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
