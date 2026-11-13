import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SrGestionService, FactureAssigneeResume, PostePolariseRow } from '../services/sr-gestion.service';
import { DossiersGlobauxService } from '../services/dossiers-globaux.service';
import { FactureStructure, DossierPatient, LigneFactureStructure, StructureSanitaire, typeEffectifStructure } from '../../../core/models/structure.model';
import { StructureService } from '../../../core/services/structure.service';
import { DistrictService } from '../../../core/services/district.service';
import { AuthService } from '../../../core/services/auth.service';
import { District } from '../../../core/models/referentiel.model';
import { apparenceStatut } from '../../../core/models/statuts';
import { FactureCountService } from '../../../core/services/facture-count.service';
import { telecharger } from '../../espace-poste/poste-facturation';

export interface StructureEntonnoir {
  id: string;
  code: string;
  nom: string;
  type: 'EPS' | 'DISTRICT';
  ville?: string;
  nombrePostesCentres?: number;
  montantTotal: number;
  nombreFactures: number;
  nombreBeneficiaires: number;
  statutsFactures: string[];
}

export interface RegimeEntonnoir {
  code: string;
  libelle: string;
  couleur: string;
  montantTotal: number;
  nombreMoisFactures: number;
  nombreBeneficiaires: number;
}

export interface MoisEntonnoir {
  mois: number;
  nomMois: string;
  facturee: boolean; // Si facturée -> affichée en VERT
  factureId?: string;
  numeroFacture?: string;
  montantTotal?: number;
  montantSencsu?: number;
  nombreBeneficiaires?: number;
  statut?: string; // A_TRAITER, EN_COURS_SR, VALIDEE_SR, REJETEE_SR, ENVOYEE_NC
  controleurNom?: string;
  commentaireRejet?: string;
}

export interface PatientLigneDetail {
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
  statutLigne: string; // CONFORME, REJETEE
  motifRejet?: string;
  prestations: LigneFactureStructure[];
  pieces: string[];
}

@Component({
  selector: 'app-factures-structures',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './factures-structures.component.html'
})
export class FacturesStructuresComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  // Niveau dans l'entonnoir :
  // 1 = Liste des 4 hôpitaux et 9 districts
  // 15 = Postes de santé polarisés du district sanitaire sélectionné
  // 2 = Régimes de la structure ou du poste choisi
  // 3 = Mois du régime choisi (mois facturés en vert)
  // 4 = Facture d'un mois sélectionné (Bénéficiaires style poste de santé)
  // 5 = Page Prestations du patient sélectionné (Dossier dessus, Prestations en dessous)
  niveauEntonnoir: 1 | 15 | 2 | 3 | 4 | 5 = 1;

  structures: StructureEntonnoir[] = [];
  facturesCourantes: FactureAssigneeResume[] = [];
  structureSelectionnee: StructureEntonnoir | null = null;

  // Postes polarisés du district sanitaire
  postesDuDistrict: PostePolariseRow[] = [];
  posteSelectionne: PostePolariseRow | null = null;
  searchPoste = '';
  filtreStatutFacture = '';

  regimes: RegimeEntonnoir[] = [];
  regimeSelectionne: RegimeEntonnoir | null = null;

  annee = new Date().getFullYear();
  anneesDispo = [2026, 2025, 2024];
  moisFiltre: number | null = null;
  filtreStatutMois = ''; // filtre tous les statuts

  moisListe: MoisEntonnoir[] = [];
  moisSelectionne: MoisEntonnoir | null = null;

  // Facture active (niveau 4)
  factureActive: FactureStructure | null = null;
  factureActiveResume: FactureAssigneeResume | null = null;
  exportPdfEnCours = false;
  patients: PatientLigneDetail[] = [];
  patientSelectionne: PatientLigneDetail | null = null;
  patientSelectionnePourDossier: PatientLigneDetail | null = null;
  afficherModalDossier = false;

  // Recherche patient
  searchPatient = '';

  // Modal Modifier Prestation
  afficherModalModifPrestation = false;
  prestationAModifier: any = null;
  patientDePrestation: PatientLigneDetail | null = null;
  formModifPrestation = {
    designation: '',
    codeActe: '',
    quantite: 1,
    prixUnitaire: 0
  };

  // Modal Supprimer Prestation
  afficherModalSupprPrestation = false;
  prestationASupprimer: any = null;
  patientDePrestationASupprimer: PatientLigneDetail | null = null;

  // Modal Supprimer Facture
  afficherModalSupprFacture = false;
  factureASupprimer: FactureAssigneeResume | null = null;

  // Modal de rejet
  afficherModalRejet = false;
  typeRejetActuel: 'FACTURE' | 'PATIENT' | 'PRESTATION' = 'FACTURE';
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
    private structureService: StructureService,
    private districtService: DistrictService,
    public auth: AuthService,
    private snackBar: MatSnackBar,
    public factureCount: FactureCountService
  ) {}

  ngOnInit(): void {
    this.initialiserStructures();
    this.factureCount.newStructureIdsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.rafraichirFacturesCourantes());
  }

  // ===================== NIVEAU 1 : LES 4 HÔPITAUX ET 9 DISTRICTS =====================

  initialiserStructures(): void {
    this.loading = true;
    const regionId = this.auth.getCurrentUser()?.regionId;
    forkJoin({
      factures: this.srService.getToutesFacturesResumes().pipe(catchError(() => of([]))),
      structures: this.structureService.getStructures().pipe(catchError(() => of([] as StructureSanitaire[]))),
      districts: this.districtService.getDistricts(regionId || undefined).pipe(catchError(() => of([] as District[])))
    }).pipe(
      map(({ factures, structures, districts }) => {
        const facturesAnnee = factures.filter(f => this.factureDansPeriode(f));
        this.facturesCourantes = facturesAnnee.filter(f => f.typeEtablissement === 'STRUCTURE');
        const structuresParDistrict = new Map<string, StructureSanitaire[]>();
        for (const structure of structures) {
          if (!structure.districtId) continue;
          const groupe = structuresParDistrict.get(structure.districtId) || [];
          groupe.push(structure);
          structuresParDistrict.set(structure.districtId, groupe);
        }

        const eps: StructureEntonnoir[] = structures
          .filter(s => typeEffectifStructure(s) === 'EPS')
          .map(s => {
            const facturesEps = facturesAnnee.filter(f => f.etablissementId === s.id);
            return {
              id: s.id,
              code: s.code,
              nom: s.nom,
              type: 'EPS' as const,
              montantTotal: facturesEps.reduce((sum, f) => sum + f.montantTotal, 0),
              nombreFactures: facturesEps.length,
              nombreBeneficiaires: facturesEps.reduce((sum, f) => sum + f.nombreBeneficiaires, 0),
              statutsFactures: Array.from(new Set(facturesEps.map(f => f.statut)))
            };
          });

        const districtsRegion = regionId
          ? districts.filter(d => !d.regionId || d.regionId === regionId)
          : districts;
        const districtsListe: StructureEntonnoir[] = districtsRegion.map(d => {
          const structuresDistrict = structuresParDistrict.get(d.id) || [];
          const idsStructures = new Set(structuresDistrict.map(s => s.id));
          const facturesDistrict = facturesAnnee.filter(f =>
            f.districtId === d.id || idsStructures.has(f.etablissementId)
          );
          return {
            id: d.id,
            code: d.code,
            nom: d.nom,
            type: 'DISTRICT' as const,
            nombrePostesCentres: structuresDistrict.filter(s => {
              const type = typeEffectifStructure(s);
              return type === 'PS' || type === 'CS';
            }).length,
            montantTotal: facturesDistrict.reduce((sum, f) => sum + f.montantTotal, 0),
            nombreFactures: facturesDistrict.length,
            nombreBeneficiaires: facturesDistrict.reduce((sum, f) => sum + f.nombreBeneficiaires, 0),
            statutsFactures: Array.from(new Set(facturesDistrict.map(f => f.statut)))
          };
        });

        // Garder tous les établissements : ceux ayant des factures apparaissent d'abord.
        const comparerDistricts = (a: StructureEntonnoir, b: StructureEntonnoir) =>
          b.nombreFactures - a.nombreFactures || a.nom.localeCompare(b.nom, 'fr');
        const districtsAvecFactures = districtsListe
          .filter(d => d.nombreFactures > 0)
          .sort(comparerDistricts);
        const districtsSansFacture = districtsListe
          .filter(d => d.nombreFactures === 0)
          .sort(comparerDistricts);
        const epsAvecFactures = eps.filter(s => s.nombreFactures > 0).sort(comparerDistricts);
        const epsSansFacture = eps.filter(s => s.nombreFactures === 0).sort(comparerDistricts);
        // Conserver les vrais identifiants backend (UUID) pour le chargement des détails.
        return [...districtsAvecFactures, ...epsAvecFactures, ...districtsSansFacture, ...epsSansFacture];
      })
    ).subscribe({
      next: list => {
        this.structures = list;
        this.loading = false;
      },
      error: () => {
        this.structures = [];
        this.loading = false;
        this.snackBar.open('Impossible de charger les structures et leurs factures.', 'Fermer', { duration: 5000 });
      }
    });
  }

  private rafraichirFacturesCourantes(): void {
    this.srService.getToutesFacturesResumes().subscribe(factures => {
      this.facturesCourantes = factures.filter(f =>
        f.typeEtablissement === 'STRUCTURE' && this.factureDansPeriode(f)
      );
    });
  }

  nouvellesFacturesStructure(structure: StructureEntonnoir): number {
    return this.facturesCourantes.filter(f =>
      f.typeEtablissement === 'STRUCTURE' &&
      (structure.type === 'EPS'
        ? f.etablissementId === structure.id
        : f.districtId === structure.id || f.districtNom === structure.nom) &&
      this.factureCount.isNewStructureInvoice(f.id)
    ).length;
  }

  nouvellesFacturesPoste(poste: PostePolariseRow): number {
    return this.facturesCourantes.filter(f =>
      f.typeEtablissement === 'STRUCTURE' &&
      (f.posteId === poste.id || f.etablissementId === poste.id) &&
      this.factureCount.isNewStructureInvoice(f.id)
    ).length;
  }

  estDistrict(s: any): boolean {
    if (!s) return false;
    return s.type === 'DISTRICT' || (s.nom && s.nom.toLowerCase().includes('district'));
  }

  changerMoisFiltre(): void {
    if (this.niveauEntonnoir === 1) {
      this.initialiserStructures();
    } else if (this.niveauEntonnoir === 15 && this.structureSelectionnee) {
      this.chargerPostesDuDistrict(this.structureSelectionnee.id);
    }
  }

  private factureDansPeriode(facture: Pick<FactureAssigneeResume, 'annee' | 'mois'>): boolean {
    return facture.annee === this.annee && (!this.moisFiltre || facture.mois === this.moisFiltre);
  }

  selectionnerStructure(s: StructureEntonnoir): void {
    this.structureSelectionnee = s;
    this.posteSelectionne = null;
    this.regimeSelectionne = null;
    this.moisSelectionne = null;
    this.patientSelectionne = null;

    if (this.estDistrict(s)) {
      // Si district sanitaire -> Niveau 15 (Postes de santé polarisés)
      this.niveauEntonnoir = 15;
      this.searchPoste = '';
      this.filtreStatutFacture = '';
      this.chargerPostesDuDistrict(s.id);
    } else {
      // Si hôpital (EPS) -> Niveau 2 (Régimes)
      this.niveauEntonnoir = 2;
      this.chargerRegimesDeLaStructure(s);
    }
  }

  // ===================== NIVEAU 1.5 : POSTES POLARISÉS DU DISTRICT =====================

  chargerPostesDuDistrict(districtId: string): void {
    this.loading = true;
    this.srService.getPostesPolarises(districtId, this.annee, this.moisFiltre || undefined).subscribe(list => {
      this.postesDuDistrict = list;
      this.loading = false;
    });
  }

  selectionnerPoste(p: PostePolariseRow): void {
    this.posteSelectionne = p;
    this.regimeSelectionne = null;
    this.moisSelectionne = null;
    this.patientSelectionne = null;
    this.niveauEntonnoir = 2;
    this.chargerRegimesDuPoste(p);
  }

  get postesFiltres(): PostePolariseRow[] {
    const q = this.searchPoste.toLowerCase().trim();
    return this.postesDuDistrict.filter(p =>
      (!q || p.nom.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) &&
      this.posteCorrespondAuFiltreStatut(p)
    );
  }

  private posteCorrespondAuFiltreStatut(poste: PostePolariseRow): boolean {
    return !this.filtreStatutFacture || poste.statutsFactures.some(statut =>
      this.statutCorrespondAuFiltre(statut, this.filtreStatutFacture)
    );
  }

  private statutCorrespondAuFiltre(statut: string, filtre: string): boolean {
    const statutsEnvoyes = ['SOUMISE_CS', 'ENVOYEE', 'A_TRAITER', 'ENVOYEE_NC'];
    const statutsRejetes = ['REJETEE_CS', 'REJETEE_SR', 'REJETEE_NC'];
    const statutsValides = ['VALIDEE_SR', 'VALIDEE_NC', 'PAYEE'];
    const statutsEnCours = ['EN_COURS_SR'];
    const statutsConnus = [...statutsEnvoyes, ...statutsRejetes, ...statutsValides, ...statutsEnCours];

    switch (filtre) {
      case 'ENVOYEE': return statutsEnvoyes.includes(statut);
      case 'REJETEE': return statutsRejetes.includes(statut);
      case 'VALIDEE': return statutsValides.includes(statut);
      case 'EN_COURS': return statutsEnCours.includes(statut);
      case 'AUTRE': return !statutsConnus.includes(statut);
      default: return true;
    }
  }

  libelleStatut(statut?: string): string {
    return apparenceStatut(statut).libelle;
  }

  classeStatut(statut?: string): string {
    return apparenceStatut(statut).classe;
  }

  get totalMontantPostes(): number {
    return this.postesDuDistrict.reduce((sum, p) => sum + p.montantTotal, 0);
  }

  get totalSencsuPostes(): number {
    return this.postesDuDistrict.reduce((sum, p) => sum + p.montantSencsu, 0);
  }

  get totalFacturesPostes(): number {
    return this.postesDuDistrict.reduce((sum, p) => sum + p.nombreFactures, 0);
  }

  // ===================== NIVEAU 2 : RÉGIMES DE LA STRUCTURE OU DU POSTE =====================

  chargerRegimesDeLaStructure(s: StructureEntonnoir): void {
    this.srService.getToutesFacturesResumes().subscribe(all => {
      const fSiennes = all.filter(f => f.etablissementId === s.id && this.factureDansPeriode(f));

      this.regimes = this.srService.REGIMES_LIST.map(r => {
        const fDuRegime = fSiennes.filter(f => f.regime === r.code);
        const moisDistincts = new Set(fDuRegime.map(f => f.mois));

        return {
          code: r.code,
          libelle: r.libelle,
          couleur: r.couleur,
          montantTotal: fDuRegime.reduce((sum, f) => sum + f.montantTotal, 0),
          nombreMoisFactures: moisDistincts.size,
          nombreBeneficiaires: fDuRegime.reduce((sum, f) => sum + f.nombreBeneficiaires, 0)
        };
      }).filter(r => r.nombreMoisFactures > 0);
    });
  }

  chargerRegimesDuPoste(p: PostePolariseRow): void {
    this.srService.getToutesFacturesResumes().subscribe(all => {
      const fSiennes = all.filter(f => (f.posteId === p.id || f.etablissementId === p.id) && this.factureDansPeriode(f));

      this.regimes = this.srService.REGIMES_LIST.map(r => {
        const fDuRegime = fSiennes.filter(f => f.regime === r.code);
        const moisDistincts = new Set(fDuRegime.map(f => f.mois));

        return {
          code: r.code,
          libelle: r.libelle,
          couleur: r.couleur,
          montantTotal: fDuRegime.reduce((sum, f) => sum + f.montantTotal, 0),
          nombreMoisFactures: moisDistincts.size,
          nombreBeneficiaires: fDuRegime.reduce((sum, f) => sum + f.nombreBeneficiaires, 0)
        };
      }).filter(r => r.nombreMoisFactures > 0);
    });
  }

  selectionnerRegime(r: RegimeEntonnoir): void {
    this.regimeSelectionne = r;
    this.moisSelectionne = null;
    this.patientSelectionne = null;
    this.filtreStatutMois = '';
    this.niveauEntonnoir = 3;
    this.chargerMoisDuRegime();
  }

  // ===================== NIVEAU 3 : LES MOIS (MOIS FACTURÉS EN VERT) =====================

  chargerMoisDuRegime(): void {
    if ((!this.structureSelectionnee && !this.posteSelectionne) || !this.regimeSelectionne) return;

    const cibleId = this.posteSelectionne ? this.posteSelectionne.id : this.structureSelectionnee!.id;

    this.srService.getToutesFacturesResumes().subscribe(all => {
      const fDuMois = all.filter(f =>
        (f.etablissementId === cibleId || f.posteId === cibleId) &&
        f.regime === this.regimeSelectionne!.code &&
        this.factureDansPeriode(f)
      );

      const fMap = new Map<number, FactureAssigneeResume>();
      fDuMois.forEach(f => fMap.set(f.mois, f));

      const moisRes: MoisEntonnoir[] = [];
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

  get moisFiltres(): MoisEntonnoir[] {
    return this.moisListe.filter(m =>
      m.facturee && (!this.filtreStatutMois || this.statutCorrespondAuFiltre(m.statut || '', this.filtreStatutMois))
    );
  }

  selectionnerMois(m: MoisEntonnoir): void {
    if (!m.facturee) return; // Seuls les mois facturés peuvent s'ouvrir
    this.factureCount.markStructureInvoiceSeen(m.factureId);
    this.moisSelectionne = m;
    this.patientSelectionne = null;
    this.niveauEntonnoir = 4;
    this.chargerFactureDuMois(m);
  }

  // ===================== NIVEAU 4 : LA FACTURE DU MOIS (PATIENTS PAR LIGNE) =====================

  chargerFactureDuMois(m: MoisEntonnoir): void {
    this.loading = true;
    this.srService.getToutesFacturesResumes().subscribe({
      next: all => {
      const facResume = all.find(f => f.id === m.factureId);
      if (!facResume) {
        this.loading = false;
        this.snackBar.open('Cette facture est introuvable dans le backend. Actualisez la liste.', 'Fermer', { duration: 4000 });
        return;
      }

      this.factureActiveResume = facResume;

      // Si le statut est À traiter et ouvert en contrôle, le passer à En cours SR
      if (facResume.statut === 'A_TRAITER') {
        this.srService.changerStatutFacture(facResume.id, 'EN_COURS_SR');
        facResume.statut = 'EN_COURS_SR';
        m.statut = 'EN_COURS_SR';
      }

      // Générer des données patient riches et réalistes pour ce mois
      this.genererPatientsFacture(facResume);
      this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Impossible de charger la facture depuis le backend.', 'Fermer', { duration: 4000 });
      }
    });
  }

  private genererPatientsFacture(fac: FactureAssigneeResume): void {
    this.patients = this.srService.getPatientsPourFacture(fac) as PatientLigneDetail[];
  }

  get patientsFiltres(): PatientLigneDetail[] {
    if (!this.searchPatient) return this.patients;
    const q = this.searchPatient.toLowerCase().trim();
    return this.patients.filter(p =>
      p.nom.toLowerCase().includes(q) ||
      p.prenom.toLowerCase().includes(q) ||
      p.matricule.toLowerCase().includes(q) ||
      p.cni.toLowerCase().includes(q)
    );
  }

  // ===================== ACTIONS DU CONTRÔLEUR & DOSSIERS GLOBAUX =====================

  /**
   * Bouton « Dossiers globaux des patients » : télécharge un ZIP contenant un PDF par patient
   * regroupant la photo de la carte, la photo du ticket et l'attestation de soins.
   */
  async telechargerDossiersGlobaux(): Promise<void> {
    if (!this.factureActiveResume) return;

    this.telechargementEnCours = true;
    this.snackBar.open('Génération des dossiers globaux en cours... Veuillez patienter.', 'OK', { duration: 3000 });

    try {
      const factStruct = this.factureActiveResume.factureOrigine as FactureStructure | undefined;
      if (!factStruct) throw new Error('La facture backend ne contient pas son détail.');
      await this.dossiersGlobaux.telechargerDossiersGlobauxStructure(factStruct);
      this.snackBar.open('Dossiers globaux téléchargés avec succès !', 'Fermer', { duration: 4000 });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Erreur lors de la création du fichier ZIP des dossiers.', 'Fermer', { duration: 4000 });
    } finally {
      this.telechargementEnCours = false;
    }
  }

  telechargerExcel(): void {
    if (!this.factureActiveResume) return;
    this.structureService.exportFactureExcel(this.factureActiveResume.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.factureActiveResume?.numero || 'Structure'}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.snackBar.open('Téléchargement Excel de contrôle démarré.', 'OK', { duration: 3000 });
      }
    });
  }

  get pdfListeEtFacture(): boolean {
    return !!this.factureActiveResume && this.factureActiveResume.regime !== 'ZERO_CINQ_ANS';
  }

  telechargerPdf(): void {
    const facture = this.factureActiveResume;
    if (!facture || this.exportPdfEnCours) return;

    this.exportPdfEnCours = true;
    const exportPdf = this.pdfListeEtFacture
      ? this.structureService.exportEnfantsPdf(facture.id)
      : this.structureService.exportFacturePdf(facture.id);

    exportPdf.subscribe({
      next: blob => {
        this.exportPdfEnCours = false;
        const suffixe = this.pdfListeEtFacture ? 'liste_et_facture' : 'facture';
        telecharger(blob, `${facture.numero}_${suffixe}.pdf`);
      },
      error: () => {
        this.exportPdfEnCours = false;
        this.snackBar.open('Génération du PDF impossible. Réessayez.', 'Fermer', { duration: 4000 });
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

  ouvrirModalRejetPatient(p: PatientLigneDetail): void {
    this.typeRejetActuel = 'PATIENT';
    this.cibleRejetId = p.id;
    this.cibleRejetNom = `le patient ${p.prenom} ${p.nom} (${p.matricule})`;
    this.motifRejetInput = '';
    this.afficherModalRejet = true;
  }

  ouvrirModalRejetPrestation(p: PatientLigneDetail, lIndex: number): void {
    this.typeRejetActuel = 'PRESTATION';
    this.cibleRejetId = `${p.id}-l${lIndex + 1}`;
    this.cibleRejetNom = `la prestation « ${p.prestations[lIndex]?.designation} »`;
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
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: this.motifRejetInput
      });
      this.factureActiveResume!.statut = 'REJETEE_SR';
      this.factureActiveResume!.commentaireRejet = this.motifRejetInput;
    } else if (this.typeRejetActuel === 'PATIENT') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: `Rejet patient : ${this.motifRejetInput}`,
        rejetPatient: { patientKey: this.cibleRejetId, motif: this.motifRejetInput }
      });
      this.factureActiveResume!.statut = 'REJETEE_SR';
      const pat = this.patients.find(p => p.id === this.cibleRejetId);
      if (pat) {
        pat.statutLigne = 'REJETEE';
        pat.motifRejet = this.motifRejetInput;
        pat.prestations.forEach(pr => {
          pr.statutLigne = 'REJETEE';
          pr.motifRejet = this.motifRejetInput;
        });
      }
    } else if (this.typeRejetActuel === 'PRESTATION') {
      this.srService.changerStatutFacture(facId, 'REJETEE_SR', {
        motif: `Rejet prestation : ${this.motifRejetInput}`,
        rejetLigne: { ligneKey: this.cibleRejetId, motif: this.motifRejetInput }
      });
      this.factureActiveResume!.statut = 'REJETEE_SR';
      // Mettre à jour la prestation dans l'affichage
      this.patients.forEach(pat => {
        pat.prestations.forEach((pr, idx) => {
          if (`${pat.id}-l${idx + 1}` === this.cibleRejetId) {
            pr.statutLigne = 'REJETEE';
            pr.motifRejet = this.motifRejetInput;
            pat.statutLigne = 'REJETEE';
          }
        });
      });
    }

    if (this.moisSelectionne) {
      this.moisSelectionne.statut = 'REJETEE_SR';
    }

    this.afficherModalRejet = false;
    this.snackBar.open('Rejet motivé enregistré et transmis à la structure !', 'OK', { duration: 4000 });
  }

  validerFacture(): void {
    if (!this.factureActiveResume) return;
    this.srService.changerStatutFacture(this.factureActiveResume.id, 'VALIDEE_SR');
    this.factureActiveResume.statut = 'VALIDEE_SR';
    if (this.moisSelectionne) {
      this.moisSelectionne.statut = 'VALIDEE_SR';
    }
    this.snackBar.open('Facture validée avec succès par le Service Régional !', 'OK', { duration: 4000 });
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

  voirDossierPatient(p: PatientLigneDetail): void {
    this.patientSelectionnePourDossier = p;
    this.afficherModalDossier = true;
  }

  fermerModalDossier(): void {
    this.afficherModalDossier = false;
  }

  // ===================== NAVIGATION PATIENT & PRESTATIONS (STYLE POSTE DE SANTÉ) =====================

  ouvrirPrestationsPatient(p: PatientLigneDetail): void {
    this.patientSelectionne = p;
    this.patientSelectionnePourDossier = p;
    this.niveauEntonnoir = 5;
  }

  retourALaFacture(): void {
    this.patientSelectionne = null;
    this.niveauEntonnoir = 4;
  }

  // ===================== MODIFICATION & SUPPRESSION DE PRESTATION EN TEMPS RÉEL =====================

  ouvrirModalModifPrestation(patient: PatientLigneDetail, pr: any): void {
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
    if (!this.factureActiveResume || !this.patientDePrestation || !this.prestationAModifier) return;
    if (!this.formModifPrestation.designation.trim()) {
      this.snackBar.open('La désignation de la prestation est obligatoire', 'OK', { duration: 3000 });
      return;
    }
    if (this.formModifPrestation.quantite <= 0 || this.formModifPrestation.prixUnitaire < 0) {
      this.snackBar.open('La quantité et le prix unitaire doivent être valides', 'OK', { duration: 3000 });
      return;
    }

    this.srService.modifierPrestation(
      this.factureActiveResume.id,
      this.patientDePrestation.id,
      this.prestationAModifier.id || `${this.patientDePrestation.id}-l1`,
      this.formModifPrestation
    );

    // Mettre à jour l'affichage local immédiatement
    this.prestationAModifier.designation = this.formModifPrestation.designation;
    this.prestationAModifier.codeActe = this.formModifPrestation.codeActe;
    this.prestationAModifier.quantite = Number(this.formModifPrestation.quantite);
    this.prestationAModifier.prixUnitaire = Number(this.formModifPrestation.prixUnitaire);
    this.prestationAModifier.montant = this.prestationAModifier.quantite * this.prestationAModifier.prixUnitaire;
    this.prestationAModifier.montantSencsu = Math.round(this.prestationAModifier.montant * 0.8);
    this.prestationAModifier.montantBeneficiaire = Math.round(this.prestationAModifier.montant * 0.2);

    this.patientDePrestation.montantTotal = this.patientDePrestation.prestations.reduce((sum, pr) => sum + (pr.montant || 0), 0);

    const totalFacture = this.patients.reduce((sum, p) => sum + p.montantTotal, 0);
    this.factureActiveResume.montantTotal = totalFacture;
    this.factureActiveResume.montantSencsu = Math.round(totalFacture * 0.8);
    if (this.moisSelectionne) {
      this.moisSelectionne.montantTotal = totalFacture;
      this.moisSelectionne.montantSencsu = Math.round(totalFacture * 0.8);
    }

    this.afficherModalModifPrestation = false;
    this.snackBar.open('Prestation modifiée avec succès. Montants recalculés en temps réel !', 'OK', { duration: 4000 });
  }

  ouvrirModalSupprPrestation(patient: PatientLigneDetail, pr: any): void {
    this.patientDePrestationASupprimer = patient;
    this.prestationASupprimer = pr;
    this.afficherModalSupprPrestation = true;
  }

  confirmerSuppressionPrestation(): void {
    if (!this.factureActiveResume || !this.patientDePrestationASupprimer || !this.prestationASupprimer) return;

    this.srService.supprimerPrestation(
      this.factureActiveResume.id,
      this.patientDePrestationASupprimer.id,
      this.prestationASupprimer.id || `${this.patientDePrestationASupprimer.id}-l1`
    );

    // Retirer la prestation de la liste locale du patient
    this.patientDePrestationASupprimer.prestations = this.patientDePrestationASupprimer.prestations.filter(
      pr => pr !== this.prestationASupprimer
    );
    this.patientDePrestationASupprimer.montantTotal = this.patientDePrestationASupprimer.prestations.reduce(
      (sum, pr) => sum + (pr.montant || 0), 0
    );

    const totalFacture = this.patients.reduce((sum, p) => sum + p.montantTotal, 0);
    this.factureActiveResume.montantTotal = totalFacture;
    this.factureActiveResume.montantSencsu = Math.round(totalFacture * 0.8);
    this.factureActiveResume.nombreBeneficiaires = this.patients.filter(p => p.prestations.length > 0).length;

    if (this.moisSelectionne) {
      this.moisSelectionne.montantTotal = totalFacture;
      this.moisSelectionne.montantSencsu = Math.round(totalFacture * 0.8);
      this.moisSelectionne.nombreBeneficiaires = this.factureActiveResume.nombreBeneficiaires;
    }

    this.afficherModalSupprPrestation = false;
    this.snackBar.open('Prestation supprimée. Totaux et décompte bénéficiaires recalculés en temps réel !', 'OK', { duration: 4000 });
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

  getInitiales(prenom?: string, nom?: string): string {
    const p = prenom ? prenom.charAt(0).toUpperCase() : '';
    const n = nom ? nom.charAt(0).toUpperCase() : '';
    return `${p}${n}` || 'SN';
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

  // ===================== NAVIGATION DANS LE FIL D'ARIANE =====================

  allerAuNiveau(n: 1 | 15 | 2 | 3 | 4 | 5): void {
    if (n === 1) {
      this.structureSelectionnee = null;
      this.posteSelectionne = null;
      this.regimeSelectionne = null;
      this.moisSelectionne = null;
      this.patientSelectionne = null;
      this.niveauEntonnoir = 1;
    } else if (n === 15) {
      this.posteSelectionne = null;
      this.regimeSelectionne = null;
      this.moisSelectionne = null;
      this.patientSelectionne = null;
      this.niveauEntonnoir = 15;
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
