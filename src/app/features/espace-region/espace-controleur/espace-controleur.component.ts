import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SrGestionService, FactureAssigneeResume, StatutTraitementSR } from '../services/sr-gestion.service';
import { DossiersGlobauxService } from '../services/dossiers-globaux.service';
import { AuthService } from '../../../core/services/auth.service';
import { StructureService } from '../../../core/services/structure.service';
import { FactureService } from '../../../core/services/facture.service';
import { FactureStructure, TypePiece } from '../../../core/models/structure.model';

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

interface EtablissementControle {
  id: string;
  nom: string;
  code?: string;
  type: string;
  factures: FactureAssigneeResume[];
}

interface GroupeControle {
  id: string;
  nom: string;
  etablissements: EtablissementControle[];
  nombreFactures: number;
}

@Component({
  selector: 'app-espace-controleur',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './espace-controleur.component.html'
})
export class EspaceControleurComponent implements OnInit {
  // Mode d'affichage : 'LISTE' des factures assignées, ou 'CONTROLE' d'une facture spécifique
  mode: 'LISTE' | 'CONTROLE' = 'LISTE';

  // Filtre de statut
  filtreStatut: string = ''; // '' = Toutes, 'A_TRAITER', 'EN_COURS_SR', 'VALIDEE_SR', 'REJETEE_SR'

  facturesAssignees: FactureAssigneeResume[] = [];
  factureEnControle: FactureAssigneeResume | null = null;
  groupeOuvertId: string | null = null;
  patients: PatientControleLigne[] = [];
  patientSelectionne: PatientControleLigne | null = null;
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
  telechargementEnCours = false;

  constructor(
    public auth: AuthService,
    private srService: SrGestionService,
    private dossiersGlobaux: DossiersGlobauxService,
    private structureService: StructureService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.chargerFacturesAssignees();
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
    this.loading = true;
    this.srService.getToutesFacturesResumes().subscribe({
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

        this.groupeOuvertId = null;
        this.loading = false;
      },
      error: () => {
        this.facturesAssignees = [];
        this.loading = false;
        this.snackBar.open('Impossible de charger les établissements et factures attribués.', 'Fermer', { duration: 5000 });
      }
    });
  }

  get facturesFiltrees(): FactureAssigneeResume[] {
    if (!this.filtreStatut) return this.facturesAssignees;
    return this.facturesAssignees.filter(f => f.statut === this.filtreStatut);
  }

  /** Factures assignées regroupées par district, puis par établissement. */
  get groupesAttribues(): GroupeControle[] {
    const groupes = new Map<string, { nom: string; etablissements: Map<string, EtablissementControle> }>();
    for (const facture of this.facturesFiltrees) {
      const estPharmacie = facture.typeEtablissement === 'PHARMACIE';
      const groupeId = estPharmacie
        ? 'pharmacies-assignees'
        : facture.districtId || `district:${facture.districtNom || 'sans-district'}`;
      const groupeNom = estPharmacie
        ? 'Pharmacies attribuées'
        : facture.districtNom || (facture.districtId ? 'District attribué' : 'Structures sans district');
      let groupe = groupes.get(groupeId);
      if (!groupe) {
        groupe = { nom: groupeNom, etablissements: new Map<string, EtablissementControle>() };
        groupes.set(groupeId, groupe);
      }

      const etablissementId = `${facture.typeEtablissement}:${facture.etablissementId}`;
      let etablissement = groupe.etablissements.get(etablissementId);
      if (!etablissement) {
        etablissement = {
          id: etablissementId,
          nom: facture.etablissementNom,
          code: facture.etablissementCode,
          type: this.libelleTypeEtablissement(facture),
          factures: []
        };
        groupe.etablissements.set(etablissementId, etablissement);
      }
      etablissement.factures.push(facture);
    }

    return Array.from(groupes, ([id, groupe]) => {
      const etablissements = Array.from(groupe.etablissements.values())
        .map(etablissement => ({
          ...etablissement,
          factures: [...etablissement.factures].sort((a, b) => b.annee - a.annee || b.mois - a.mois)
        }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      return {
        id,
        nom: groupe.nom,
        etablissements,
        nombreFactures: etablissements.reduce((total, e) => total + e.factures.length, 0)
      };
    }).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }

  private libelleTypeEtablissement(facture: FactureAssigneeResume): string {
    if (facture.typeEtablissement === 'PHARMACIE') return 'Pharmacie';
    switch ((facture.typeStructure || '').toUpperCase()) {
      case 'PS': return 'Poste de santé';
      case 'EPS': return 'Hôpital / EPS';
      case 'CS': return 'Centre de santé';
      default: return 'Structure sanitaire';
    }
  }

  basculerGroupe(groupeId: string): void {
    this.groupeOuvertId = this.groupeOuvertId === groupeId ? null : groupeId;
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

    // Règle Section 3 : Facture ouverte pour contrôle passe automatiquement à "En cours SR"
    if (fac.statut === 'A_TRAITER') {
      this.srService.changerStatutFacture(fac.id, 'EN_COURS_SR', {
        agentNom: this.controleurNomActuel
      });
      fac.statut = 'EN_COURS_SR';
    }

    this.chargerPatientsFacture(fac);
  }

  retourListe(): void {
    this.mode = 'LISTE';
    this.factureEnControle = null;
    this.patientSelectionne = null;
    this.chargerFacturesAssignees();
  }

  retourAuxPatients(): void {
    this.patientSelectionne = null;
    if (this.factureEnControle) this.chargerPatientsFacture(this.factureEnControle);
  }

  ouvrirPatient(patient: PatientControleLigne): void {
    this.patientSelectionne = patient;
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
          verifiee: estRejet || fac.statut === 'VALIDEE_SR'
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
  }

  get patientsFiltres(): PatientControleLigne[] {
    let list = this.patients;
    if (this.filtreEtatPatient === 'CONFORMES') {
      list = list.filter(p => p.statutLigne === 'CONFORME' && !p.prestations.some(pr => pr.statut === 'REJETEE'));
    } else if (this.filtreEtatPatient === 'REJETES') {
      list = list.filter(p => p.statutLigne === 'REJETEE' || p.prestations.some(pr => pr.statut === 'REJETEE'));
    }

    if (!this.searchPatient) return list;
    const q = this.searchPatient.toLowerCase().trim();
    return list.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q) ||
      p.cni.toLowerCase().includes(q)
    );
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
  }

  selectionnerMotifFrequent(motif: string): void {
    this.motifRejetInput = motif;
  }

  // === CONTRÔLE PAR LIGNE DE PRESTATION ===
  validerPrestation(p: PatientControleLigne, pr: any): void {
    pr.statut = 'ACCEPTEE';
    pr.motifRejet = undefined;
    pr.verifiee = true;

    if (this.factureEnControle) {
      this.srService.changerStatutFacture(this.factureEnControle.id, this.determinerStatutFactureApresControle(), {
        annulerRejetLigne: pr.id,
        agentNom: this.controleurNomActuel,
        typeEtablissement: this.factureEnControle.typeEtablissement
      });
      this.factureEnControle.statut = this.determinerStatutFactureApresControle();
    }

    if (!p.prestations.some(pre => pre.statut === 'REJETEE') && !p.motifRejet) {
      p.statutLigne = 'CONFORME';
    }

    this.snackBar.open(`Prestation « ${pr.designation} » validée conforme.`, 'OK', { duration: 2500 });
  }

  annulerRejetPrestation(p: PatientControleLigne, pr: any): void {
    pr.statut = 'ACCEPTEE';
    pr.motifRejet = undefined;
    pr.verifiee = true;

    if (this.factureEnControle) {
      this.srService.changerStatutFacture(this.factureEnControle.id, this.determinerStatutFactureApresControle(), {
        annulerRejetLigne: pr.id,
        agentNom: this.controleurNomActuel,
        typeEtablissement: this.factureEnControle.typeEtablissement
      });
      this.factureEnControle.statut = this.determinerStatutFactureApresControle();
    }

    if (!p.prestations.some(pre => pre.statut === 'REJETEE') && !p.motifRejet) {
      p.statutLigne = 'CONFORME';
    }

    this.snackBar.open(`Rejet annulé pour « ${pr.designation} ».`, 'OK', { duration: 2500 });
  }

  validerToutesPrestationsPatient(p: PatientControleLigne): void {
    p.prestations.forEach(pr => {
      pr.statut = 'ACCEPTEE';
      pr.motifRejet = undefined;
      pr.verifiee = true;
      if (this.factureEnControle) {
        this.srService.changerStatutFacture(this.factureEnControle.id, 'EN_COURS_SR', {
          annulerRejetLigne: pr.id,
          agentNom: this.controleurNomActuel,
          typeEtablissement: this.factureEnControle.typeEtablissement
        });
      }
    });
    p.statutLigne = 'CONFORME';
    p.motifRejet = undefined;

    if (this.factureEnControle) {
      const nouveauStatut = this.determinerStatutFactureApresControle();
      this.srService.changerStatutFacture(this.factureEnControle.id, nouveauStatut, {
        annulerRejetPatient: p.id,
        agentNom: this.controleurNomActuel,
        typeEtablissement: this.factureEnControle.typeEtablissement
      });
      this.factureEnControle.statut = nouveauStatut;
    }

    this.snackBar.open(`Toutes les prestations de ${p.prenom} ${p.nom} sont validées conformes.`, 'OK', { duration: 3000 });
  }

  patientEstRejete(p: PatientControleLigne): boolean {
    return p.statutLigne === 'REJETEE' || p.prestations.some(pr => pr.statut === 'REJETEE');
  }

  patientEstVerifieConforme(p: PatientControleLigne): boolean {
    return p.prestations.length > 0 && p.prestations.every(pr => pr.statut === 'ACCEPTEE' && pr.verifiee);
  }

  determinerStatutFactureApresControle(): StatutTraitementSR {
    const aDesRejets = this.patients.some(p => p.statutLigne === 'REJETEE' || p.prestations.some(pr => pr.statut === 'REJETEE'));
    if (aDesRejets) return 'REJETEE_SR';
    const toutesVerifiees = this.patients.every(p => p.prestations.every(pr => pr.statut === 'ACCEPTEE' && pr.verifiee));
    if (toutesVerifiees) return 'VALIDEE_SR';
    return 'EN_COURS_SR';
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

    const facId = this.factureEnControle!.id;
    const motif = this.motifRejetInput.trim();
    const typeEtab = this.factureEnControle!.typeEtablissement;

    if (this.typeRejetActuel === 'FACTURE') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif,
        agentNom: this.controleurNomActuel,
        typeEtablissement: typeEtab
      });
      this.factureEnControle!.statut = 'REJETEE_SR';
      this.factureEnControle!.commentaireRejet = motif;
    } else if (this.typeRejetActuel === 'PATIENT') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: `Rejet patient : ${motif}`,
        rejetPatient: { patientKey: this.cibleRejetId, motif },
        agentNom: this.controleurNomActuel,
        typeEtablissement: typeEtab
      });
      this.factureEnControle!.statut = 'REJETEE_SR';
      const pat = this.patients.find(p => p.id === this.cibleRejetId);
      if (pat) {
        pat.statutLigne = 'REJETEE';
        pat.motifRejet = motif;
        pat.prestations.forEach(pr => {
          pr.statut = 'REJETEE';
          pr.motifRejet = motif;
          pr.verifiee = true;
        });
      }
    } else if (this.typeRejetActuel === 'PRESTATION') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: `Rejet prestation : ${motif}`,
        rejetLigne: { ligneKey: this.cibleRejetId, motif },
        agentNom: this.controleurNomActuel,
        typeEtablissement: typeEtab
      });
      this.factureEnControle!.statut = 'REJETEE_SR';
      this.patients.forEach(pat => {
        pat.prestations.forEach((pr: any) => {
          if (pr.id === this.cibleRejetId) {
            pr.statut = 'REJETEE';
            pr.motifRejet = motif;
            pr.verifiee = true;
            pat.statutLigne = 'REJETEE';
          }
        });
      });
    }

    this.afficherModalRejet = false;
    this.snackBar.open('Rejet motivé enregistré. La structure peut le consulter pour correction.', 'OK', { duration: 4000 });
  }

  validerFacture(): void {
    if (!this.factureEnControle) return;
    this.srService.changerStatutFacture(this.factureEnControle.id, 'VALIDEE_SR', {
      agentNom: this.controleurNomActuel
    });
    this.factureEnControle.statut = 'VALIDEE_SR';
    this.snackBar.open('Facture validée conforme par le Service Régional !', 'OK', { duration: 4000 });
  }

  envoyerAuNiveauCentral(): void {
    if (!this.factureEnControle) return;

    // Règle Section 3 : Une facture Envoyée au NC disparaît de l'espace du contrôleur
    this.srService.changerStatutFacture(this.factureEnControle.id, 'ENVOYEE_NC', {
      agentNom: this.controleurNomActuel
    });
    this.snackBar.open('Facture transmise au Niveau Central (NC). Elle est archivée de votre espace de contrôle.', 'OK', { duration: 5000 });
    this.retourListe();
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
    return this.facturesAssignees.filter(f => f.statut === statut).length;
  }

  ouvrirFacture(f: FactureAssigneeResume): void {
    this.ouvrirControle(f);
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
    if (!code) return '';
    switch (code) {
      case 'ENFANTS_MOINS_5_ANS': return 'Gratuité < 5 ans';
      case 'PLAN_SESAME': return 'Plan Sésame (60+)';
      case 'CONTRIBUTIF': return 'Contributif (Mutuelles/BSF)';
      case 'CESARIENNE': return 'Maternité / Césarienne';
      case 'DIALYSE': return 'Dialyse';
      default: return code;
    }
  }

  getRegimeBadgeClass(code?: string): string {
    if (!code) return 'bg-slate-100 text-slate-800';
    switch (code) {
      case 'ENFANTS_MOINS_5_ANS': return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'PLAN_SESAME': return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'CONTRIBUTIF': return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'CESARIENNE': return 'bg-purple-100 text-purple-800 border border-purple-200';
      case 'DIALYSE': return 'bg-rose-100 text-rose-800 border border-rose-200';
      default: return 'bg-slate-100 text-slate-800 border border-slate-200';
    }
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
