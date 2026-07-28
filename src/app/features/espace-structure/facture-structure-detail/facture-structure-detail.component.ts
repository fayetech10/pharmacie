import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StructureService } from '../../../core/services/structure.service';
import { FactureStructure } from '../../../core/models/structure.model';
import { REGIME_LABELS } from '../../../core/models/bcsu.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { AuthService } from '../../../core/services/auth.service';
import { FeuilleSoinsService } from '../../../core/services/feuille-soins.service';
import { MatMenuModule } from '@angular/material/menu';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PatientDetailComponent } from '../../patients/patient-detail/patient-detail.component';

@Component({
  selector: 'app-facture-structure-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule, MatDialogModule, MatMenuModule, StatusBadgeComponent],
  templateUrl: './facture-structure-detail.component.html',
  styleUrls: [
    '../../factures/facture-detail/facture-detail.shared.css',
    './facture-structure-detail.component.css'
  ]
})
export class FactureStructureDetailComponent implements OnInit {
  // Pi�ces justificatives affich�es dans le dossier patient
  dossierPatient: any | null = null;
  viewerImage: string | null = null;
  zoomLevel = 1;
  Math = Math;
  readonly regimeLabels = REGIME_LABELS;
  facture: FactureStructure | null = null;
  patientGroups: any[] = [];
  feuillesSoinsUniques: {id: string, numero: string}[] = [];
  loading = true;
  busy = false;
  exporting = false;

  // --- Pagination & Search ---
  searchPatient: string = '';
  filteredGroups: any[] = [];
  paginatedGroups: any[] = [];
  currentPage: number = 1;
  pageSize: number = 10;

  get totalPages(): number {
    return Math.ceil(this.filteredGroups.length / this.pageSize);
  }

  get pageNumbers(): number[] {
    const pages = [];
    for (let i = 1; i <= this.totalPages; i++) {
      pages.push(i);
    }
    return pages;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private structureService: StructureService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    public auth: AuthService,
    private feuilleSoinsService: FeuilleSoinsService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);
  }

  private load(id: string) {
    this.loading = true;
    this.structureService.getFacture(id).subscribe({
      next: (f) => { 
        this.facture = f; 
        this.buildPatientGroups();
        this.loading = false; 
      },
      error: () => { this.loading = false; }
    });
  }

  get canSend(): boolean {
    return !!this.facture && (this.facture.statut === 'BROUILLON' || this.facture.statut === 'REJETEE_SR' || this.facture.statut === 'REJETEE_CS');
  }

  /** La structure peut modifier/supprimer ses saisies AVANT l'envoi mensuel (ou après rejet). */
  get canEditLines(): boolean {
    return this.auth.isStructureSanitaire() && this.canSend;
  }

  /** Le Service Régional peut valider/rejeter une facture reçue (ENVOYEE). */
  get canReview(): boolean {
    return !!this.facture && this.facture.statut === 'ENVOYEE' && this.auth.isServiceRegional();
  }

  /** Le Centre de Santé peut valider/rejeter la facture d'un poste rattaché (SOUMISE_CS). */
  get canReviewPoste(): boolean {
    return !!this.facture && this.facture.statut === 'SOUMISE_CS' && this.auth.isStructureSanitaire() && !this.auth.isPosteDeSante();
  }

  valider() {
    if (!this.facture) return;
    this.confirm.ask({
      title: 'Valider la facture',
      message: 'Confirmez la validation de cette facture de structure sanitaire.',
      confirmText: 'Valider'
    }).subscribe(ok => {
      if (!ok || !this.facture) return;
      this.busy = true;
      this.structureService.validerFacture(this.facture.id).subscribe({
        next: (f) => { 
          this.facture = f; 
          this.buildPatientGroups();
          this.busy = false; 
          this.snackBar.open('Facture validée', 'Fermer', { duration: 3000 }); 
        },
        error: (err) => { this.busy = false; this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
      });
    });
  }

  rejeter() {
    if (!this.facture) return;
    this.confirm.prompt({
      title: 'Rejeter la facture',
      message: 'Indiquez le motif du rejet. Il sera transmis à la structure pour correction.',
      label: 'Motif du rejet',
      placeholder: 'Ex : pièces manquantes, montant non conforme…',
      confirmText: 'Rejeter',
      danger: true,
      required: true,
      maxLength: 500
    }).subscribe(motif => {
      if (!motif || !this.facture) return;
      this.busy = true;
      this.structureService.rejeterFacture(this.facture.id, motif).subscribe({
        next: (f) => { 
          this.facture = f; 
          this.buildPatientGroups();
          this.busy = false; 
          this.snackBar.open('Facture rejetée', 'Fermer', { duration: 3000 }); 
        },
        error: (err) => { this.busy = false; this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
      });
    });
  }

  validerPoste() {
    if (!this.facture) return;
    this.confirm.ask({
      title: 'Valider la facture du poste',
      message: 'Confirmez la validation de cette facture. Elle sera transmise au Service Régional.',
      confirmText: 'Valider'
    }).subscribe(ok => {
      if (!ok || !this.facture) return;
      this.busy = true;
      this.structureService.validerFacturePoste(this.facture.id).subscribe({
        next: (f) => { 
          this.facture = f; 
          this.buildPatientGroups();
          this.busy = false; 
          this.snackBar.open('Facture validée et transmise', 'Fermer', { duration: 3000 }); 
        },
        error: (err) => { this.busy = false; this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
      });
    });
  }

  rejeterPoste() {
    if (!this.facture) return;
    this.confirm.prompt({
      title: 'Rejeter la facture du poste',
      message: 'Indiquez le motif du rejet. La facture sera renvoyée au poste de santé pour correction.',
      label: 'Motif du rejet',
      placeholder: 'Ex : montants erronés…',
      confirmText: 'Rejeter',
      danger: true,
      required: true,
      maxLength: 500
    }).subscribe(motif => {
      if (!motif || !this.facture) return;
      this.busy = true;
      this.structureService.rejeterFacturePoste(this.facture.id, motif).subscribe({
        next: (f) => { 
          this.facture = f; 
          this.buildPatientGroups();
          this.busy = false; 
          this.snackBar.open('Facture rejetée et renvoyée au poste', 'Fermer', { duration: 3000 }); 
        },
        error: (err) => { this.busy = false; this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
      });
    });
  }

  /** Télécharge l'état récapitulatif nominatif (colonnes selon le régime du classeur CS_EPS). */
  exporterExcel() {
    if (!this.facture) return;
    this.exporting = true;
    const numero = this.facture.numero;
    this.structureService.exportFactureExcel(this.facture.id).subscribe({
      next: (blob: Blob) => {
        this.exporting = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_Structure_${numero}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Excel téléchargé', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.exporting = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  exporterPdf() {
    if (!this.facture) return;
    this.exporting = true;
    const numero = this.facture.numero;
    this.structureService.exportFacturePdf(this.facture.id).subscribe({
      next: (blob: Blob) => {
        this.exporting = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_Structure_${numero}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export PDF téléchargé', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.exporting = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  imprimerFeuille(id: string, numero: string) {
    this.exporting = true;
    this.feuilleSoinsService.exportPdf(id).subscribe({
      next: (blob: Blob) => {
        this.exporting = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Feuille_Soins_${numero}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Feuille de soins téléchargée', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.exporting = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  envoyer() {
    if (!this.facture) return;
    const destination = this.auth.isPosteDeSante() ? 'au Centre de Santé rattaché' : 'au Service Régional';
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: `La facture sera transmise ${destination}. Continuer ?`,
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok || !this.facture) return;
      this.busy = true;
      this.structureService.envoyerFacture(this.facture.id).subscribe({
        next: (f) => { 
          this.facture = f; 
          this.buildPatientGroups();
          this.busy = false; 
          this.snackBar.open(`Facture envoyée ${destination}`, 'Fermer', { duration: 3000 }); 
        },
        error: (err) => { this.busy = false; this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' }); }
      });
    });
  }

  private buildPatientGroups() {
    if (!this.facture || !this.facture.lignes) {
      this.patientGroups = [];
      this.feuillesSoinsUniques = [];
      return;
    }

    const groupsMap = new Map<string, any>();
    const fdsMap = new Map<string, string>();

    for (let i = 0; i < this.facture.lignes.length; i++) {
      const ligne: any = this.facture.lignes[i];
      // Index de la ligne dans la facture (pour modifier / supprimer la prestation).
      ligne._index = i;
      const key = ligne.lettreGarantieNumero || `${ligne.patientPrenom}-${ligne.patientNom}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          patientId: ligne.patientId,
          patientNom: ligne.patientNom,
          patientPrenom: ligne.patientPrenom,
          matricule: ligne.patientMatricule || 'Sans matricule',
          lettreNumero: ligne.lettreGarantieNumero,
          feuilleSoinsId: ligne.feuilleSoinsId,
          feuilleSoinsNumero: ligne.feuilleSoinsNumero,
          // Informations médicales du dossier (une seule fois par patient, pas par ligne).
          numeroRegistre: ligne.numeroRegistre,
          ircIra: ligne.ircIra,
          indicationCbt: ligne.indicationCbt,
          service: ligne.service,
          diagnostique: ligne.diagnostique,
          lignes: [],
          documents: [],
          montantTotal: 0,
          montantBeneficiaire: 0,
          montantSencsu: 0,
          expanded: false
        });
      }

      const group = groupsMap.get(key)!;
      if (ligne.feuilleSoinsId) {
        group.feuilleSoinsId = ligne.feuilleSoinsId;
        group.feuilleSoinsNumero = ligne.feuilleSoinsNumero;
        fdsMap.set(ligne.feuilleSoinsId, ligne.feuilleSoinsNumero || ligne.feuilleSoinsId);
      }
      if (!group.numeroRegistre && ligne.numeroRegistre) group.numeroRegistre = ligne.numeroRegistre;
      if (!group.ircIra && ligne.ircIra) group.ircIra = ligne.ircIra;
      if (!group.indicationCbt && ligne.indicationCbt) group.indicationCbt = ligne.indicationCbt;
      group.lignes.push(ligne);
      group.montantTotal += ligne.montant || 0;
      group.montantBeneficiaire += ligne.montantBeneficiaire || 0;
      group.montantSencsu += ligne.montantSencsu || 0;
    }

    if (this.facture.documentsComplementaires) {
      for (const doc of this.facture.documentsComplementaires) {
        if (doc.lettreGarantieNumero) {
          const group = groupsMap.get(doc.lettreGarantieNumero);
          if (group) {
            group.documents.push(doc);
          }
        }
      }
    }

    // Ticket de caisse enregistré au niveau de la facture (anciennes données) :
    // il doit apparaître dans le dossier (pièces) de chaque patient concerné.
    if (this.facture.ticketCaisse) {
      for (const group of groupsMap.values()) {
        const dejaPresent = group.documents.some((d: any) => (d.titre || '').toLowerCase().includes('ticket'));
        if (!dejaPresent) {
          group.documents.push({ titre: 'Ticket de caisse', image: this.facture.ticketCaisse });
        }
      }
    }

    this.patientGroups = Array.from(groupsMap.values());
    this.feuillesSoinsUniques = Array.from(fdsMap.entries()).map(([id, numero]) => ({ id, numero }));
    this.updatePagination();
  }

  // ===== Modification / suppression des saisies avant envoi =====

  /** Ligne en cours de modification (modale) + valeurs éditées. */
  editingLigne: any | null = null;
  editModel = { designation: '', quantite: 1, prixUnitaire: 0, datePriseEnCharge: '', codeActe: '' };

  ouvrirModificationLigne(ligne: any, event: Event) {
    event.stopPropagation();
    this.editingLigne = ligne;
    this.editModel = {
      designation: ligne.designation || '',
      quantite: ligne.quantite || 1,
      prixUnitaire: ligne.prixUnitaire || 0,
      datePriseEnCharge: ligne.datePriseEnCharge || '',
      codeActe: ligne.codeActe || ''
    };
  }

  fermerModificationLigne() {
    this.editingLigne = null;
  }

  enregistrerModificationLigne() {
    if (!this.facture || !this.editingLigne) return;
    if (!this.editModel.designation.trim() || this.editModel.quantite < 1 || this.editModel.prixUnitaire < 0) {
      this.snackBar.open('Veuillez renseigner une désignation, une quantité (≥ 1) et un prix valide', 'Fermer', { duration: 4000 });
      return;
    }
    this.busy = true;
    this.structureService.updateFactureLigne(this.facture.id, this.editingLigne._index, {
      designation: this.editModel.designation.trim(),
      quantite: this.editModel.quantite,
      prixUnitaire: this.editModel.prixUnitaire,
      datePriseEnCharge: this.editModel.datePriseEnCharge,
      codeActe: this.editModel.codeActe || undefined
    }).subscribe({
      next: (f) => {
        this.facture = f;
        this.buildPatientGroups();
        this.busy = false;
        this.editingLigne = null;
        this.snackBar.open('Prestation modifiée', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  supprimerLigne(ligne: any, event: Event) {
    event.stopPropagation();
    if (!this.facture) return;
    this.confirm.ask({
      title: 'Supprimer la prestation',
      message: `Supprimer « ${ligne.designation} » de la facture ? Cette action est possible tant que la facture n'est pas envoyée.`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok || !this.facture) return;
      this.busy = true;
      this.structureService.deleteFactureLigne(this.facture.id, ligne._index).subscribe({
        next: (f) => {
          this.facture = f;
          this.buildPatientGroups();
          this.busy = false;
          this.snackBar.open('Prestation supprimée', 'Fermer', { duration: 3000 });
        },
        error: (err) => {
          this.busy = false;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  supprimerPatient(g: any, event: Event) {
    event.stopPropagation();
    if (!this.facture || !g.lettreNumero) return;
    this.confirm.ask({
      title: 'Supprimer la ligne du patient',
      message: `Supprimer la saisie de ${g.patientPrenom} ${g.patientNom} (toutes ses prestations et pièces jointes) de la facture mensuelle ?`,
      confirmText: 'Supprimer',
      danger: true
    }).subscribe(ok => {
      if (!ok || !this.facture) return;
      this.busy = true;
      this.structureService.deleteFacturePatient(this.facture.id, g.lettreNumero).subscribe({
        next: (f) => {
          this.facture = f;
          this.buildPatientGroups();
          this.busy = false;
          this.snackBar.open('Saisie du patient supprimée', 'Fermer', { duration: 3000 });
        },
        error: (err) => {
          this.busy = false;
          this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
        }
      });
    });
  }

  toggleGroup(group: any) {
    group.expanded = !group.expanded;
  }

  onSearchChange() {
    this.currentPage = 1;
    this.updatePagination();
  }

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.updatePagination();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  }

  private updatePagination() {
    const term = this.searchPatient.toLowerCase().trim();
    if (term) {
      this.filteredGroups = this.patientGroups.filter(g => 
        (g.patientNom && g.patientNom.toLowerCase().includes(term)) ||
        (g.patientPrenom && g.patientPrenom.toLowerCase().includes(term)) ||
        (g.matricule && g.matricule.toLowerCase().includes(term)) ||
        g.lignes.some((l: any) => l.designation && l.designation.toLowerCase().includes(term))
      );
    } else {
      this.filteredGroups = [...this.patientGroups];
    }
    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.paginatedGroups = this.filteredGroups.slice(startIndex, startIndex + this.pageSize);
  }

  expandAll() {
    this.filteredGroups.forEach(g => g.expanded = true);
  }

  collapseAll() {
    this.filteredGroups.forEach(g => g.expanded = false);
  }

  // --- Viewer Methods ---
  dossierCount(g: any): number {
    return (g.documents ? g.documents.length : 0) + (g.feuilleSoinsId ? 1 : 0);
  }

  openViewer(src: string) {
    this.viewerImage = src;
    this.zoomLevel = 1;
  }

  closeViewer() {
    this.viewerImage = null;
    this.zoomLevel = 1;
  }

  zoomIn() {
    this.zoomLevel = Math.min(this.zoomLevel + 0.25, 3);
  }

  zoomOut() {
    this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.25);
  }

  resetZoom() {
    this.zoomLevel = 1;
  }
  
  openDossierDocs(g: any, event?: Event) {
    if (event) event.stopPropagation();
    this.dossierPatient = g;
  }
  
  closeDossier() {
    this.dossierPatient = null;
  }
  openDossier(group: any, event: Event) {
    event.stopPropagation();
    if (group.patientId) {
      this.dialog.open(PatientDetailComponent, {
        data: { patientId: group.patientId },
        width: '95vw',
        maxWidth: '1200px',
        height: '95vh',
        autoFocus: false
      });
    } else {
      this.snackBar.open('Dossier patient indisponible (identifiant manquant).', 'Fermer', { duration: 3000 });
    }
  }

  private readonly moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  getMonthName(mois: number): string {
    return this.moisNoms[mois] || '';
  }
}

