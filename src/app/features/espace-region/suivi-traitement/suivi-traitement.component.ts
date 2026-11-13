import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { combineLatest, from } from 'rxjs';
import { concatMap, take, toArray } from 'rxjs/operators';
import { SrGestionService, ControleurSR, FactureAssigneeResume } from '../services/sr-gestion.service';
import { PatientLigne, PrestationLigne } from '../suivi-enregistrement/suivi-enregistrement.component';
import { StructureService } from '../../../core/services/structure.service';
import { FactureService } from '../../../core/services/facture.service';

export interface ControleurSuiviRow {
  controleur: ControleurSR;
  factures: FactureAssigneeResume[];
  totalAssignees: number;
  aTraiter: number;
  enCours: number;
  validees: number;
  rejetees: number;
  envoyeesNc: number;
}

@Component({
  selector: 'app-suivi-traitement',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './suivi-traitement.component.html'
})
export class SuiviTraitementComponent implements OnInit {
  controleursRows: ControleurSuiviRow[] = [];
  controleurSelectionne: ControleurSuiviRow | null = null;
  filtreStatut: string = ''; // '' = Tous, 'A_TRAITER', 'EN_COURS_SR', 'VALIDEE_SR', 'REJETEE_SR'

  // Navigation dans la facture
  vueMode: 'LISTE' | 'PATIENTS' | 'PRESTATIONS' = 'LISTE';
  factureSelectionnee: FactureAssigneeResume | null = null;
  patientsDeLaFacture: PatientLigne[] = [];
  patientSelectionne: PatientLigne | null = null;
  searchPatient = '';

  // Modal Dossier Patient (3 pièces justificatives)
  afficherModalDossier = false;
  ongletDossierActif: 'TOUT' | 'CARTE' | 'TICKET' | 'FEUILLE' = 'TOUT';

  // Modal Réassignation
  afficherModalReassigner = false;
  factureAReassigner: FactureAssigneeResume | null = null;
  nouveauControleurId = '';

  loading = false;
  readonly Math = Math;

  constructor(
    public srService: SrGestionService,
    private structureService: StructureService,
    private factureService: FactureService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.chargerDonnees();
  }

  chargerDonnees(): void {
    this.loading = true;
    combineLatest([
      this.srService.getToutesFacturesResumes(),
      this.srService.controleursObservable
    ]).subscribe(([all, controleurs]) => {

      this.controleursRows = controleurs.map(c => {
        const fSiennes = all.filter(f => f.controleurId === c.id);
        return {
          controleur: c,
          factures: fSiennes,
          totalAssignees: fSiennes.length,
          aTraiter: fSiennes.filter(f => f.statut === 'A_TRAITER').length,
          enCours: fSiennes.filter(f => f.statut === 'EN_COURS_SR').length,
          validees: fSiennes.filter(f => f.statut === 'VALIDEE_SR').length,
          rejetees: fSiennes.filter(f => f.statut === 'REJETEE_SR').length,
          envoyeesNc: fSiennes.filter(f => f.statut === 'ENVOYEE_NC').length
        };
      });

      if (this.controleurSelectionne) {
        this.controleurSelectionne = this.controleursRows.find(r => r.controleur.id === this.controleurSelectionne!.controleur.id) || null;
      } else if (this.controleursRows.length > 0) {
        this.controleurSelectionne = this.controleursRows[0];
      }

      // Si une facture était ouverte, rafraîchir son état
      if (this.factureSelectionnee) {
        const maj = all.find(f => f.id === this.factureSelectionnee!.id);
        if (maj) {
          this.factureSelectionnee = maj;
          this.patientsDeLaFacture = this.srService.getPatientsPourFacture(maj);
        }
      }

      this.loading = false;
    });
  }

  selectionnerControleur(r: ControleurSuiviRow): void {
    this.controleurSelectionne = r;
    this.filtreStatut = '';
    this.vueMode = 'LISTE';
    this.factureSelectionnee = null;
    this.patientSelectionne = null;
  }

  get facturesControleurFiltrees(): FactureAssigneeResume[] {
    if (!this.controleurSelectionne) return [];
    if (!this.filtreStatut) return this.controleurSelectionne.factures;
    return this.controleurSelectionne.factures.filter(f => f.statut === this.filtreStatut);
  }

  // ===================== NAVIGATION FACTURE : PATIENTS & PRESTATIONS =====================

  ouvrirDetailFacture(f: FactureAssigneeResume): void {
    this.factureSelectionnee = f;
    this.searchPatient = '';
    this.patientSelectionne = null;
    this.patientsDeLaFacture = this.srService.getPatientsPourFacture(f);
    this.vueMode = 'PATIENTS';
  }

  fermerDetailFacture(): void {
    this.vueMode = 'LISTE';
    this.factureSelectionnee = null;
    this.patientSelectionne = null;
  }

  ouvrirPrestationsPatient(p: PatientLigne): void {
    this.patientSelectionne = p;
    this.vueMode = 'PRESTATIONS';
  }

  retourAuxPatients(): void {
    this.vueMode = 'PATIENTS';
    this.patientSelectionne = null;
    if (this.factureSelectionnee) {
      this.patientsDeLaFacture = this.srService.getPatientsPourFacture(this.factureSelectionnee);
    }
  }

  get patientsFiltres(): PatientLigne[] {
    if (!this.searchPatient) return this.patientsDeLaFacture;
    const q = this.searchPatient.toLowerCase().trim();
    return this.patientsDeLaFacture.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q) ||
      (p.cni && p.cni.toLowerCase().includes(q)) ||
      (p.datePriseEnCharge && p.datePriseEnCharge.includes(q)) ||
      p.prestations.some(pr => pr.designation.toLowerCase().includes(q) || pr.codeActe.toLowerCase().includes(q))
    );
  }

  // ===================== MODAL DOSSIER (3 PIÈCES) =====================

  ouvrirModalDossier(onglet: 'TOUT' | 'CARTE' | 'TICKET' | 'FEUILLE' = 'TOUT'): void {
    this.ongletDossierActif = onglet;
    this.afficherModalDossier = true;
  }

  fermerModalDossier(): void {
    this.afficherModalDossier = false;
  }

  // ===================== RÉASSIGNATION =====================

  ouvrirModalReassignation(f: FactureAssigneeResume, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.factureAReassigner = f;
    this.nouveauControleurId = f.controleurId || '';
    this.afficherModalReassigner = true;
  }

  confirmerReassignation(): void {
    if (!this.factureAReassigner || !this.nouveauControleurId) return;
    this.srService.reassignerFacture(this.factureAReassigner.id, this.nouveauControleurId);
    this.snackBar.open('Facture réassignée avec succès au nouveau contrôleur !', 'OK', { duration: 3000 });
    this.afficherModalReassigner = false;
    this.chargerDonnees();
  }

  repartirEquitablement(): void {
    this.srService.getToutesFacturesResumes().pipe(take(1)).subscribe(all => {
      const aAssigner = all.filter(f =>
        (f.statut === 'ENVOYEE' || f.statut === 'A_TRAITER') && !f.controleurId
      );
      if (aAssigner.length === 0) {
        this.snackBar.open('Aucune facture en attente sans contrôleur.', 'OK', { duration: 3500 });
        return;
      }

      from(aAssigner).pipe(
        // Les appels séquentiels laissent chaque attribution être enregistrée avant
        // de calculer la charge du contrôleur pour la facture suivante.
        concatMap(f => f.typeEtablissement === 'STRUCTURE'
          ? this.structureService.assignerFactureAutomatiquement(f.id)
          : this.factureService.assignerAutomatiquement(f.id)),
        toArray()
      ).subscribe({
        next: resultats => {
          const assignees = resultats.filter(f => !!f.controleurId).length;
          this.snackBar.open(
            assignees === aAssigner.length
              ? `${assignees} facture(s) attribuée(s) aux contrôleurs.`
              : `${assignees} facture(s) attribuée(s). Vérifiez qu'un contrôleur actif est disponible pour les autres.`,
            'OK',
            { duration: 5000 }
          );
          this.chargerDonnees();
        },
        error: () => this.snackBar.open('Impossible d’enregistrer la répartition des factures.', 'Fermer', { duration: 5000 })
      });
    });
  }

  // ===================== FORMATTERS & BADGES =====================

  formatDate(d?: string): string {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return d;
  }

  getMoisLibelle(m: number): string {
    const mois = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return mois[m] || `Mois ${m}`;
  }

  getRegimeLabel(r?: string): string {
    switch (r) {
      case 'MEMBRE': return 'Régime Général';
      case 'MUTUELLE': return 'Mutuelle de Santé';
      case 'CMU_DE BASE': return 'CMU de Base';
      case 'CESARIENNE': return 'Gratuité Césarienne';
      case 'DIALYSE': return 'Gratuité Dialyse';
      case 'MOINS_5_ANS': return 'Gratuité Enfants -5 ans';
      case 'PLAN_SESAME': return 'Plan Sésame (Séniors)';
      default: return r || 'Régime';
    }
  }

  getRegimeBadgeClass(r?: string): string {
    switch (r) {
      case 'CESARIENNE': return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'DIALYSE': return 'bg-purple-50 text-purple-700 border border-purple-200';
      case 'MOINS_5_ANS': return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'PLAN_SESAME': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      default: return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
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
      case 'A_TRAITER': return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'EN_COURS_SR': return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'VALIDEE_SR': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'REJETEE_SR': return 'bg-rose-50 text-rose-700 border border-rose-200';
      case 'ENVOYEE_NC': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
      default: return 'bg-slate-50 text-slate-600 border border-slate-200';
    }
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
