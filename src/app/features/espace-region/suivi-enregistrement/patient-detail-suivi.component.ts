import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
import { DossierPatientContenuComponent } from '../../espace-poste/dossier-patient-dialog/dossier-patient-contenu.component';
import { DossierPatient, DocumentComplementaire, FactureStructure, TypePiece } from '../../../core/models/structure.model';
import { FactureAssigneeResume, SrGestionService } from '../services/sr-gestion.service';
import { PatientLigne, PrestationLigne } from './suivi-enregistrement.component';

interface InfoPatient {
  libelle: string;
  valeur: string;
  mono?: boolean;
}

@Component({
  selector: 'app-patient-detail-suivi',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatSnackBarModule,
    PaginationComponent,
    PaginerPipe,
    DossierPatientContenuComponent
  ],
  templateUrl: './patient-detail-suivi.component.html'
})
export class PatientDetailSuiviComponent implements OnInit {
  chargement = true;
  erreurChargement = false;

  patientId = '';
  patient: PatientLigne | null = null;
  facture: FactureAssigneeResume | null = null;
  districtNom = '';
  posteNom = '';

  identitePatient: InfoPatient[] = [];
  cartePatient: InfoPatient[] = [];
  afficherIdentitePatient = false;

  // Modal dossier (pièces justificatives)
  afficherModalDossier = false;
  chargementDossier = false;
  factureDossier: FactureStructure | null = null;
  dossierActif: DossierPatient | null = null;
  documentsDossier: DocumentComplementaire[] = [];
  feuilleSoinsDossier?: { id: string; numero: string };

  // Modal modifier prestation
  afficherModalModifPrestation = false;
  prestationAModifier: PrestationLigne | null = null;
  formModifPrestation = {
    designation: '',
    codeActe: '',
    quantite: 1,
    prixUnitaire: 0
  };

  // Modal supprimer prestation
  afficherModalSupprPrestation = false;
  prestationASupprimer: PrestationLigne | null = null;

  // Modal retirer patient
  afficherModalRetirerPatient = false;

  private destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private srService: SrGestionService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('patientId') || '';
        this.patientId = id;
        if (!id) {
          this.chargement = false;
          this.erreurChargement = true;
          return;
        }
        this.chargerPatient(id);
      });
  }

  chargerPatient(patientId: string): void {
    this.chargement = true;
    this.erreurChargement = false;
    this.srService.getDetailPatientSuivi(patientId).subscribe({
      next: res => {
        this.chargement = false;
        if (!res || !res.patient) {
          this.erreurChargement = true;
          this.patient = null;
          return;
        }
        this.patient = res.patient;
        this.facture = res.facture;
        this.districtNom = res.districtNom || '';
        this.posteNom = res.posteNom || '';
        this.afficherIdentitePatient = false;
        this.actualiserIdentiteCartePatient();
      },
      error: () => {
        this.chargement = false;
        this.erreurChargement = true;
      }
    });
  }

  retourAuxPatients(): void {
    if (this.facture?.id) {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/facture', this.facture.id]);
    } else {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires']);
    }
  }

  private actualiserIdentiteCartePatient(): void {
    const p = this.patient;
    if (!p) {
      this.identitePatient = [];
      this.cartePatient = [];
      return;
    }
    this.identitePatient = this.infosRenseignees([
      { libelle: 'Nom complet', valeur: `${p.prenom} ${p.nom}`.trim() },
      { libelle: 'Matricule', valeur: p.matricule, mono: true },
      { libelle: 'Date de la visite', valeur: p.datePriseEnCharge ? this.formatDateHeure(p.datePriseEnCharge, p.heurePriseEnCharge) : '' },
      { libelle: 'Date de naissance', valeur: p.dateNaissance ? this.formatDate(p.dateNaissance) : '' },
      { libelle: 'Sexe', valeur: p.sexe === 'M' ? 'Masculin' : p.sexe === 'F' ? 'Féminin' : p.sexe },
      { libelle: 'Téléphone', valeur: p.telephone || '' },
      { libelle: 'Adresse', valeur: p.adresse || '' },
      { libelle: 'N° de CNI', valeur: p.cni, mono: true },
      { libelle: 'N° de registre', valeur: p.numeroRegistre || '', mono: true },
      { libelle: 'Lettre de garantie', valeur: p.lettreNumero || '', mono: true },
      { libelle: 'Service', valeur: p.service || '' },
      { libelle: 'Dialyse (IRC / IRA)', valeur: p.ircIra || '' },
      { libelle: 'Indication', valeur: p.indicationCbt || '' }
    ]);

    const validite = p.dateDebutValiditeCarte || p.dateFinValiditeCarte
      ? `${p.dateDebutValiditeCarte ? this.formatDate(p.dateDebutValiditeCarte) : '…'} au ${p.dateFinValiditeCarte ? this.formatDate(p.dateFinValiditeCarte) : '…'}` : '';
    this.cartePatient = this.infosRenseignees([
      { libelle: 'Vérification', valeur: p.verificationCarte === 'VERIFIEE' ? 'Carte vérifiée en ligne'
        : p.verificationCarte === 'NON_VERIFIEE_PANNE' ? 'Non vérifiée (système en panne)' : '' },
      { libelle: 'Catégorie', valeur: p.categorieCarte || '' },
      { libelle: 'État', valeur: p.etatCarte || '' },
      { libelle: 'Validité', valeur: validite },
      { libelle: 'Mutuelle', valeur: p.mutuelle || '' },
      { libelle: "Type d'adhésion", valeur: p.typeAdhesion || '' },
      { libelle: 'Taux de couverture', valeur: p.tauxCouverture != null ? `${p.tauxCouverture} %` : '' }
    ]);
  }

  private infosRenseignees(infos: InfoPatient[]): InfoPatient[] {
    return infos.filter(info => !!info.valeur && info.valeur.trim() !== '');
  }

  ouvrirModalDossier(): void {
    this.afficherModalDossier = true;
    this.chargementDossier = true;
    this.factureDossier = null;
    this.dossierActif = null;
    this.documentsDossier = [];
    this.feuilleSoinsDossier = undefined;
    const patient = this.patient;
    const factureId = this.facture?.id;
    if (!patient || !factureId || this.facture?.typeEtablissement !== 'STRUCTURE') {
      this.chargementDossier = false;
      return;
    }
    this.srService.getFactureStructure(factureId).subscribe({
      next: (facture: any) => {
        if (this.patient?.id !== patient.id || this.facture?.id !== factureId) return;
        this.factureDossier = facture;
        const dossier = (facture.dossiers || []).find((d: any) =>
          d.id === patient.id || (!!patient.matricule && d.matricule === patient.matricule) ||
          (!!patient.lettreNumero && d.lettreGarantieNumero === patient.lettreNumero) ||
          (!!patient.nom && !!patient.prenom && d.nom?.toLowerCase() === patient.nom.toLowerCase() && d.prenom?.toLowerCase() === patient.prenom.toLowerCase() && (!patient.dateNaissance || d.dateNaissance === patient.dateNaissance))
        );
        const lignes: any[] = facture.lignes || [];
        const lignesPatient = dossier
          ? lignes.filter((l: any) => l.dossierId
              ? l.dossierId === dossier.id
              : (!!dossier.matricule && l.patientMatricule === dossier.matricule) ||
                (!!dossier.lettreGarantieNumero && l.lettreGarantieNumero === dossier.lettreGarantieNumero))
          : lignes.filter((l: any) =>
              (!!patient.matricule && l.patientMatricule === patient.matricule) ||
              (!!patient.lettreNumero && l.lettreGarantieNumero === patient.lettreNumero) ||
              (!!patient.id && l.patientId === patient.id) ||
              (!!patient.nom && !!patient.prenom && l.patientNom?.toLowerCase() === patient.nom.toLowerCase() && l.patientPrenom?.toLowerCase() === patient.prenom.toLowerCase() && (!patient.dateNaissance || l.patientDateNaissance === patient.dateNaissance))
            );
        this.dossierActif = dossier || {
          id: lignesPatient[0]?.dossierId || patient.id,
          statut: patient.statutDossier === 'A_COMPLETER' ? 'A_COMPLETER' : 'COMPLET',
          nom: patient.nom, prenom: patient.prenom, sexe: patient.sexe, dateNaissance: patient.dateNaissance,
          telephone: patient.telephone, adresse: patient.adresse, matricule: patient.matricule,
          numeroCni: patient.cni, numeroRegistre: patient.numeroRegistre, identiteVerrouillee: false,
          verificationCarte: patient.verificationCarte, categorieCarte: patient.categorieCarte, etatCarte: patient.etatCarte,
          tauxCouverture: patient.tauxCouverture, dateDebutValidite: patient.dateDebutValiditeCarte,
          dateFinValidite: patient.dateFinValiditeCarte, mutuelle: patient.mutuelle, typeAdhesion: patient.typeAdhesion,
          lettreGarantieNumero: patient.lettreNumero,
          datePriseEnCharge: patient.datePriseEnCharge, heurePriseEnCharge: patient.heurePriseEnCharge,
          pieces: (patient.pieces || []) as TypePiece[],
        };
        const feuilleId = lignesPatient.find((l: any) => l.feuilleSoinsId)?.feuilleSoinsId;
        if (feuilleId) {
          this.feuilleSoinsDossier = { id: feuilleId, numero: lignesPatient.find((l: any) => l.feuilleSoinsNumero)?.feuilleSoinsNumero || '' };
        }
        this.documentsDossier = (facture.documentsComplementaires || []).filter((doc: any) =>
          !doc.dossierId || doc.dossierId === this.dossierActif?.id
        );
        this.chargementDossier = false;
      },
      error: () => {
        this.chargementDossier = false;
      }
    });
  }

  fermerModalDossier(): void {
    this.afficherModalDossier = false;
  }

  ouvrirModalModifierPrestation(pr: PrestationLigne): void {
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
    if (!this.facture || !this.patient || !this.prestationAModifier) return;
    if (!this.formModifPrestation.designation.trim()) {
      this.snackBar.open('La désignation de la prestation est obligatoire', 'OK', { duration: 3000 });
      return;
    }
    if (this.formModifPrestation.quantite <= 0 || this.formModifPrestation.prixUnitaire < 0) {
      this.snackBar.open('La quantité et le prix unitaire doivent être valides', 'OK', { duration: 3000 });
      return;
    }

    this.srService.modifierPrestation(
      this.facture.id,
      this.patient.id,
      this.prestationAModifier.id,
      this.formModifPrestation
    );

    const patients = this.srService.getPatientsPourFacture(this.facture);
    const updated = patients.find(p => p.id === this.patient!.id);
    if (updated) {
      this.patient = updated;
      this.actualiserIdentiteCartePatient();
    }
    const totalNouveau = patients.reduce((sum, p) => sum + p.montantTotal, 0);
    this.facture.montantTotal = totalNouveau;
    this.facture.montantSencsu = Math.round(totalNouveau * 0.8);

    this.afficherModalModifPrestation = false;
    this.snackBar.open('Prestation modifiée avec succès. Montants et consolidations recalculés en temps réel !', 'OK', { duration: 4000 });
  }

  ouvrirModalSupprimerPrestation(pr: PrestationLigne): void {
    this.prestationASupprimer = pr;
    this.afficherModalSupprPrestation = true;
  }

  confirmerSuppressionPrestation(): void {
    if (!this.facture || !this.patient || !this.prestationASupprimer) return;

    this.srService.supprimerPrestation(
      this.facture.id,
      this.patient.id,
      this.prestationASupprimer.id
    );

    const patients = this.srService.getPatientsPourFacture(this.facture);
    const updated = patients.find(p => p.id === this.patient!.id);
    if (updated) {
      this.patient = updated;
      this.actualiserIdentiteCartePatient();
    }
    const totalNouveau = patients.reduce((sum, p) => sum + p.montantTotal, 0);
    this.facture.montantTotal = totalNouveau;
    this.facture.montantSencsu = Math.round(totalNouveau * 0.8);
    this.facture.nombreBeneficiaires = patients.filter(p => p.prestations.length > 0).length;

    this.afficherModalSupprPrestation = false;
    this.snackBar.open('Prestation supprimée. Facture et décompte bénéficiaires recalculés en temps réel !', 'OK', { duration: 4000 });
  }

  ouvrirModalRetirerPatient(): void {
    this.afficherModalRetirerPatient = true;
  }

  confirmerRetraitPatient(): void {
    if (!this.facture || !this.patient) return;
    const nomComplet = `${this.patient.prenom} ${this.patient.nom}`.trim();
    this.srService.retirerPatient(this.facture, this.patient);
    this.afficherModalRetirerPatient = false;
    this.snackBar.open(`Patient ${nomComplet} retiré de la facture.`, 'OK', { duration: 4000 });
    this.retourAuxPatients();
  }

  formatDate(d?: string): string {
    if (!d) return '-';
    const parts = d.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return d;
  }

  formatDateHeure(date?: string, heure?: string): string {
    const jour = this.formatDate(date);
    const h = (heure || '').substring(0, 5);
    return h && jour !== '-' ? `${jour} à ${h}` : jour;
  }

  getMoisLibelle(m: number): string {
    const mois = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return mois[m] || `Mois ${m}`;
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
