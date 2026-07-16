import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { DomSanitizer } from '@angular/platform-browser';
import { Optional, Inject } from '@angular/core';
import { PatientService } from '../../../core/services/patient.service';
import { BcsuService } from '../../../core/services/bcsu.service';
import { AuthService } from '../../../core/services/auth.service';
import { DossierPatientDto } from '../../../core/models/patient.model';
import { BonCommande, LettreGarantie, REGIME_LABELS, StatutLettreGarantie } from '../../../core/models/bcsu.model';
import { FeuilleSoins, STATUT_FEUILLE_LABELS } from '../../../core/models/feuille-soins.model';
import { FeuilleSoinsService } from '../../../core/services/feuille-soins.service';

export interface PatientDocument {
  titre: string;
  imageB64?: string;
  source: string;
  date: string;
  isDynamicPdf?: boolean;
  dynamicPdfId?: string;
  dynamicPdfType?: 'feuille-soins' | 'lettre-garantie' | 'bon-commande';
}

@Component({
  selector: 'app-patient-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTabsModule
  ],
  templateUrl: './patient-detail.component.html',
  styleUrls: ['./patient-detail.component.css']
})
export class PatientDetailComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly statutFeuilleLabels = STATUT_FEUILLE_LABELS;

  dossier: DossierPatientDto | null = null;
  loading = true;
  documentsLiasse: PatientDocument[] = [];

  /** Délivrance d'un bon de commande depuis le dossier (recherche patient → délivrance). */
  selectedLettreId: string | null = null;
  /** Nombre de lignes de médicaments (vides) à imprimer sur le bon — le pharmacien les remplit. */
  nombreLignesBon = 3;
  delivering = false;

  private patientId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private patientService: PatientService,
    private bcsuService: BcsuService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private sanitizer: DomSanitizer,
    public authService: AuthService,
    private feuilleSoinsService: FeuilleSoinsService,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData: { patientId: string },
    @Optional() public dialogRef: MatDialogRef<PatientDetailComponent>
  ) {}

  ngOnInit() {
    let id = this.route.snapshot.paramMap.get('id');
    if (this.dialogData && this.dialogData.patientId) {
      id = this.dialogData.patientId;
    }
    
    if (id) {
      this.patientId = id;
      this.load(id);
    } else {
      this.snackBar.open('Bénéficiaire introuvable', 'Fermer', { duration: 3000 });
      if (!this.dialogRef) {
        this.router.navigate(['/dashboard/patients']);
      } else {
        this.dialogRef.close();
      }
    }
  }

  load(id: string) {
    this.loading = true;
    this.patientService.getDossierCsu(id).subscribe({
      next: (res) => {
        this.dossier = res;
        
        // Correction pour les anciens dossiers : recalcul des montants CSU s'ils sont à 0
        if (this.dossier.lettresGarantie) {
          this.dossier.lettresGarantie.forEach(lg => {
            if (!lg.montantTotalSencsu && lg.prestations) {
              let mSen = 0;
              const taux = lg.regime === 'CONTRIBUTIF' ? 0.8 : 1.0;
              lg.prestations.forEach(p => {
                let partCsu = p.montantSencsu;
                if (!partCsu && p.montant) partCsu = p.montant * taux;
                mSen += (partCsu || 0);
              });
              lg.montantTotalSencsu = mSen;
            }
          });
        }
        if (this.dossier.bonsCommande) {
          this.dossier.bonsCommande.forEach(bc => {
            if (!bc.montantTotalSencsu) {
              // On récupère le montant de la lettre de garantie correspondante (qui vient d'être corrigée si besoin)
              const lettreAssociee = this.dossier?.lettresGarantie?.find(l => l.id === bc.lettreGarantieId || l.numero === bc.lettreGarantieNumero);
              if (lettreAssociee && lettreAssociee.montantTotalSencsu) {
                bc.montantTotalSencsu = lettreAssociee.montantTotalSencsu;
              } else if (bc.prestations) {
                let mSen = 0;
                const taux = bc.regime === 'CONTRIBUTIF' ? 0.8 : 1.0;
                bc.prestations.forEach(p => {
                  let partCsu = p.montantSencsu;
                  if (!partCsu && p.montant) partCsu = p.montant * taux;
                  mSen += (partCsu || 0);
                });
                bc.montantTotalSencsu = mSen;
              }
            }
          });
        }

        this.loading = false;
        // Présélectionne la lettre à utiliser pour la délivrance du bon.
        const eligibles = this.lettresEligibles;
        this.selectedLettreId = eligibles.length ? eligibles[0].id : null;
        
        this.extractDocuments();
      },
      error: () => {
        this.snackBar.open('Erreur lors de la récupération du dossier consolidé', 'Fermer', { duration: 3000 });
        this.loading = false;
        this.router.navigate(['/dashboard/patients']);
      }
    });
  }

  openLiasseModal(templateRef: any) {
    this.dialog.open(templateRef, {
      width: '90vw',
      maxWidth: '1200px',
      maxHeight: '90vh',
      panelClass: 'liasse-modal'
    });
  }

  private extractDocuments() {
    this.documentsLiasse = [];
    if (!this.dossier) return;

    // 1. Identité depuis les Lettres de Garantie (on prend la plus récente)
    if (this.dossier.lettresGarantie.length > 0) {
      // Tri par date décroissante
      const recentLettres = [...this.dossier.lettresGarantie].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const l = recentLettres[0];
      
      if (l.cniRecto) this.documentsLiasse.push({ titre: 'CNI Recto', imageB64: l.cniRecto, source: 'Dossier ' + l.numero, date: l.createdAt });
      if (l.cniVerso) this.documentsLiasse.push({ titre: 'CNI Verso', imageB64: l.cniVerso, source: 'Dossier ' + l.numero, date: l.createdAt });
      if (l.carteAssureRecto) this.documentsLiasse.push({ titre: 'Carte d\'assuré', imageB64: l.carteAssureRecto, source: 'Dossier ' + l.numero, date: l.createdAt });
      if (l.autreDocument) this.documentsLiasse.push({ titre: l.autreDocumentTitre || 'Autre Document', imageB64: l.autreDocument, source: 'Dossier ' + l.numero, date: l.createdAt });
    }

    // 2. Officine (éviter les doublons de bons de commande/ordonnances pour la même facture/bon)
    const alreadyAdded = new Set<string>();
    this.dossier.lignesFactureOfficine.forEach(lf => {
      const sourceLabel = lf.bonCommandeNumero ? 'Bon ' + lf.bonCommandeNumero : 'Pharmacie';
      
      const addDoc = (titre: string, image: string | undefined | null) => {
        if (!image) return;
        const hash = image.substring(0, 150);
        if (!alreadyAdded.has(hash)) {
          alreadyAdded.add(hash);
          this.documentsLiasse.push({ titre, imageB64: image, source: sourceLabel, date: '' });
        }
      };

      addDoc('Ordonnance Pharmacie', lf.ordonnance);
      addDoc('Ticket de Caisse', lf.ticketCaisse);
    });

    // 3. Structure Sanitaire
    this.dossier.facturesStructure.forEach(fs => {
      const sourceLabel = 'Facture ' + fs.numero;
      
      const addDoc = (titre: string, image: string | undefined | null) => {
        if (!image) return;
        const hash = image.substring(0, 150);
        if (!alreadyAdded.has(hash)) {
          alreadyAdded.add(hash);
          this.documentsLiasse.push({ titre, imageB64: image, source: sourceLabel, date: '' });
        }
      };

      addDoc('Ticket de Caisse (Structure)', fs.ticketCaisse);
      
      if (fs.documentsComplementaires) {
        fs.documentsComplementaires.forEach((doc, idx) => {
          addDoc(doc.titre || `Document Complémentaire ${idx + 1}`, doc.image);
        });
      }
    });
    // 4. Documents générés par le système (PDFs)
    if (this.dossier.feuillesSoins) {
      this.dossier.feuillesSoins.forEach(fs => {
        this.documentsLiasse.push({
          titre: 'Feuille de soins ' + fs.numero,
          source: 'Système',
          date: fs.createdAt,
          isDynamicPdf: true,
          dynamicPdfType: 'feuille-soins',
          dynamicPdfId: fs.id
        });
      });
    }

    if (this.dossier.lettresGarantie) {
      this.dossier.lettresGarantie.forEach(lg => {
        this.documentsLiasse.push({
          titre: 'Lettre de Garantie ' + lg.numero,
          source: 'Système',
          date: lg.createdAt,
          isDynamicPdf: true,
          dynamicPdfType: 'lettre-garantie',
          dynamicPdfId: lg.id
        });
      });
    }

    if (this.dossier.bonsCommande) {
      this.dossier.bonsCommande.forEach(bc => {
        this.documentsLiasse.push({
          titre: 'Bon de commande ' + bc.numero,
          source: 'Système',
          date: bc.createdAt,
          isDynamicPdf: true,
          dynamicPdfType: 'bon-commande',
          dynamicPdfId: bc.id
        });
      });
    }
  }

  selectedDocument: PatientDocument | null = null;
  safePdfUrl: any = null;

  openImagePreview(doc: PatientDocument, templateRef: any) {
    if (!doc) return;
    this.selectedDocument = doc;
    this.safePdfUrl = null;

    if (doc.isDynamicPdf && doc.dynamicPdfId) {
      let req = null;
      if (doc.dynamicPdfType === 'feuille-soins') req = this.feuilleSoinsService.exportPdf(doc.dynamicPdfId);
      if (doc.dynamicPdfType === 'lettre-garantie') req = this.bcsuService.exportLettreGarantiePdf(doc.dynamicPdfId);
      if (doc.dynamicPdfType === 'bon-commande') req = this.bcsuService.exportBonCommandePdf(doc.dynamicPdfId);

      if (req) {
        req.subscribe(blob => {
          const url = window.URL.createObjectURL(blob);
          this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
        });
      }
    } else if (doc.imageB64 && this.isPdf(doc.imageB64)) {
      this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.getImageSrc(doc.imageB64));
    }
    
    this.dialog.open(templateRef, {
      width: '90vw',
      maxWidth: '1200px',
      maxHeight: '95vh',
      panelClass: 'image-preview-modal'
    });
  }

  isPdf(base64?: string): boolean {
    if (!base64) return false;
    if (base64.startsWith('data:application/pdf')) return true;
    if (base64.startsWith('JVBERi0')) return true;
    const cleanStr = base64.replace(/^data:[a-z]+\/[a-z]+;base64,/, '');
    return cleanStr.startsWith('JVBERi0');
  }

  getImageSrc(base64?: string): string {
    if (!base64) return '';
    if (base64.startsWith('data:')) return base64;
    if (base64.startsWith('JVBERi0')) return 'data:application/pdf;base64,' + base64;
    return 'data:image/jpeg;base64,' + base64;
  }

  handleImageError(event: any) {
    event.target.src = 'assets/img/document-placeholder.png'; // Placeholder optionnel ou on peut cacher
    event.target.style.display = 'none';
  }

  /** Feuilles de soins du patient (dossiers antérieurs au déploiement : liste absente). */
  get feuillesSoins(): FeuilleSoins[] {
    return this.dossier?.feuillesSoins || [];
  }

  /** Délivrance d'une feuille de soins préremplie depuis ce dossier (agent bureau). */
  delivrerFeuilleSoins() {
    if (!this.patientId) return;
    this.router.navigate(['/dashboard/feuilles-soins/new'], { queryParams: { patientId: this.patientId } });
  }

  get initials(): string {
    if (!this.dossier?.patient) return '';
    const p = this.dossier.patient.prenom?.charAt(0) || '';
    const n = this.dossier.patient.nom?.charAt(0) || '';
    return (p + n).toUpperCase();
  }

  get totalSencsuPrisEnCharge(): number {
    if (!this.dossier) return 0;

    // Total des lettres de garantie
    const totalLettres = this.dossier.lettresGarantie.reduce((sum, l) => sum + (l.montantTotalSencsu || 0), 0);
    // Total des factures de structures validées ou payées
    const totalStructures = this.dossier.facturesStructure
      .filter(fs => fs.statut !== 'REJETEE_SR' && fs.statut !== 'REJETEE_NC')
      .reduce((sum, fs) => sum + (fs.montantTotalSencsu || 0), 0);

    // Total pharmacie (lignes non rejetées) * taux de prise en charge du régime
    const taux = this.dossier.patient.regime === 'CONTRIBUTIF' ? 0.8 : 1.0;
    const totalPharmacie = this.dossier.lignesFactureOfficine
      .filter(lf => lf.statutLigne !== 'REJETEE')
      .reduce((sum, lf) => sum + (lf.montant * taux || 0), 0);

    return totalLettres + totalStructures + totalPharmacie;
  }

  // ===== Délivrance d'un bon de commande =====

  /** Seuls l'agent BCSU et l'admin peuvent délivrer un bon (règle backend). */
  get canDelivrerBon(): boolean {
    return this.authService.isBcsu() || this.authService.isAdmin();
  }

  /** Lettres émises du patient sans bon de commande déjà généré (règle : un bon par lettre). */
  get lettresEligibles(): LettreGarantie[] {
    if (!this.dossier) return [];
    return this.dossier.lettresGarantie.filter(l =>
      l.statut === StatutLettreGarantie.EMISE &&
      !this.dossier!.bonsCommande.some(b => b.lettreGarantieId === l.id)
    );
  }

  delivrerBon() {
    const lettreId = this.selectedLettreId || this.lettresEligibles[0]?.id;
    if (!lettreId || this.delivering) return;
    const n = Math.max(1, Math.floor(this.nombreLignesBon || 1));
    this.delivering = true;
    this.bcsuService.createBonCommande(lettreId, n).subscribe({
      next: (bon) => {
        this.delivering = false;
        this.snackBar.open('Bon de commande délivré : ' + bon.numero, 'Fermer', { duration: 4000 });
        // Impression immédiate : le bon est remis au patient à la fin de la recherche.
        this.imprimerBonParId(bon.id);
        if (this.patientId) this.load(this.patientId);
      },
      error: (err) => {
        this.delivering = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  getLignesForBon(bonNumero: string) {
    if (!this.dossier || !this.dossier.lignesFactureOfficine) return [];
    return this.dossier.lignesFactureOfficine.filter(lf => lf.bonCommandeNumero === bonNumero);
  }

  imprimerBon(bon: BonCommande) {
    this.imprimerBonParId(bon.id);
  }

  private imprimerBonParId(id: string) {
    this.bcsuService.exportBonCommandePdf(id).subscribe({
      next: (blob) => this.openBlob(blob),
      error: (err) => this.snackBar.open('Erreur PDF : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  imprimerDossierComplet(lettre: LettreGarantie, event: Event) {
    event.stopPropagation();
    
    // Imprimer Lettre de Garantie
    this.bcsuService.exportLettreGarantiePdf(lettre.id).subscribe({
      next: (blob) => this.openBlob(blob),
      error: (err) => this.snackBar.open('Erreur PDF Lettre : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });

    // Chercher et imprimer le bon de commande associé si il existe
    const bon = this.dossier?.bonsCommande.find(b => b.lettreGarantieId === lettre.id);
    if (bon) {
      this.bcsuService.exportBonCommandePdf(bon.id).subscribe({
        next: (blob) => this.openBlob(blob),
        error: (err) => this.snackBar.open('Erreur PDF Bon : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
      });
    }

    // Chercher et imprimer la feuille de soins associée si elle existe
    const feuille = this.feuillesSoins.find(f => f.lettreGarantieId === lettre.id);
    if (feuille) {
      this.feuilleSoinsService.exportPdf(feuille.id).subscribe({
        next: (blob) => this.openBlob(blob),
        error: (err) => this.snackBar.open('Erreur PDF Feuille : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
      });
    }
  }

  imprimerFeuille(feuille: FeuilleSoins, event: Event) {
    event.stopPropagation();
    this.feuilleSoinsService.exportPdf(feuille.id).subscribe({
      next: (blob) => this.openBlob(blob),
      error: (err) => this.snackBar.open('Erreur PDF Feuille : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  private openBlob(blob: Blob) {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }

  // ===== Tonalité des badges de statut (remplace les styles inline conditionnels) =====

  /** Lettre de garantie : EMISE=succès, BROUILLON=attente, ANNULEE=danger. */
  lettreTone(statut: string): string {
    if (statut === 'EMISE') return 'success';
    if (statut === 'BROUILLON') return 'warn';
    return 'danger';
  }

  /** Bon de commande : EMIS=succès, sinon danger. */
  bonTone(statut: string): string {
    return statut === 'EMIS' ? 'success' : 'danger';
  }

  /** Feuille de soins : FACTUREE=succès, ANNULEE=danger, DEPOSEE_STRUCTURE=attente, EMISE=info. */
  feuilleTone(statut: string): string {
    if (statut === 'FACTUREE') return 'success';
    if (statut === 'ANNULEE') return 'danger';
    if (statut === 'DEPOSEE_STRUCTURE') return 'warn';
    return 'info';
  }

  /** Ligne de facture officine : ACCEPTEE=succès, REJETEE=danger, sinon neutre. */
  ligneTone(statut?: string): string {
    if (statut === 'ACCEPTEE') return 'success';
    if (statut === 'REJETEE') return 'danger';
    return 'neutral';
  }

  /** Facture structure : validée/payée=succès, brouillon=attente, rejetée=danger, sinon neutre. */
  factureTone(statut: string): string {
    if (statut === 'VALIDEE_NC' || statut === 'PAYEE') return 'success';
    if (statut === 'BROUILLON') return 'warn';
    if (statut.startsWith('REJETEE')) return 'danger';
    return 'neutral';
  }

  isExportingPdf = false;
  
  exportPdf() {
    if (!this.patientId || !this.dossier) return;
    this.isExportingPdf = true;
    const currentDossier = this.dossier;
    this.patientService.getDossierCsuPdf(this.patientId).subscribe({
      next: (blob) => {
        this.isExportingPdf = false;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Dossier_Consolide_${currentDossier.patient.nom}_${currentDossier.patient.prenom}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.isExportingPdf = false;
        this.snackBar.open('Erreur lors de la génération du PDF', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
      }
    });
  }

  sendPdf() {
    if (!this.patientId || !this.dossier) return;
    this.isExportingPdf = true;
    const currentDossier = this.dossier;
    this.patientService.getDossierCsuPdf(this.patientId).subscribe({
      next: async (blob) => {
        this.isExportingPdf = false;
        const file = new File([blob], `Dossier_Consolide_${currentDossier.patient.nom}_${currentDossier.patient.prenom}.pdf`, { type: 'application/pdf' });
        
        // Nous ignorons navigator.share car il empêche de pré-remplir le numéro de
        // téléphone du patient (obligeant l'utilisateur à enregistrer le contact).
        // À la place, on télécharge le fichier et on ouvre directement wa.me/numero.
        this.snackBar.open('Le fichier va être téléchargé pour envoi via WhatsApp.', 'Fermer', { duration: 5000 });
          this.exportPdf(); // reuse download
          
          setTimeout(() => {
            const phone = currentDossier?.patient?.telephone ? currentDossier.patient.telephone.replace(/\s+/g, '') : '';
            const msg = encodeURIComponent("Bonjour, voici votre dossier bénéficiaire consolidé en pièce jointe.");
            const waUrl = phone ? `https://wa.me/221${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
            window.open(waUrl, '_blank');
          }, 1500);
      },
      error: (err) => {
        this.isExportingPdf = false;
        this.snackBar.open('Erreur lors de la génération du PDF', 'Fermer', { duration: 3000, panelClass: 'error-snackbar' });
      }
    });
  }
}
