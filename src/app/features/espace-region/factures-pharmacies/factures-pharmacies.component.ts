import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SrGestionService, FactureAssigneeResume } from '../services/sr-gestion.service';
import { DossiersGlobauxService } from '../services/dossiers-globaux.service';
import { Facture, LigneFacture } from '../../../core/models/facture.model';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';

export interface PharmacieEntonnoir {
  id: string;
  code: string;
  nom: string;
  ville: string;
  montantTotal: number;
  nombreFactures: number;
  nombreBeneficiaires: number;
}

export interface MoisPharmacieEntonnoir {
  mois: number;
  nomMois: string;
  facturee: boolean;
  factureId?: string;
  numeroFacture?: string;
  montantTotal?: number;
  montantSencsu?: number;
  nombreBeneficiaires?: number;
  statut?: string;
  controleurNom?: string;
  commentaireRejet?: string;
}

export interface PatientPharmacieDetail {
  id: string;
  nom: string;
  matricule: string;
  cni?: string;
  datePriseEnCharge?: string;
  montantTotal: number;
  statutLigne: string;
  motifRejet?: string;
  medicaments: LigneFacture[];
  pieces?: string[];
  ticketCaisse?: string;
  ordonnance?: string;
  bonCommande?: string;
}

@Component({
  selector: 'app-factures-pharmacies',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './factures-pharmacies.component.html'
})
export class FacturesPharmaciesComponent implements OnInit {
  // Niveau dans l'entonnoir :
  // 1 = Liste des pharmacies d'officine
  // 2 = Régime (Contributif)
  // 3 = Mois facturés du régime
  // 4 = Facture d'un mois sélectionné (Bénéficiaires style poste de santé)
  // 5 = Page Médicaments du patient sélectionné (Dossier dessus, Médicaments en dessous)
  niveauEntonnoir: 1 | 2 | 3 | 4 | 5 = 1;

  pharmacies: PharmacieEntonnoir[] = [];
  pharmacieSelectionnee: PharmacieEntonnoir | null = null;

  regimes = [
    { code: 'CONTRIBUTIF', libelle: 'Médicaments CSU / Contributif (BSF, Mutuelles)', montant: 0, moisCount: 0, benef: 0 }
  ];
  regimeSelectionne: any = null;

  annee = new Date().getFullYear();
  anneesDispo = [2026, 2025, 2024];
  filtreStatutMois = '';

  moisListe: MoisPharmacieEntonnoir[] = [];
  moisSelectionne: MoisPharmacieEntonnoir | null = null;

  factureActiveResume: FactureAssigneeResume | null = null;
  patients: PatientPharmacieDetail[] = [];
  patientSelectionne: PatientPharmacieDetail | null = null;
  patientSelectionnePourDossier: PatientPharmacieDetail | null = null;
  afficherModalDossier = false;

  searchPatient = '';

  // Modal Modifier Médicament
  afficherModalModifMedicament = false;
  medicamentAModifier: any = null;
  patientDeMedicament: PatientPharmacieDetail | null = null;
  formModifMedicament = {
    designation: '',
    codeProduit: '',
    quantite: 1,
    prixUnitaire: 0
  };

  // Modal Supprimer Médicament
  afficherModalSupprMedicament = false;
  medicamentASupprimer: any = null;
  patientDeMedicamentASupprimer: PatientPharmacieDetail | null = null;

  // Modal Supprimer Facture
  afficherModalSupprFacture = false;
  factureASupprimer: FactureAssigneeResume | null = null;

  // Modal de rejet
  afficherModalRejet = false;
  typeRejetActuel: 'FACTURE' | 'PATIENT' | 'LIGNE' = 'FACTURE';
  cibleRejetId = '';
  cibleRejetNom = '';
  motifRejetInput = '';

  loading = false;
  telechargementEnCours = false;

  readonly MOIS_NOMS = [
    '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  constructor(
    private srService: SrGestionService,
    private dossiersGlobaux: DossiersGlobauxService,
    private factureService: FactureService,
    public auth: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.initialiserPharmacies();
  }

  initialiserPharmacies(): void {
    this.loading = true;
    this.srService.getToutesFacturesResumes().subscribe(all => {
      const phMap = new Map<string, PharmacieEntonnoir>();

      all.filter(f => f.typeEtablissement === 'PHARMACIE' && f.annee === this.annee).forEach(f => {
        if (!phMap.has(f.etablissementId)) {
          phMap.set(f.etablissementId, {
            id: f.etablissementId,
            code: f.numero.split('-')[1] || 'PH',
            nom: f.etablissementNom,
            ville: f.districtNom || 'Thiès',
            montantTotal: 0,
            nombreFactures: 0,
            nombreBeneficiaires: 0
          });
        }
        const ph = phMap.get(f.etablissementId)!;
        ph.montantTotal += f.montantTotal;
        ph.nombreFactures += 1;
        ph.nombreBeneficiaires += f.nombreBeneficiaires;
      });

      this.pharmacies = Array.from(phMap.values());
      this.loading = false;
    });
  }

  selectionnerPharmacie(ph: PharmacieEntonnoir): void {
    this.pharmacieSelectionnee = ph;
    this.regimeSelectionne = null;
    this.moisSelectionne = null;
    this.niveauEntonnoir = 2;
    this.chargerRegimesDeLaPharmacie(ph);
  }

  chargerRegimesDeLaPharmacie(ph: PharmacieEntonnoir): void {
    this.srService.getToutesFacturesResumes().subscribe(all => {
      const fSiennes = all.filter(f => f.etablissementId === ph.id && f.annee === this.annee);
      const moisDist = new Set(fSiennes.map(f => f.mois));

      this.regimes = [
        {
          code: 'CONTRIBUTIF',
          libelle: 'Médicaments CSU / Contributif (BSF, Mutuelles)',
          montant: fSiennes.reduce((s, f) => s + f.montantTotal, 0),
          moisCount: moisDist.size,
          benef: fSiennes.reduce((s, f) => s + f.nombreBeneficiaires, 0)
        }
      ];
    });
  }

  selectionnerRegime(r: any): void {
    this.regimeSelectionne = r;
    this.moisSelectionne = null;
    this.niveauEntonnoir = 3;
    this.chargerMoisDeLaPharmacie();
  }

  chargerMoisDeLaPharmacie(): void {
    if (!this.pharmacieSelectionnee) return;

    this.srService.getToutesFacturesResumes().subscribe(all => {
      const fDuMois = all.filter(f =>
        f.etablissementId === this.pharmacieSelectionnee!.id &&
        f.annee === this.annee
      );

      const fMap = new Map<number, FactureAssigneeResume>();
      fDuMois.forEach(f => fMap.set(f.mois, f));

      const moisRes: MoisPharmacieEntonnoir[] = [];
      for (let m = 1; m <= 12; m++) {
        const fac = fMap.get(m);
        moisRes.push({
          mois: m,
          nomMois: this.MOIS_NOMS[m],
          facturee: !!fac,
          factureId: fac?.id,
          numeroFacture: fac?.numero,
          montantTotal: fac?.montantTotal,
          montantSencsu: fac?.montantSencsu,
          nombreBeneficiaires: fac?.nombreBeneficiaires,
          statut: fac?.statut,
          controleurNom: fac?.controleurNom,
          commentaireRejet: fac?.commentaireRejet
        });
      }

      this.moisListe = moisRes;
    });
  }

  get moisFiltres(): MoisPharmacieEntonnoir[] {
    if (!this.filtreStatutMois) return this.moisListe;
    return this.moisListe.filter(m => {
      if (this.filtreStatutMois === 'FACTURE') return m.facturee;
      if (this.filtreStatutMois === 'NON_FACTURE') return !m.facturee;
      return m.statut === this.filtreStatutMois;
    });
  }

  selectionnerMois(m: MoisPharmacieEntonnoir): void {
    if (!m.facturee) return;
    this.moisSelectionne = m;
    this.niveauEntonnoir = 4;
    this.chargerFactureDuMois(m);
  }

  chargerFactureDuMois(m: MoisPharmacieEntonnoir): void {
    this.loading = true;
    this.srService.getToutesFacturesResumes().subscribe(all => {
      const facResume = all.find(f => f.id === m.factureId);
      if (!facResume) {
        this.loading = false;
        this.snackBar.open('Cette facture est introuvable dans le backend. Actualisez la liste.', 'Fermer', { duration: 4000 });
        return;
      }

      this.factureActiveResume = facResume;

      if (facResume.statut === 'A_TRAITER') {
        this.srService.changerStatutFacture(facResume.id, 'EN_COURS_SR');
        facResume.statut = 'EN_COURS_SR';
        m.statut = 'EN_COURS_SR';
      }

      this.genererPatientsPharmacie(facResume);
      this.loading = false;
    });
  }

  private genererPatientsPharmacie(fac: FactureAssigneeResume): void {
    this.patients = (this.srService.getPatientsPourFacture(fac) as any[]).map(patient => ({
      id: patient.id,
      nom: [patient.prenom, patient.nom].filter(Boolean).join(' '),
      matricule: patient.matricule || '',
      cni: patient.cni || '',
      datePriseEnCharge: patient.datePriseEnCharge || '',
      montantTotal: patient.montantTotal || 0,
      statutLigne: patient.statutLigne || 'CONFORME',
      motifRejet: patient.motifRejet,
      medicaments: (patient.prestations || []).map((p: any) => ({
        medicament: p.designation || '', codeProduit: p.codeActe || '', quantite: p.quantite || 0,
        prixUnitaire: p.prixUnitaire || 0, montant: p.montant || 0,
        statutLigne: p.statutLigne, motifRejet: p.motifRejet,
        patientNomPrenom: [patient.prenom, patient.nom].filter(Boolean).join(' '),
        patientMatricule: patient.matricule || ''
      } as LigneFacture)),
      pieces: patient.pieces || []
    }));
  }

  get patientsFiltres(): PatientPharmacieDetail[] {
    if (!this.searchPatient) return this.patients;
    const q = this.searchPatient.toLowerCase().trim();
    return this.patients.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q)
    );
  }

  // ===================== ACTIONS DU CONTRÔLEUR & DOSSIERS GLOBAUX =====================

  async telechargerDossiersGlobaux(): Promise<void> {
    if (!this.factureActiveResume) return;
    if (this.factureActiveResume.typeEtablissement !== 'PHARMACIE') return;

    this.telechargementEnCours = true;
    this.snackBar.open('Génération des dossiers globaux pharmacie en cours...', 'OK', { duration: 3000 });

    try {
      const factPharma = this.factureActiveResume.factureOrigine as Facture | undefined;
      if (!factPharma) throw new Error('La facture backend ne contient pas son détail.');
      await this.dossiersGlobaux.telechargerDossiersGlobauxPharmacie(factPharma);
      this.snackBar.open('Dossiers globaux téléchargés avec succès !', 'Fermer', { duration: 4000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Erreur lors du téléchargement des dossiers globaux.', 'Fermer', { duration: 4000 });
    } finally {
      this.telechargementEnCours = false;
    }
  }

  telechargerExcel(): void {
    if (!this.factureActiveResume) return;
    this.factureService.exportFactureExcel(this.factureActiveResume.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.factureActiveResume?.etablissementNom || 'Pharmacie'}_M${this.factureActiveResume?.mois}_${this.factureActiveResume?.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.snackBar.open('Téléchargement Excel de contrôle démarré.', 'OK', { duration: 3000 });
      }
    });
  }

  // ===================== SYSTÈME DE REJET À 3 NIVEAUX =====================

  ouvrirModalRejetFacture(): void {
    this.typeRejetActuel = 'FACTURE';
    this.cibleRejetId = this.factureActiveResume?.id || '';
    this.cibleRejetNom = `la facture ${this.factureActiveResume?.numero}`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  ouvrirModalRejetPatient(p: PatientPharmacieDetail): void {
    this.typeRejetActuel = 'PATIENT';
    this.cibleRejetId = p.id;
    this.cibleRejetNom = `le patient ${p.nom} (${p.matricule})`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  ouvrirModalRejetMedicament(p: PatientPharmacieDetail, mIdx: number): void {
    this.typeRejetActuel = 'LIGNE';
    this.cibleRejetId = `${p.id}-l${mIdx}`;
    this.cibleRejetNom = `la ligne médicament « ${p.medicaments[mIdx]?.medicament} »`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  validerRejet(): void {
    if (!this.motifRejetInput.trim()) {
      this.snackBar.open('L\'explication de la non-conformité est obligatoire !', 'OK', { duration: 3000 });
      return;
    }

    const facId = this.factureActiveResume!.id;

    if (this.typeRejetActuel === 'FACTURE') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', { motif: this.motifRejetInput });
      this.factureActiveResume!.statut = 'REJETEE_SR';
      this.factureActiveResume!.commentaireRejet = this.motifRejetInput;
    } else if (this.typeRejetActuel === 'PATIENT') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: `Rejet dispensation patient : ${this.motifRejetInput}`,
        rejetPatient: { patientKey: this.cibleRejetId, motif: this.motifRejetInput }
      });
      this.factureActiveResume!.statut = 'REJETEE_SR';
      const pat = this.patients.find(p => p.id === this.cibleRejetId);
      if (pat) {
        pat.statutLigne = 'REJETEE';
        pat.motifRejet = this.motifRejetInput;
        pat.medicaments.forEach(m => {
          m.statutLigne = 'REJETEE' as any;
          m.motifRejet = this.motifRejetInput;
        });
      }
    } else if (this.typeRejetActuel === 'LIGNE') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: `Rejet produit : ${this.motifRejetInput}`,
        rejetLigne: { ligneKey: this.cibleRejetId, motif: this.motifRejetInput }
      });
      this.factureActiveResume!.statut = 'REJETEE_SR';
      this.patients.forEach(pat => {
        pat.medicaments.forEach((m, idx) => {
          if (`${pat.id}-l${idx}` === this.cibleRejetId) {
            m.statutLigne = 'REJETEE' as any;
            m.motifRejet = this.motifRejetInput;
            pat.statutLigne = 'REJETEE';
          }
        });
      });
    }

    if (this.moisSelectionne) {
      this.moisSelectionne.statut = 'REJETEE_SR';
    }

    this.afficherModalRejet = false;
    this.snackBar.open('Rejet motivé enregistré et notifié à la pharmacie !', 'OK', { duration: 4000 });
  }

  validerFacture(): void {
    if (!this.factureActiveResume) return;
    this.srService.changerStatutFacture(this.factureActiveResume.id, 'VALIDEE_SR');
    this.factureActiveResume.statut = 'VALIDEE_SR';
    if (this.moisSelectionne) {
      this.moisSelectionne.statut = 'VALIDEE_SR';
    }
    this.snackBar.open('Facture pharmacie validée avec succès !', 'OK', { duration: 4000 });
  }

  envoyerAuNiveauCentral(): void {
    if (!this.factureActiveResume) return;
    this.srService.changerStatutFacture(this.factureActiveResume.id, 'ENVOYEE_NC');
    this.factureActiveResume.statut = 'ENVOYEE_NC';
    if (this.moisSelectionne) {
      this.moisSelectionne.statut = 'ENVOYEE_NC';
    }
    this.snackBar.open('Facture transmise avec succès au Niveau Central (NC) !', 'OK', { duration: 4000 });
  }

  voirDossierPatient(p: PatientPharmacieDetail): void {
    this.patientSelectionnePourDossier = p;
    this.afficherModalDossier = true;
  }

  fermerModalDossier(): void {
    this.afficherModalDossier = false;
  }

  // ===================== NAVIGATION PATIENT & MÉDICAMENTS (STYLE POSTE DE SANTÉ) =====================

  ouvrirMedicamentsPatient(p: PatientPharmacieDetail): void {
    this.patientSelectionne = p;
    this.patientSelectionnePourDossier = p;
    this.niveauEntonnoir = 5;
  }

  retourALaFacture(): void {
    this.patientSelectionne = null;
    this.niveauEntonnoir = 4;
  }

  // ===================== MODIFICATION & SUPPRESSION DE MÉDICAMENT EN TEMPS RÉEL =====================

  ouvrirModalModifMedicament(patient: PatientPharmacieDetail, med: any): void {
    this.patientDeMedicament = patient;
    this.medicamentAModifier = med;
    this.formModifMedicament = {
      designation: med.medicament,
      codeProduit: med.codeProduit || '',
      quantite: med.quantite || 1,
      prixUnitaire: med.prixUnitaire || 0
    };
    this.afficherModalModifMedicament = true;
  }

  sauvegarderMedicament(): void {
    if (!this.factureActiveResume || !this.patientDeMedicament || !this.medicamentAModifier) return;
    if (!this.formModifMedicament.designation.trim()) {
      this.snackBar.open('La désignation du médicament est obligatoire', 'OK', { duration: 3000 });
      return;
    }
    if (this.formModifMedicament.quantite <= 0 || this.formModifMedicament.prixUnitaire < 0) {
      this.snackBar.open('La quantité et le prix unitaire doivent être valides', 'OK', { duration: 3000 });
      return;
    }

    this.srService.modifierPrestation(
      this.factureActiveResume.id,
      this.patientDeMedicament.id,
      this.medicamentAModifier.codeProduit || 'MED',
      {
        designation: this.formModifMedicament.designation,
        codeActe: this.formModifMedicament.codeProduit,
        quantite: this.formModifMedicament.quantite,
        prixUnitaire: this.formModifMedicament.prixUnitaire
      }
    );

    // Mettre à jour localement
    this.medicamentAModifier.medicament = this.formModifMedicament.designation;
    this.medicamentAModifier.codeProduit = this.formModifMedicament.codeProduit;
    this.medicamentAModifier.quantite = Number(this.formModifMedicament.quantite);
    this.medicamentAModifier.prixUnitaire = Number(this.formModifMedicament.prixUnitaire);
    this.medicamentAModifier.montant = this.medicamentAModifier.quantite * this.medicamentAModifier.prixUnitaire;

    this.patientDeMedicament.montantTotal = this.patientDeMedicament.medicaments.reduce((sum, m) => sum + m.montant, 0);

    const totalFacture = this.patients.reduce((sum, p) => sum + p.montantTotal, 0);
    this.factureActiveResume.montantTotal = totalFacture;
    this.factureActiveResume.montantSencsu = Math.round(totalFacture * 0.8);
    if (this.moisSelectionne) {
      this.moisSelectionne.montantTotal = totalFacture;
      this.moisSelectionne.montantSencsu = Math.round(totalFacture * 0.8);
    }

    this.afficherModalModifMedicament = false;
    this.snackBar.open('Médicament modifié avec succès. Montants recalculés en temps réel !', 'OK', { duration: 4000 });
  }

  ouvrirModalSupprMedicament(patient: PatientPharmacieDetail, med: any): void {
    this.patientDeMedicamentASupprimer = patient;
    this.medicamentASupprimer = med;
    this.afficherModalSupprMedicament = true;
  }

  confirmerSuppressionMedicament(): void {
    if (!this.factureActiveResume || !this.patientDeMedicamentASupprimer || !this.medicamentASupprimer) return;

    this.srService.supprimerPrestation(
      this.factureActiveResume.id,
      this.patientDeMedicamentASupprimer.id,
      this.medicamentASupprimer.codeProduit || 'MED'
    );

    this.patientDeMedicamentASupprimer.medicaments = this.patientDeMedicamentASupprimer.medicaments.filter(
      m => m !== this.medicamentASupprimer
    );
    this.patientDeMedicamentASupprimer.montantTotal = this.patientDeMedicamentASupprimer.medicaments.reduce(
      (sum, m) => sum + m.montant, 0
    );

    const totalFacture = this.patients.reduce((sum, p) => sum + p.montantTotal, 0);
    this.factureActiveResume.montantTotal = totalFacture;
    this.factureActiveResume.montantSencsu = Math.round(totalFacture * 0.8);
    this.factureActiveResume.nombreBeneficiaires = this.patients.filter(p => p.medicaments.length > 0).length;

    if (this.moisSelectionne) {
      this.moisSelectionne.montantTotal = totalFacture;
      this.moisSelectionne.montantSencsu = Math.round(totalFacture * 0.8);
      this.moisSelectionne.nombreBeneficiaires = this.factureActiveResume.nombreBeneficiaires;
    }

    this.afficherModalSupprMedicament = false;
    this.snackBar.open('Ligne médicament supprimée. Facture recalculée en temps réel !', 'OK', { duration: 4000 });
  }

  ouvrirModalSupprimerFacture(fac?: FactureAssigneeResume, event?: Event): void {
    if (event) event.stopPropagation();
    this.factureASupprimer = fac || this.factureActiveResume;
    this.afficherModalSupprFacture = true;
  }

  confirmerSuppressionFacture(): void {
    if (!this.factureASupprimer) return;
    const facId = this.factureASupprimer.id;
    const facNum = this.factureASupprimer.numero;

    this.srService.supprimerFacture(facId);

    if (this.moisSelectionne && this.moisSelectionne.factureId === facId) {
      this.moisSelectionne.facturee = false;
      this.moisSelectionne.montantTotal = 0;
      this.moisSelectionne.montantSencsu = 0;
      this.moisSelectionne.nombreBeneficiaires = 0;
      this.moisSelectionne.statut = undefined;
    }

    this.niveauEntonnoir = 3;
    this.patientSelectionne = null;
    this.factureActiveResume = null;
    this.afficherModalSupprFacture = false;
    this.snackBar.open(`Facture ${facNum} supprimée définitivement. Données régionales mises à jour !`, 'OK', { duration: 4000 });
  }

  formatDate(d?: string): string {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return d;
  }

  getInitiales(nom?: string): string {
    if (!nom) return 'PH';
    const parts = nom.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nom.substring(0, 2).toUpperCase();
  }

  // ===================== NAVIGATION DANS LE FIL D'ARIANE =====================

  allerAuNiveau(n: 1 | 2 | 3 | 4 | 5): void {
    if (n === 1) {
      this.pharmacieSelectionnee = null;
      this.regimeSelectionne = null;
      this.moisSelectionne = null;
      this.patientSelectionne = null;
      this.niveauEntonnoir = 1;
    } else if (n === 2) {
      this.regimeSelectionne = null;
      this.moisSelectionne = null;
      this.patientSelectionne = null;
      this.niveauEntonnoir = 2;
    } else if (n === 3) {
      this.moisSelectionne = null;
      this.patientSelectionne = null;
      this.niveauEntonnoir = 3;
    } else if (n === 4) {
      this.patientSelectionne = null;
      this.niveauEntonnoir = 4;
    }
  }

  formatMontant(m?: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
