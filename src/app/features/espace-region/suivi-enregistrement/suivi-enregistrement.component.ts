import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { interval } from 'rxjs';

import {
  SrGestionService,
  DistrictEnregistrementRow,
  StructureEnregistrementRow,
  PharmacieEnregistrementRow,
  PostePolariseRow,
  FactureAssigneeResume
} from '../services/sr-gestion.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';

export interface PrestationLigne {
  id: string;
  dossierId: string;
  designation: string;
  codeActe: string;
  datePriseEnCharge?: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  montantSencsu: number;
  montantBeneficiaire: number;
  statutLigne?: string;
}

export interface PatientLigne {
  id: string;
  nom: string;
  prenom: string;
  matricule: string;
  cni: string;
  sexe: string;
  dateNaissance: string;
  datePriseEnCharge?: string;
  statutDossier: string;
  montantTotal: number;
  statutLigne: string;
  prestations: PrestationLigne[];
  pieces?: string[];
}

@Component({
  selector: 'app-suivi-enregistrement',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTabsModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './suivi-enregistrement.component.html'
})
export class SuiviEnregistrementComponent implements OnInit {
  annee = new Date().getFullYear();
  moisSuivi = new Date().getMonth() + 1;
  readonly anneesDisponibles = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - index);
  readonly moisDisponibles = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];
  derniereMiseAJour = new Date();
  actualisationEnCours = false;
  erreurChargement = false;
  filtreStatutSuivi = '';
  activeTab = 0; // 0 = Districts, 1 = Hôpitaux, 2 = Pharmacies

  districts: DistrictEnregistrementRow[] = [];
  structures: StructureEnregistrementRow[] = [];
  pharmacies: PharmacieEnregistrementRow[] = [];
  loading = false;

  // Filtres Structures
  searchStructure = '';

  // Filtres Pharmacies
  searchPharmacie = '';

  // Mode de navigation interne :
  // 'LISTE' = tableau général des prestataires
  // 'POSTES' = liste des postes polarisés du district sanitaire sélectionné
  // 'FACTURES' = liste des factures d'un prestataire / poste sélectionné
  // 'PATIENTS' = liste des bénéficiaires/patients de la facture (Nom, Matricule & CNI, Date)
  // 'PRESTATIONS' = page dédiée au patient sélectionné (Dossier dessus, Prestations en dessous)
  vueMode: 'LISTE' | 'POSTES' | 'FACTURES' | 'PATIENTS' | 'PRESTATIONS' = 'LISTE';

  // District sélectionné et ses postes polarisés
  districtSelectionne: DistrictEnregistrementRow | null = null;
  postesDuDistrict: PostePolariseRow[] = [];
  posteSelectionne: PostePolariseRow | null = null;
  searchPoste = '';
  inclurePostesSansSaisie = false;

  // Filtre par régime pour la consultation des factures d'un poste / prestataire
  filtreRegime = ''; // '' = Tous les régimes

  regimesDisponibles = [
    { code: '', label: 'Tous les régimes' },
    { code: 'ENFANTS_MOINS_5_ANS', label: 'Gratuité Enfants < 5 ans', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
    { code: 'PLAN_SESAME', label: 'Plan Sésame (60+)', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
    { code: 'CONTRIBUTIF', label: 'Contributif (Mutuelles/BSF)', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { code: 'CESARIENNE', label: 'Césarienne / Maternité', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
    { code: 'DIALYSE', label: 'Dialyse', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' }
  ];

  // Prestataire sélectionné
  prestataireSelectionne: (StructureEnregistrementRow | PharmacieEnregistrementRow | PostePolariseRow) | null = null;
  facturesDuPrestataire: FactureAssigneeResume[] = [];
  searchFacture = '';

  // Facture sélectionnée pour affichage des bénéficiaires
  factureSelectionnee: FactureAssigneeResume | null = null;
  patientsDeLaFacture: PatientLigne[] = [];
  searchPatient = '';

  // Patient sélectionné pour la page de ses prestations
  patientSelectionne: PatientLigne | null = null;

  // ===================== MODAL : VISUALISATION DU DOSSIER (3 PIÈCES) =====================
  afficherModalDossier = false;
  ongletDossierActif: 'TOUT' | 'CARTE' | 'TICKET' | 'FEUILLE' = 'TOUT';

  // ===================== MODAL : MODIFIER PRESTATION =====================
  afficherModalModifPrestation = false;
  prestationAModifier: PrestationLigne | null = null;
  patientDePrestation: PatientLigne | null = null;
  formModifPrestation = {
    designation: '',
    codeActe: '',
    quantite: 1,
    prixUnitaire: 0
  };

  // ===================== MODAL : SUPPRIMER PRESTATION =====================
  afficherModalSupprPrestation = false;
  prestationASupprimer: PrestationLigne | null = null;
  patientDePrestationASupprimer: PatientLigne | null = null;

  // ===================== MODAL : SUPPRIMER FACTURE =====================
  afficherModalSupprFacture = false;
  factureASupprimer: FactureAssigneeResume | null = null;

  private destroyRef = inject(DestroyRef);

  constructor(
    private srService: SrGestionService,
    private factureEvents: FactureEventsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.chargerDonnees();

    // Réactivité en temps réel : si une facture ou prestation est modifiée n'importe où, recharger
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.actualiserVues(false));

    // Les événements locaux sont immédiats. Ce contrôle détecte aussi les saisies
    // et envois réalisés depuis les postes/hôpitaux dans une autre session.
    interval(15_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.actualisationEnCours && document.visibilityState === 'visible') this.actualiserVues(false);
      });
  }

  actualiserMaintenant(): void {
    this.actualiserVues(false);
  }

  chargerDonnees(showLoader = true): void {
    if (showLoader) this.loading = true;
    this.actualisationEnCours = true;
    this.srService.getSuiviEnregistrement(this.annee, this.moisSuivi).subscribe({
      next: (res) => {
        this.districts = res.districts;
        this.structures = res.structures;
        this.pharmacies = res.pharmacies;
        this.derniereMiseAJour = new Date();
        this.erreurChargement = false;
        this.actualisationEnCours = false;
        this.loading = false;
      },
      error: () => {
        this.erreurChargement = true;
        this.actualisationEnCours = false;
        this.loading = false;
      }
    });
  }

  changerPeriode(): void {
    this.chargerDonnees();
    if (this.districtSelectionne) {
      this.chargerPostesDuDistrict(this.districtSelectionne.id);
    }
    if (this.prestataireSelectionne) {
      this.rafraichirFacturesPrestataire(this.prestataireSelectionne.id);
    }
  }

  private actualiserVues(showLoader: boolean): void {
    this.chargerDonnees(showLoader);
    if (this.vueMode === 'POSTES' && this.districtSelectionne) {
      this.chargerPostesDuDistrict(this.districtSelectionne.id);
    }
    if (this.vueMode === 'FACTURES' && this.prestataireSelectionne) {
      this.rafraichirFacturesPrestataire(this.prestataireSelectionne.id);
    }
  }

  // ===================== NAVIGATION PRESTATAIRE, DISTRICTS & POSTES =====================

  ouvrirFacturesPrestataire(p: StructureEnregistrementRow | PharmacieEnregistrementRow): void {
    // Hôpital ou pharmacie : accès direct aux factures. Les districts ont leur propre ligne.
    this.prestataireSelectionne = p;
    this.districtSelectionne = null;
    this.posteSelectionne = null;
    this.vueMode = 'FACTURES';
    this.factureSelectionnee = null;
    this.searchFacture = '';
    this.filtreRegime = '';
    this.rafraichirFacturesPrestataire(p.id);
  }

  chargerPostesDuDistrict(districtId: string): void {
    this.srService.getPostesPolarises(districtId, this.annee, this.moisSuivi).subscribe(list => {
      this.postesDuDistrict = list;
    });
  }

  ouvrirFacturesPoste(poste: PostePolariseRow): void {
    this.posteSelectionne = poste;
    this.prestataireSelectionne = poste;
    this.vueMode = 'FACTURES';
    this.factureSelectionnee = null;
    this.searchFacture = '';
    this.filtreRegime = '';
    this.rafraichirFacturesPrestataire(poste.id);
  }

  fermerVuePostes(): void {
    this.vueMode = 'LISTE';
    this.districtSelectionne = null;
    this.postesDuDistrict = [];
    this.chargerDonnees(false);
  }

  retourAuxPostes(): void {
    this.vueMode = 'POSTES';
    this.posteSelectionne = null;
    this.prestataireSelectionne = null;
    this.factureSelectionnee = null;
    if (this.districtSelectionne) {
      this.chargerPostesDuDistrict(this.districtSelectionne.id);
    }
  }

  fermerVueFactures(): void {
    if (this.districtSelectionne) {
      this.retourAuxPostes();
    } else {
      this.vueMode = 'LISTE';
      this.prestataireSelectionne = null;
      this.factureSelectionnee = null;
      this.chargerDonnees(false);
    }
  }

  filtrerParRegime(regimeCode: string): void {
    this.filtreRegime = regimeCode;
  }

  countFacturesRegime(regimeCode: string): number {
    if (!regimeCode) return this.facturesDuPrestataire.length;
    return this.facturesDuPrestataire.filter(f => f.regime === regimeCode).length;
  }

  private rafraichirFacturesPrestataire(prestataireId: string): void {
    this.srService.getFacturesParPrestataire(prestataireId, this.annee).subscribe(list => {
      this.facturesDuPrestataire = list;
    });
  }

  get facturesFiltrees(): FactureAssigneeResume[] {
    return this.facturesDuPrestataire.filter(f => {
      if (this.filtreRegime && f.regime !== this.filtreRegime) {
        return false;
      }
      if (this.searchFacture) {
        const q = this.searchFacture.toLowerCase().trim();
        const match = f.numero.toLowerCase().includes(q) ||
          f.regime.toLowerCase().includes(q) ||
          (f.controleurNom && f.controleurNom.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }

  get postesFiltres(): PostePolariseRow[] {
    const afficherSansSaisie = this.inclurePostesSansSaisie || this.filtreStatutSuivi === 'A_SAISIR';
    const postes = this.postesDuDistrict.filter(p =>
      (afficherSansSaisie || p.nombreFactures > 0) &&
      (!this.filtreStatutSuivi || p.statutSuiviPeriode === this.filtreStatutSuivi)
    );
    if (!this.searchPoste) return postes;
    const q = this.searchPoste.toLowerCase().trim();
    return postes.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q)
    );
  }

  get hopitauxDuDistrict(): PostePolariseRow[] {
    return this.postesDuDistrict.filter(p => p.type === 'EPS');
  }

  get postesPolarisesDuDistrict(): PostePolariseRow[] {
    return this.postesDuDistrict.filter(p => p.type === 'PS');
  }

  get hopitauxFiltres(): PostePolariseRow[] {
    return this.hopitauxDuDistrict.filter(p => {
      if (this.filtreStatutSuivi && p.statutSuiviPeriode !== this.filtreStatutSuivi) return false;
      if (!this.searchPoste) return true;
      const q = this.searchPoste.toLowerCase().trim();
      return p.nom.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
    });
  }

  get postesPolarisesFiltres(): PostePolariseRow[] {
    return this.postesFiltres.filter(p => p.type === 'PS');
  }

  get totalPostesAvecFacture(): number {
    return this.postesPolarisesDuDistrict.filter(p => p.factureEnvoyeePeriode).length;
  }

  get totalPostesAvecSaisie(): number {
    return this.postesPolarisesDuDistrict.filter(p => p.nombreFactures > 0).length;
  }

  get totalHopitauxAvecSaisie(): number {
    return this.hopitauxDuDistrict.filter(p => p.nombreFactures > 0).length;
  }

  ouvrirDistrict(district: DistrictEnregistrementRow): void {
    this.districtSelectionne = district;
    this.posteSelectionne = null;
    this.prestataireSelectionne = null;
    this.searchPoste = '';
    this.filtreStatutSuivi = '';
    this.inclurePostesSansSaisie = false;
    this.vueMode = 'POSTES';
    this.chargerPostesDuDistrict(district.id);
  }

  compterStatut(lignes: Array<{ statutSuiviPeriode: string; actif?: boolean }>, statut: string): number {
    return lignes.filter(ligne => ligne.actif !== false && ligne.statutSuiviPeriode === statut).length;
  }

  getRegimeLabel(code: string): string {
    switch (code) {
      case 'ENFANTS_MOINS_5_ANS': return 'Gratuité < 5 ans';
      case 'PLAN_SESAME': return 'Plan Sésame (60+)';
      case 'CONTRIBUTIF': return 'Classique / Contributif';
      case 'CESARIENNE': return 'Maternité / Césarienne';
      case 'DIALYSE': return 'Dialyse';
      default: return code;
    }
  }

  getRegimeBadgeClass(code: string): string {
    switch (code) {
      case 'ENFANTS_MOINS_5_ANS': return 'bg-blue-100 text-blue-800 border border-blue-300';
      case 'PLAN_SESAME': return 'bg-amber-100 text-amber-800 border border-amber-300';
      case 'CONTRIBUTIF': return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
      case 'CESARIENNE': return 'bg-purple-100 text-purple-800 border border-purple-300';
      case 'DIALYSE': return 'bg-rose-100 text-rose-800 border border-rose-300';
      default: return 'bg-slate-100 text-slate-800 border border-slate-300';
    }
  }

  // ===================== DÉTAIL FACTURE & BÉNÉFICIAIRES =====================

  ouvrirDetailFacture(f: FactureAssigneeResume): void {
    this.factureSelectionnee = f;
    this.vueMode = 'PATIENTS';
    this.patientSelectionne = null;
    this.searchPatient = '';
    this.patientsDeLaFacture = this.srService.getPatientsPourFacture(f);
  }

  fermerDetailFacture(): void {
    this.vueMode = 'FACTURES';
    this.factureSelectionnee = null;
    this.patientSelectionne = null;
    if (this.prestataireSelectionne) {
      this.rafraichirFacturesPrestataire(this.prestataireSelectionne.id);
    }
  }

  // ===================== NAVIGATION PATIENT & PRESTATIONS =====================

  ouvrirPrestationsPatient(patient: PatientLigne): void {
    this.patientSelectionne = patient;
    this.vueMode = 'PRESTATIONS';
  }

  retourAuxPatients(): void {
    this.vueMode = 'PATIENTS';
    this.patientSelectionne = null;
    if (this.factureSelectionnee) {
      this.patientsDeLaFacture = this.srService.getPatientsPourFacture(this.factureSelectionnee);
    }
  }

  // ===================== MODAL DU DOSSIER (3 PIÈCES) =====================

  ouvrirModalDossier(onglet: 'TOUT' | 'CARTE' | 'TICKET' | 'FEUILLE' = 'TOUT'): void {
    this.ongletDossierActif = onglet;
    this.afficherModalDossier = true;
  }

  fermerModalDossier(): void {
    this.afficherModalDossier = false;
  }

  get patientsFiltres(): PatientLigne[] {
    if (!this.searchPatient) return this.patientsDeLaFacture;
    const q = this.searchPatient.toLowerCase().trim();
    return this.patientsDeLaFacture.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q) ||
      p.cni.toLowerCase().includes(q) ||
      (p.datePriseEnCharge && p.datePriseEnCharge.includes(q)) ||
      p.prestations.some(pr => pr.designation.toLowerCase().includes(q) || pr.codeActe.toLowerCase().includes(q))
    );
  }

  // ===================== MODIFIER UNE PRESTATION =====================

  ouvrirModalModifierPrestation(patient: PatientLigne, pr: PrestationLigne): void {
    this.patientDePrestation = patient;
    this.prestationAModifier = pr;
    this.formModifPrestation = {
      designation: pr.designation,
      codeActe: pr.codeActe,
      quantite: pr.quantite || 1,
      prixUnitaire: pr.prixUnitaire || 0
    };
    this.afficherModalModifPrestation = true;
  }

  sauvegarderPrestation(): void {
    if (!this.factureSelectionnee || !this.patientDePrestation || !this.prestationAModifier) return;
    if (!this.formModifPrestation.designation.trim()) {
      this.snackBar.open('La désignation de la prestation est obligatoire', 'OK', { duration: 3000 });
      return;
    }
    if (this.formModifPrestation.quantite <= 0 || this.formModifPrestation.prixUnitaire < 0) {
      this.snackBar.open('La quantité et le prix unitaire doivent être valides', 'OK', { duration: 3000 });
      return;
    }

    this.srService.modifierPrestation(
      this.factureSelectionnee.id,
      this.patientDePrestation.id,
      this.prestationAModifier.id,
      this.formModifPrestation
    );

    // Mettre à jour l'affichage en temps réel
    this.patientsDeLaFacture = this.srService.getPatientsPourFacture(this.factureSelectionnee);

    // Mettre à jour le patient sélectionné s'il est affiché sur la page des prestations
    if (this.patientSelectionne) {
      const updated = this.patientsDeLaFacture.find(p => p.id === this.patientSelectionne!.id);
      if (updated) {
        this.patientSelectionne = updated;
      }
    }

    // Mettre à jour le montant affiché de la facture
    const totalNouveau = this.patientsDeLaFacture.reduce((sum, p) => sum + p.montantTotal, 0);
    this.factureSelectionnee.montantTotal = totalNouveau;
    this.factureSelectionnee.montantSencsu = Math.round(totalNouveau * 0.8);

    this.afficherModalModifPrestation = false;
    this.snackBar.open('Prestation modifiée avec succès. Montants et consolidations recalculés en temps réel !', 'OK', { duration: 4000 });
  }

  // ===================== SUPPRIMER UNE PRESTATION =====================

  ouvrirModalSupprimerPrestation(patient: PatientLigne, pr: PrestationLigne): void {
    this.patientDePrestationASupprimer = patient;
    this.prestationASupprimer = pr;
    this.afficherModalSupprPrestation = true;
  }

  confirmerSuppressionPrestation(): void {
    if (!this.factureSelectionnee || !this.patientDePrestationASupprimer || !this.prestationASupprimer) return;

    this.srService.supprimerPrestation(
      this.factureSelectionnee.id,
      this.patientDePrestationASupprimer.id,
      this.prestationASupprimer.id
    );

    // Recharger la liste en temps réel
    this.patientsDeLaFacture = this.srService.getPatientsPourFacture(this.factureSelectionnee);

    // Mettre à jour le patient sélectionné s'il est affiché
    if (this.patientSelectionne) {
      const updated = this.patientsDeLaFacture.find(p => p.id === this.patientSelectionne!.id);
      if (updated) {
        this.patientSelectionne = updated;
      }
    }

    // Mettre à jour le total de la facture
    const totalNouveau = this.patientsDeLaFacture.reduce((sum, p) => sum + p.montantTotal, 0);
    this.factureSelectionnee.montantTotal = totalNouveau;
    this.factureSelectionnee.montantSencsu = Math.round(totalNouveau * 0.8);
    this.factureSelectionnee.nombreBeneficiaires = this.patientsDeLaFacture.filter(p => p.prestations.length > 0).length;

    this.afficherModalSupprPrestation = false;
    this.snackBar.open('Prestation supprimée. Facture et décompte bénéficiaires recalculés en temps réel !', 'OK', { duration: 4000 });
  }

  // ===================== SUPPRIMER UNE FACTURE =====================

  ouvrirModalSupprimerFacture(fac: FactureAssigneeResume, event?: Event): void {
    if (event) event.stopPropagation();
    this.factureASupprimer = fac;
    this.afficherModalSupprFacture = true;
  }

  confirmerSuppressionFacture(): void {
    if (!this.factureASupprimer) return;

    const facId = this.factureASupprimer.id;
    const facNum = this.factureASupprimer.numero;

    this.srService.supprimerFacture(facId);

    // Si on était dans le détail de cette facture ou ses prestations, revenir à la liste des factures
    if (this.factureSelectionnee?.id === facId) {
      this.vueMode = 'FACTURES';
      this.factureSelectionnee = null;
      this.patientSelectionne = null;
    }

    // Rafraîchir les factures du prestataire
    if (this.prestataireSelectionne) {
      this.rafraichirFacturesPrestataire(this.prestataireSelectionne.id);
    }

    this.afficherModalSupprFacture = false;
    this.snackBar.open(`Facture ${facNum} supprimée définitivement. Données mises à jour en temps réel !`, 'OK', { duration: 4000 });
  }

  formatDate(d?: string): string {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return d;
  }

  getInitiales(prenom?: string, nom?: string): string {
    const p = prenom ? prenom.charAt(0).toUpperCase() : '';
    const n = nom ? nom.charAt(0).toUpperCase() : '';
    return `${p}${n}` || 'SN';
  }

  // ===================== FILTRES & GETTERS DE SYNTHÈSE =====================

  get structuresFiltrees(): StructureEnregistrementRow[] {
    return this.hopitauxActifs.filter(s => {
      if (this.filtreStatutSuivi && s.statutSuiviPeriode !== this.filtreStatutSuivi) return false;
      if (this.searchStructure) {
        const q = this.searchStructure.toLowerCase();
        const match = s.nom.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) || s.districtNom.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }

  get hopitauxActifs(): StructureEnregistrementRow[] {
    return this.structures.filter(s => s.actif && s.type === 'EPS');
  }

  get districtsFiltres(): DistrictEnregistrementRow[] {
    return this.districts.filter(d => {
      if (this.filtreStatutSuivi && d.statutSuiviPeriode !== this.filtreStatutSuivi) return false;
      if (this.searchStructure) {
        const q = this.searchStructure.toLowerCase();
        if (!d.nom.toLowerCase().includes(q) && !d.code.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  get pharmaciesFiltrees(): PharmacieEnregistrementRow[] {
    return this.pharmacies.filter(p => {
      if (!p.actif) return false;
      if (this.filtreStatutSuivi && p.statutSuiviPeriode !== this.filtreStatutSuivi) return false;
      if (this.searchPharmacie) {
        const q = this.searchPharmacie.toLowerCase();
        const match = p.nom.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.ville.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }

  get totalStructuresAControler(): number {
    return this.hopitauxActifs.filter(s => !s.factureEnvoyeePeriode).length;
  }

  get totalPharmaciesAControler(): number {
    return this.pharmacies.filter(p => p.actif && !p.factureEnvoyeePeriode).length;
  }

  get totalStructuresActives(): number {
    return this.hopitauxActifs.length;
  }

  get totalDistricts(): number {
    return this.districts.length;
  }

  get totalPharmaciesActives(): number {
    return this.pharmacies.filter(p => p.actif).length;
  }

  get totalPostesAControler(): number {
    return this.postesPolarisesDuDistrict.filter(p => !p.factureEnvoyeePeriode).length;
  }

  getLibelleSuivi(statut: string): string {
    switch (statut) {
      case 'EN_COURS': return 'Saisie en cours';
      case 'A_CORRIGER': return 'À corriger';
      case 'ENVOYEE': return 'Facture envoyée';
      default: return 'À commencer';
    }
  }

  getIconeSuivi(statut: string): string {
    switch (statut) {
      case 'EN_COURS': return 'edit_note';
      case 'A_CORRIGER': return 'restart_alt';
      case 'ENVOYEE': return 'task_alt';
      default: return 'schedule';
    }
  }

  getClasseSuivi(statut: string): string {
    switch (statut) {
      case 'EN_COURS': return 'border-blue-200 bg-blue-50 text-blue-800';
      case 'A_CORRIGER': return 'border-rose-200 bg-rose-50 text-rose-800';
      case 'ENVOYEE': return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      default: return 'border-amber-200 bg-amber-50 text-amber-800';
    }
  }

  getMoisLibelle(m: number): string {
    const mois = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return mois[m] || `Mois ${m}`;
  }

  getStatutLibelle(statut: string): string {
    switch (statut) {
      case 'BROUILLON': return 'Brouillon';
      case 'SOUMISE_CS': return 'Envoyée au district';
      case 'REJETEE_CS': return 'Rejetée par le district';
      case 'A_TRAITER': return 'À traiter';
      case 'EN_COURS_SR': return 'En cours SR';
      case 'VALIDEE_SR': return 'Validée SR';
      case 'REJETEE_SR': return 'Rejetée SR';
      case 'ENVOYEE_NC': return 'Envoyée au NC';
      case 'VALIDEE_NC': return 'Validée NC';
      case 'REJETEE_NC': return 'Rejetée NC';
      case 'PAYEE': return 'Payée';
      default: return statut;
    }
  }

  getStatutBadgeClass(statut: string): string {
    switch (statut) {
      case 'BROUILLON': return 'bg-slate-100 text-slate-700 border border-slate-300';
      case 'SOUMISE_CS': return 'bg-blue-100 text-blue-800 border border-blue-300';
      case 'A_TRAITER': return 'bg-amber-100 text-amber-800 border border-amber-300';
      case 'EN_COURS_SR': return 'bg-blue-100 text-blue-800 border border-blue-300';
      case 'VALIDEE_SR': return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
      case 'REJETEE_SR': return 'bg-rose-100 text-rose-800 border border-rose-300';
      case 'REJETEE_CS':
      case 'REJETEE_NC': return 'bg-rose-100 text-rose-800 border border-rose-300';
      case 'ENVOYEE_NC': return 'bg-blue-200 text-blue-900 border border-blue-400';
      case 'PAYEE': return 'bg-purple-100 text-purple-800 border border-purple-300';
      default: return 'bg-slate-100 text-slate-700 border border-slate-300';
    }
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
