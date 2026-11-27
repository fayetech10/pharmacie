import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { PaginerPipe } from '../../../shared/pagination/paginer.pipe';
import { SkeletonListComponent } from '../../../shared/skeleton-list/skeleton-list.component';
import { interval, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import {
  SrGestionService,
  DistrictEnregistrementRow,
  StructureEnregistrementRow,
  PharmacieEnregistrementRow,
  PostePolariseRow,
  FactureAssigneeResume
} from '../services/sr-gestion.service';
import { FactureEventsService } from '../../../core/services/facture-events.service';
import { DossierPatient, DocumentComplementaire, FactureStructure, TypePiece } from '../../../core/models/structure.model';
import { DossierPatientContenuComponent } from '../../espace-poste/dossier-patient-dialog/dossier-patient-contenu.component';

export interface PrestationLigne {
  id: string;
  dossierId: string;
  designation: string;
  codeActe: string;
  datePriseEnCharge?: string;
  heurePriseEnCharge?: string;
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
  heurePriseEnCharge?: string;
  telephone?: string;
  adresse?: string;
  numeroRegistre?: string;
  lettreNumero?: string;
  service?: string;
  ircIra?: string;
  indicationCbt?: string;
  verificationCarte?: string;
  categorieCarte?: string;
  etatCarte?: string;
  dateDebutValiditeCarte?: string;
  dateFinValiditeCarte?: string;
  mutuelle?: string;
  typeAdhesion?: string;
  tauxCouverture?: number;
  statutDossier: string;
  montantTotal: number;
  statutLigne: string;
  prestations: PrestationLigne[];
  pieces?: string[];
}

interface InfoPatient {
  libelle: string;
  valeur: string;
  mono?: boolean;
}

@Component({
  selector: 'app-suivi-enregistrement',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTabsModule, MatTooltipModule, MatSnackBarModule, PaginationComponent, PaginerPipe, SkeletonListComponent, DossierPatientContenuComponent],
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
  dateSuiviDuJour = this.formaterDateDuJour();
  actualisationEnCours = false;
  erreurChargement = false;
  filtreStatutSuivi = '';
  activeTab = 0; // 0 = Districts, 1 = Hôpitaux, 2 = Pharmacies

  districts: DistrictEnregistrementRow[] = [];
  structures: StructureEnregistrementRow[] = [];
  pharmacies: PharmacieEnregistrementRow[] = [];
  loading = false;

  // ===================== DONNÉES FILTRÉES EN MÉMOIRE (ÉVITE LE RE-RENDER EN BOUCLE) =====================
  districtsFiltres: DistrictEnregistrementRow[] = [];
  structuresFiltrees: StructureEnregistrementRow[] = [];
  pharmaciesFiltrees: PharmacieEnregistrementRow[] = [];
  hopitauxActifs: StructureEnregistrementRow[] = [];
  postesFiltres: PostePolariseRow[] = [];
  hopitauxDuDistrict: PostePolariseRow[] = [];
  postesPolarisesDuDistrict: PostePolariseRow[] = [];
  hopitauxFiltres: PostePolariseRow[] = [];
  postesPolarisesFiltres: PostePolariseRow[] = [];
  facturesFiltrees: FactureAssigneeResume[] = [];
  patientsFiltres: PatientLigne[] = [];
  identitePatient: InfoPatient[] = [];
  cartePatient: InfoPatient[] = [];

  // Compteurs mémoïsés
  totalStructuresAControler = 0;
  totalPharmaciesAControler = 0;
  totalStructuresActives = 0;
  totalDistricts = 0;
  totalPharmaciesActives = 0;
  totalPostesAControler = 0;
  totalPostesAvecFacture = 0;
  totalPostesSaisisAujourdhui = 0;
  totalPostesAvecSaisie = 0;
  totalHopitauxAvecSaisie = 0;

  // Debounce pour les filtres et recherches textuelles
  filtreDebounce$ = new Subject<void>();

  // Filtres Structures
  searchStructure = '';

  // Filtres Pharmacies
  searchPharmacie = '';

  // Mode de navigation interne :
  // 'LISTE' = tableau général des prestataires
  // 'POSTES' = liste des postes polarisés du district sanitaire sélectionné
  // 'FACTURES' = liste des factures d'un prestataire / poste sélectionné
  // 'PATIENTS' = liste des bénéficiaires/patients de la facture (Nom, Matricule & CNI, Date)
  // 'DETAIL_PATIENT' = page dédiée au patient sélectionné (Informations dessus, Prestations en dessous)
  vueMode: 'LISTE' | 'POSTES' | 'FACTURES' | 'PATIENTS' = 'LISTE';

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
  chargementFacturesPrestataire = false;
  erreurFacturesPrestataire = false;
  chargementDetailFacture = false;
  searchFacture = '';
  private requeteFacturesPrestataire = 0;
  private cibleFacturesPrestataire = '';
  private requeteDetailFacture = 0;
  private routeDistrictId: string | null = null;
  private routePosteId: string | null = null;
  private routePrestataireId: string | null = null;
  private routeFactureId: string | null = null;
  private donneesInitialesChargees = false;

  // Facture sélectionnée pour affichage des bénéficiaires
  factureSelectionnee: FactureAssigneeResume | null = null;
  patientsDeLaFacture: PatientLigne[] = [];
  searchPatient = '';

  // Patient sélectionné pour la page de ses prestations
  patientSelectionne: PatientLigne | null = null;

  // ===================== MODAL : VISUALISATION DU DOSSIER (3 PIÈCES) =====================
  afficherModalDossier = false;
  chargementDossier = false;
  factureDossier: FactureStructure | null = null;
  dossierActif: DossierPatient | null = null;
  documentsDossier: DocumentComplementaire[] = [];
  feuilleSoinsDossier?: { id: string; numero: string };
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
    private route: ActivatedRoute,
    private router: Router,
    private srService: SrGestionService,
    private factureEvents: FactureEventsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Écoute des changements de recherche/filtres avec debounce (250ms)
    this.filtreDebounce$
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.recalculerFiltres();
      });

    const ctx = this.srService.suiviNavContext;
    if (ctx) {
      this.annee = ctx.annee;
      this.moisSuivi = ctx.moisSuivi;
      this.districtSelectionne = ctx.districtSelectionne;
      this.postesDuDistrict = ctx.postesDuDistrict;
      this.posteSelectionne = ctx.posteSelectionne;
      this.prestataireSelectionne = ctx.prestataireSelectionne;
      this.facturesDuPrestataire = ctx.facturesDuPrestataire;
      this.factureSelectionnee = ctx.factureSelectionnee;
      this.patientsDeLaFacture = ctx.factureSelectionnee
        ? this.srService.getPatientsPourFacture(ctx.factureSelectionnee)
        : ctx.patientsDeLaFacture;
      this.vueMode = ctx.vueMode;
      this.srService.suiviNavContext = null;
      this.recalculerFiltres();
    }
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.routeDistrictId = params.get('districtId');
        this.routePosteId = params.get('posteId');
        this.routePrestataireId = params.get('prestataireId');
        this.routeFactureId = params.get('factureId');
        this.appliquerRouteParams();
      });
    this.chargerDonnees();

    // Réactivité en temps réel : si une facture ou prestation est modifiée n'importe où, recharger
    this.factureEvents.changed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.actualiserVues(false));

    // Rafraîchissement automatique espacé (60 secondes) uniquement quand l'onglet est actif
    interval(60_000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.actualisationEnCours && document.visibilityState === 'visible') this.actualiserVues(false);
      });
  }

  actualiserMaintenant(): void {
    this.actualiserVues(false);
  }

  private formaterDateDuJour(): string {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Dakar' }).format(new Date());
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
        this.dateSuiviDuJour = this.formaterDateDuJour();
        this.erreurChargement = false;
        this.actualisationEnCours = false;
        this.loading = false;
        this.recalculerDistrictsEtStructures();
        this.donneesInitialesChargees = true;
        this.appliquerRouteParams();
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


  private appliquerRouteParams(): void {
    // 1. Vue facture -> patients
    if (this.routeFactureId) {
      const fid = this.routeFactureId;
      if (this.factureSelectionnee?.id === fid) {
        this.vueMode = 'PATIENTS';
        return;
      }
      const locale = this.facturesDuPrestataire.find(f => f.id === fid);
      if (locale) {
        this.chargerDetailFacture(locale);
        return;
      }
      this.chargerFactureParRoute(fid);
      return;
    }

    // 2. Vue district + poste polarisé -> factures
    if (this.routeDistrictId && this.routePosteId) {
      const did = this.routeDistrictId;
      const pid = this.routePosteId;
      if (this.districtSelectionne?.id === did && this.posteSelectionne?.id === pid && this.vueMode === 'FACTURES') {
        return;
      }
      const district = this.districts.find(d => d.id === did);
      if (district) {
        this.districtSelectionne = district;
      }
      const posteExistant = this.postesDuDistrict.find(p => p.id === pid);
      if (posteExistant) {
        this.appliquerPosteSelectionne(posteExistant);
      } else {
        this.srService.getPostesPolarises(did, this.annee, this.moisSuivi).subscribe(list => {
          this.postesDuDistrict = list;
          this.recalculerPostes();
          const poste = list.find(p => p.id === pid);
          if (poste) this.appliquerPosteSelectionne(poste);
        });
      }
      return;
    }

    // 3. Vue district -> postes polarisés
    if (this.routeDistrictId) {
      const did = this.routeDistrictId;
      if (this.districtSelectionne?.id === did && this.vueMode === 'POSTES') return;
      const district = this.districts.find(d => d.id === did);
      if (district) {
        this.districtSelectionne = district;
      } else if (!this.donneesInitialesChargees) {
        return;
      } else {
        this.districtSelectionne = {
          id: did, code: '', nom: 'District',
          nombrePostes: 0, nombrePostesAvecSaisie: 0, nombrePostesSaisisAujourdhui: 0,
          statutSuiviPeriode: 'A_SAISIR',
          nombreFactures: 0, montantTotal: 0, nombreBeneficiaires: 0
        };
      }
      this.posteSelectionne = null;
      this.prestataireSelectionne = null;
      this.factureSelectionnee = null;
      this.vueMode = 'POSTES';
      this.chargerPostesDuDistrict(did);
      return;
    }

    // 4. Vue prestataire (hôpital / pharmacie) -> factures
    if (this.routePrestataireId) {
      const pid = this.routePrestataireId;
      if (this.prestataireSelectionne?.id === pid && !this.districtSelectionne && this.vueMode === 'FACTURES') return;
      const prestataire = this.structures.find(s => s.id === pid) || this.pharmacies.find(p => p.id === pid);
      if (prestataire) {
        this.prestataireSelectionne = prestataire;
        this.districtSelectionne = null;
        this.posteSelectionne = null;
        this.factureSelectionnee = null;
        this.vueMode = 'FACTURES';
        this.rafraichirFacturesPrestataire(pid);
      }
      return;
    }

    // 5. Liste générale
    this.vueMode = 'LISTE';
    this.districtSelectionne = null;
    this.posteSelectionne = null;
    this.prestataireSelectionne = null;
    this.factureSelectionnee = null;
  }

  private appliquerPosteSelectionne(poste: PostePolariseRow): void {
    this.posteSelectionne = poste;
    this.prestataireSelectionne = poste;
    this.factureSelectionnee = null;
    this.vueMode = 'FACTURES';
    this.rafraichirFacturesPrestataire(poste.id);
  }

  private chargerFactureParRoute(factureId: string): void {
    this.chargementDetailFacture = true;
    this.vueMode = 'PATIENTS';
    this.patientsDeLaFacture = [];
    this.srService.getToutesFacturesResumes(true, true).subscribe({
      next: factures => {
        const found = factures.find(f => f.id === factureId);
        if (found) {
          if (!this.prestataireSelectionne) {
            const struct = this.structures.find(s => s.id === found.etablissementId);
            const pharm = this.pharmacies.find(p => p.id === found.etablissementId);
            if (struct) this.prestataireSelectionne = struct;
            else if (pharm) this.prestataireSelectionne = pharm;
          }
          if (!this.districtSelectionne && found.districtId) {
            const dist = this.districts.find(d => d.id === found.districtId);
            if (dist) this.districtSelectionne = dist;
          }
          this.chargerDetailFacture(found);
        } else {
          this.srService.getFactureStructure(factureId).subscribe({
            next: fs => {
              const resume: FactureAssigneeResume = {
                id: fs.id,
                numero: fs.numero || factureId,
                typeEtablissement: 'STRUCTURE',
                etablissementId: fs.structureSanitaireId,
                etablissementNom: this.structures.find(s => s.id === fs.structureSanitaireId)?.nom || 'Structure',
                regime: fs.regime,
                mois: fs.mois,
                annee: fs.annee,
                montantTotal: fs.montantTotal || 0,
                montantSencsu: fs.montantTotalSencsu || 0,
                nombreBeneficiaires: fs.nombreBeneficiaires || 0,
                statut: fs.statut,
                factureOrigine: fs
              };
              this.chargerDetailFacture(resume);
            },
            error: () => {
              this.chargementDetailFacture = false;
              this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires']);
            }
          });
        }
      },
      error: () => {
        this.chargementDetailFacture = false;
      }
    });
  }
  // ===================== NAVIGATION PRESTATAIRE, DISTRICTS & POSTES =====================

  ouvrirFacturesPrestataire(p: StructureEnregistrementRow | PharmacieEnregistrementRow): void {
    this.prestataireSelectionne = p;
    this.districtSelectionne = null;
    this.posteSelectionne = null;
    this.factureSelectionnee = null;
    this.searchFacture = '';
    this.filtreRegime = '';
    this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/prestataire', p.id]);
  }

  chargerPostesDuDistrict(districtId: string): void {
    this.srService.getPostesPolarises(districtId, this.annee, this.moisSuivi).subscribe(list => {
      this.postesDuDistrict = list;
      this.recalculerPostes();
    });
  }

  ouvrirFacturesPoste(poste: PostePolariseRow): void {
    this.posteSelectionne = poste;
    this.prestataireSelectionne = poste;
    this.factureSelectionnee = null;
    this.searchFacture = '';
    this.filtreRegime = '';
    const districtId = this.districtSelectionne?.id || this.routeDistrictId;
    if (districtId) {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/district', districtId, 'poste', poste.id]);
    }
  }

  fermerVuePostes(): void {
    this.districtSelectionne = null;
    this.postesDuDistrict = [];
    this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires']);
  }

  retourAuxPostes(): void {
    this.posteSelectionne = null;
    this.prestataireSelectionne = null;
    this.factureSelectionnee = null;
    const districtId = this.districtSelectionne?.id || this.routeDistrictId;
    if (districtId) {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/district', districtId]);
    } else {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires']);
    }
  }

  fermerVueFactures(): void {
    if (this.districtSelectionne || this.routeDistrictId) {
      this.retourAuxPostes();
    } else {
      this.prestataireSelectionne = null;
      this.factureSelectionnee = null;
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires']);
    }
  }

  filtrerParRegime(regimeCode: string): void {
    this.filtreRegime = regimeCode;
    this.recalculerFactures();
  }

  countFacturesRegime(regimeCode: string): number {
    if (!regimeCode) return this.facturesDuPrestataire.length;
    return this.facturesDuPrestataire.filter(f => f.regime === regimeCode).length;
  }

  private rafraichirFacturesPrestataire(prestataireId: string): void {
    const annee = this.annee;
    const cible = `${prestataireId}:${annee}`;
    const requete = ++this.requeteFacturesPrestataire;
    if (this.cibleFacturesPrestataire !== cible) this.facturesDuPrestataire = [];
    this.cibleFacturesPrestataire = cible;
    this.chargementFacturesPrestataire = true;
    this.erreurFacturesPrestataire = false;

    this.srService.getFacturesParPrestataire(prestataireId, annee).subscribe({
      next: list => {
        if (requete !== this.requeteFacturesPrestataire || this.prestataireSelectionne?.id !== prestataireId || this.annee !== annee) return;
        this.facturesDuPrestataire = list;
        this.chargementFacturesPrestataire = false;
        this.recalculerFactures();
      },
      error: () => {
        if (requete !== this.requeteFacturesPrestataire) return;
        this.chargementFacturesPrestataire = false;
        this.erreurFacturesPrestataire = true;
        this.snackBar.open('Impossible de récupérer les factures de ce prestataire.', 'Fermer', { duration: 4500 });
      }
    });
  }

  onFiltreChange(): void {
    this.filtreDebounce$.next();
  }

  recalculerFiltres(): void {
    this.recalculerDistrictsEtStructures();
    this.recalculerPostes();
    this.recalculerFactures();
    this.recalculerPatients();
  }

  recalculerDistrictsEtStructures(): void {
    const qStruct = (this.searchStructure || '').toLowerCase().trim();
    const qPharma = (this.searchPharmacie || '').toLowerCase().trim();
    const statut = this.filtreStatutSuivi;

    this.hopitauxActifs = this.structures.filter(s => s.actif && s.type === 'EPS');

    this.structuresFiltrees = this.hopitauxActifs.filter(s => {
      if (statut && s.statutSuiviPeriode !== statut) return false;
      if (qStruct) {
        const match = s.nom.toLowerCase().includes(qStruct) ||
                      s.code.toLowerCase().includes(qStruct) ||
                      s.districtNom.toLowerCase().includes(qStruct);
        if (!match) return false;
      }
      return true;
    });

    this.districtsFiltres = this.districts.filter(d => {
      if (statut && d.statutSuiviPeriode !== statut) return false;
      if (qStruct) {
        if (!d.nom.toLowerCase().includes(qStruct) && !d.code.toLowerCase().includes(qStruct)) return false;
      }
      return true;
    }).sort((a, b) => b.nombrePostesSaisisAujourdhui - a.nombrePostesSaisisAujourdhui);

    this.pharmaciesFiltrees = this.pharmacies.filter(p => {
      if (!p.actif) return false;
      if (statut && p.statutSuiviPeriode !== statut) return false;
      if (qPharma) {
        const match = p.nom.toLowerCase().includes(qPharma) ||
                      p.code.toLowerCase().includes(qPharma) ||
                      p.ville.toLowerCase().includes(qPharma);
        if (!match) return false;
      }
      return true;
    });

    this.totalStructuresActives = this.hopitauxActifs.length;
    this.totalStructuresAControler = this.hopitauxActifs.filter(s => !s.factureEnvoyeePeriode).length;
    this.totalDistricts = this.districts.length;
    this.totalPharmaciesActives = this.pharmacies.filter(p => p.actif).length;
    this.totalPharmaciesAControler = this.pharmacies.filter(p => p.actif && !p.factureEnvoyeePeriode).length;
  }

  recalculerPostes(): void {
    const qPoste = (this.searchPoste || '').toLowerCase().trim();
    const statut = this.filtreStatutSuivi;
    const afficherSansSaisie = this.inclurePostesSansSaisie || statut === 'A_SAISIR';

    this.hopitauxDuDistrict = this.postesDuDistrict.filter(p => p.type === 'EPS' && p.nombreFactures > 0);
    this.postesPolarisesDuDistrict = this.postesDuDistrict.filter(p => p.type === 'PS');

    this.postesFiltres = this.postesDuDistrict.filter(p =>
      (afficherSansSaisie || p.nombreFactures > 0) &&
      (!statut || p.statutSuiviPeriode === statut) &&
      (!qPoste || p.nom.toLowerCase().includes(qPoste) || p.code.toLowerCase().includes(qPoste))
    );

    this.hopitauxFiltres = this.hopitauxDuDistrict.filter(p =>
      (!statut || p.statutSuiviPeriode === statut) &&
      (!qPoste || p.nom.toLowerCase().includes(qPoste) || p.code.toLowerCase().includes(qPoste))
    );

    this.postesPolarisesFiltres = this.postesFiltres.filter(p => p.type === 'PS');

    this.totalPostesAControler = this.postesPolarisesDuDistrict.filter(p => !p.factureEnvoyeePeriode).length;
    this.totalPostesAvecFacture = this.postesPolarisesDuDistrict.filter(p => p.factureEnvoyeePeriode).length;
    this.totalPostesSaisisAujourdhui = this.postesPolarisesDuDistrict.filter(p => p.saisieAujourdhui).length;
    this.totalPostesAvecSaisie = this.postesPolarisesDuDistrict.filter(p => p.nombreFactures > 0).length;
    this.totalHopitauxAvecSaisie = this.hopitauxDuDistrict.filter(p => p.nombreFactures > 0).length;
  }

  recalculerFactures(): void {
    const qFac = (this.searchFacture || '').toLowerCase().trim();
    const reg = this.filtreRegime;

    this.facturesFiltrees = this.facturesDuPrestataire.filter(f => {
      if (reg && f.regime !== reg) return false;
      if (qFac) {
        const match = f.numero.toLowerCase().includes(qFac) ||
                      f.regime.toLowerCase().includes(qFac) ||
                      (f.controleurNom && f.controleurNom.toLowerCase().includes(qFac));
        if (!match) return false;
      }
      return true;
    });
  }

  ouvrirDistrict(district: DistrictEnregistrementRow): void {
    this.districtSelectionne = district;
    this.posteSelectionne = null;
    this.prestataireSelectionne = null;
    this.searchPoste = '';
    this.filtreStatutSuivi = '';
    this.inclurePostesSansSaisie = false;
    this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/district', district.id]);
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
    this.chargerDetailFacture(f);
    this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/facture', f.id]);
  }

  private chargerDetailFacture(f: FactureAssigneeResume): void {
    this.chargementDetailFacture = false;
    this.factureSelectionnee = f;
    this.vueMode = 'PATIENTS';
    this.patientSelectionne = null;
    this.searchPatient = '';
    if (f.resumeSeul) {
      const requete = ++this.requeteDetailFacture;
      this.chargementDetailFacture = true;
      this.patientsDeLaFacture = [];
      this.srService.getFactureStructure(f.id).subscribe({
        next: facture => {
          if (requete !== this.requeteDetailFacture || this.factureSelectionnee?.id !== f.id) return;
          this.factureSelectionnee = {
            ...f,
            montantTotal: facture.montantTotal ?? f.montantTotal,
            montantSencsu: facture.montantTotalSencsu ?? f.montantSencsu,
            factureOrigine: facture
          };
          this.patientsDeLaFacture = this.srService.getPatientsPourFacture(this.factureSelectionnee);
          this.recalculerPatients();
          this.chargementDetailFacture = false;
        },
        error: () => {
          if (requete !== this.requeteDetailFacture) return;
          this.chargementDetailFacture = false;
          this.vueMode = 'FACTURES';
          this.factureSelectionnee = null;
          this.snackBar.open('Impossible de charger le détail de cette facture.', 'Fermer', { duration: 4500 });
        }
      });
      return;
    }
    this.patientsDeLaFacture = this.srService.getPatientsPourFacture(f);
    this.recalculerPatients();
  }

  fermerDetailFacture(): void {
    this.requeteDetailFacture++;
    this.chargementDetailFacture = false;
    this.factureSelectionnee = null;
    this.patientSelectionne = null;
    const districtId = this.districtSelectionne?.id || this.routeDistrictId;
    const posteId = this.posteSelectionne?.id || this.routePosteId;
    if (districtId && posteId) {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/district', districtId, 'poste', posteId]);
    } else if (this.prestataireSelectionne) {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/prestataire', this.prestataireSelectionne.id]);
    } else if (districtId) {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/district', districtId]);
    } else {
      this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires']);
    }
  }

  // ===================== NAVIGATION PATIENT & PRESTATIONS =====================

  ouvrirDetailPatient(patient: PatientLigne): void {
    this.srService.suiviNavContext = {
      vueMode: 'PATIENTS',
      annee: this.annee,
      moisSuivi: this.moisSuivi,
      districtSelectionne: this.districtSelectionne,
      postesDuDistrict: this.postesDuDistrict,
      posteSelectionne: this.posteSelectionne,
      prestataireSelectionne: this.prestataireSelectionne,
      facturesDuPrestataire: this.facturesDuPrestataire,
      factureSelectionnee: this.factureSelectionnee,
      patientsDeLaFacture: this.patientsDeLaFacture
    };
    this.router.navigate(['/dashboard/espace-region/enregistrement-prestataires/patient', patient.id]);
  }

  /** @deprecated — redirige vers ouvrirDetailPatient */
  ouvrirPrestationsPatient(patient: PatientLigne): void {
    this.ouvrirDetailPatient(patient);
  }

  retourAuxPatients(): void {
    this.vueMode = 'PATIENTS';
    this.patientSelectionne = null;
    if (this.factureSelectionnee) {
      this.patientsDeLaFacture = this.srService.getPatientsPourFacture(this.factureSelectionnee);
      this.recalculerPatients();
    }
  }

  // ===================== MODAL DU DOSSIER (3 PIÈCES) =====================

  ouvrirModalDossier(onglet: 'TOUT' | 'CARTE' | 'TICKET' | 'FEUILLE' = 'TOUT'): void {
    this.ongletDossierActif = onglet;
    this.afficherModalDossier = true;
    this.chargementDossier = true;
    this.factureDossier = null;
    this.dossierActif = null;
    this.documentsDossier = [];
    this.feuilleSoinsDossier = undefined;
    const patient = this.patientSelectionne;
    const factureId = this.factureSelectionnee?.id;
    if (!patient || !factureId || this.factureSelectionnee?.typeEtablissement !== 'STRUCTURE') {
      this.chargementDossier = false;
      return;
    }
    this.srService.getFactureStructure(factureId).subscribe({
      next: (facture: any) => {
        if (this.patientSelectionne?.id !== patient.id || this.factureSelectionnee?.id !== factureId) return;
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
          lettreGarantieNumero: patient.lettreNumero, datePriseEnCharge: patient.datePriseEnCharge,
          pieces: (patient.pieces || []).filter((piece): piece is TypePiece =>
            ['TICKET_CAISSE', 'CNI_RECTO', 'CNI_VERSO', 'EXTRAIT_NAISSANCE', 'CARTE_ASSURE', 'PHOTO_ASSURE'].includes(piece)
          )
        };
        const lettreNumero = this.dossierActif?.lettreGarantieNumero || patient.lettreNumero;
        this.documentsDossier = (facture.documentsComplementaires || []).filter((doc: any) =>
          (!!patient.matricule && doc.patientMatricule === patient.matricule) ||
          (!!lettreNumero && doc.lettreGarantieNumero === lettreNumero)
        );
        const feuille = lignesPatient.find((l: any) => l.feuilleSoinsId);
        this.feuilleSoinsDossier = feuille?.feuilleSoinsId
          ? { id: feuille.feuilleSoinsId, numero: feuille.feuilleSoinsNumero || feuille.feuilleSoinsId }
          : undefined;
        this.chargementDossier = false;
      },
      error: () => {
        if (this.patientSelectionne?.id !== patient.id) return;
        this.chargementDossier = false;
        this.snackBar.open('Impossible de charger les pièces du dossier patient.', 'Fermer', { duration: 4500 });
      }
    });
  }

  fermerModalDossier(): void {
    this.afficherModalDossier = false;
    this.chargementDossier = false;
    this.factureDossier = null;
    this.dossierActif = null;
    this.documentsDossier = [];
    this.feuilleSoinsDossier = undefined;
  }

  recalculerPatients(): void {
    const q = (this.searchPatient || '').toLowerCase().trim();
    if (!q) {
      this.patientsFiltres = this.patientsDeLaFacture;
      return;
    }
    this.patientsFiltres = this.patientsDeLaFacture.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q) ||
      p.cni.toLowerCase().includes(q) ||
      (p.datePriseEnCharge && p.datePriseEnCharge.includes(q)) ||
      p.prestations.some(pr => pr.designation.toLowerCase().includes(q) || pr.codeActe.toLowerCase().includes(q))
    );
  }

  actualiserIdentiteCartePatient(): void {
    const p = this.patientSelectionne;
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
    this.recalculerPatients();

    // Mettre à jour le patient sélectionné s'il est affiché sur la page des prestations
    if (this.patientSelectionne) {
      const updated = this.patientsDeLaFacture.find(p => p.id === this.patientSelectionne!.id);
      if (updated) {
        this.patientSelectionne = updated;
        this.actualiserIdentiteCartePatient();
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
    this.recalculerPatients();

    // Mettre à jour le patient sélectionné s'il est affiché
    if (this.patientSelectionne) {
      const updated = this.patientsDeLaFacture.find(p => p.id === this.patientSelectionne!.id);
      if (updated) {
        this.patientSelectionne = updated;
        this.actualiserIdentiteCartePatient();
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

  formatDateHeure(date?: string, heure?: string): string {
    const jour = this.formatDate(date);
    const h = (heure || '').substring(0, 5);
    return h && jour !== '-' ? `${jour} à ${h}` : jour;
  }

  getInitiales(prenom?: string, nom?: string): string {
    const p = prenom ? prenom.charAt(0).toUpperCase() : '';
    const n = nom ? nom.charAt(0).toUpperCase() : '';
    return `${p}${n}` || 'SN';
  }

  // ===================== HELPERS DE PERFORMANCE =====================
  trackById(_index: number, item: any): string {
    return item?.id || String(_index);
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
