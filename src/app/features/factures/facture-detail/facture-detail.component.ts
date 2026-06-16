import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';
import { Facture, LigneFacture, LigneDecisionRequest, StatutFacture, StatutLigne } from '../../../core/models/facture.model';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';

interface PatientGroup {
  nom?: string;
  matricule?: string;
  ticketCaisse?: string;
  bonCommande?: string;
  ordonnance?: string;
  lignes: { ligne: LigneFacture; index: number }[];
}

@Component({
  selector: 'app-facture-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    StatusBadgeComponent
  ],
  templateUrl: './facture-detail.component.html',
  styleUrls: ['./facture-detail.component.css']
})
export class FactureDetailComponent implements OnInit {
  facture!: Facture;

  // Pièces justificatives affichées dans le dossier patient
  readonly photoFields: { key: 'ticketCaisse' | 'bonCommande' | 'ordonnance'; label: string }[] = [
    { key: 'ticketCaisse', label: 'Ticket de caisse' },
    { key: 'bonCommande', label: 'Bon de commande' },
    { key: 'ordonnance', label: 'Ordonnance' }
  ];
  dossierPatient: PatientGroup | null = null;
  viewerImage: string | null = null;

  // Rejet par ligne (SR)
  rejetLigneIndex: number | null = null;
  rejetLigneMotif = '';
  rejetLigneSubmitting = false;

  /** Colonne "Décision" affichée pour les services (régional/central) ou si des décisions existent déjà. */
  get showDecision(): boolean {
    return this.authService.isServiceRegional() ||
      this.authService.isServiceCentral() ||
      (this.facture?.lignes || []).some(l => l.statutLigne && l.statutLigne !== StatutLigne.EN_ATTENTE);
  }

  /** True si le SR peut décider ligne par ligne (facture ENVOYEE). */
  get canDeciderLignes(): boolean {
    return this.authService.isServiceRegional() && this.facture?.statut === StatutFacture.ENVOYEE;
  }

  /** Regroupe les lignes par patient : le nom n'apparaît qu'une fois (rowspan). */
  get patientGroups(): PatientGroup[] {
    const groups: PatientGroup[] = [];
    const byKey = new Map<string, PatientGroup>();
    (this.facture?.lignes || []).forEach((ligne, index) => {
      const key = (ligne.patientMatricule || '') + '|' + (ligne.patientNomPrenom || '');
      let g = byKey.get(key);
      if (!g) {
        g = {
          nom: ligne.patientNomPrenom,
          matricule: ligne.patientMatricule,
          ticketCaisse: ligne.ticketCaisse,
          bonCommande: ligne.bonCommande,
          ordonnance: ligne.ordonnance,
          lignes: []
        };
        byKey.set(key, g);
        groups.push(g);
      }
      g.lignes.push({ ligne, index });
    });
    return groups;
  }

  trackGroup(_i: number, g: PatientGroup): string {
    return (g.matricule || '') + '|' + (g.nom || '');
  }

  dossierCount(g: PatientGroup): number {
    return [g.ticketCaisse, g.bonCommande, g.ordonnance].filter(p => !!p).length;
  }

  openDossier(g: PatientGroup) {
    this.dossierPatient = g;
  }



  countLignes(statut: string): number {
    return (this.facture?.lignes || []).filter(l => (l.statutLigne || StatutLigne.EN_ATTENTE) === statut).length;
  }

  lineTagClass(statut?: StatutLigne): string {
    switch (statut) {
      case StatutLigne.ACCEPTEE: return 'tag-ok';
      case StatutLigne.REJETEE: return 'tag-ko';
      default: return 'tag-wait';
    }
  }

  lineTagLabel(statut?: StatutLigne): string {
    switch (statut) {
      case StatutLigne.ACCEPTEE: return 'Acceptée';
      case StatutLigne.REJETEE: return 'Rejetée';
      default: return 'En attente';
    }
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private factureService: FactureService,
    public authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('id');
        if (id) this.loadFacture(id);
      });
  }

  loadFacture(id: string) {
    this.factureService.getById(id).subscribe((data: Facture) => {
      this.facture = data;
    });
  }

  goBack() {
    // Retour vers la liste « factures » du rôle courant (la route /dashboard/factures n'existe pas)
    if (this.authService.isPharmacien()) {
      this.router.navigate(['/dashboard/espace-pharmacie'], { queryParams: { tab: 1 } });
    } else if (this.authService.isServiceRegional()) {
      this.router.navigate(['/dashboard/espace-region'], { queryParams: { tab: 1 } });
    } else if (this.authService.isServiceCentral()) {
      this.router.navigate(['/dashboard/espace-central'], { queryParams: { tab: 1 } });
    } else {
      this.router.navigate(['/dashboard/regions']);
    }
  }

  exportExcel() {
    this.factureService.exportFactureExcel(this.facture.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(this.facture.mois)}_${this.facture.annee}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export Excel réussi', 'Fermer', { duration: 3000 });
      },
      error: (err: any) => this.showError(err)
    });
  }

  envoyer() {
    this.openConfirm('Envoyer la facture', 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.', () => {
      this.factureService.envoyer(this.facture.id).subscribe({
        next: (f: Facture) => this.facture = f,
        error: (e: any) => this.showError(e)
      });
    });
  }

  valider() {
    const commentaire = prompt("Commentaire de validation (optionnel) :") || "";
    this.factureService.valider(this.facture.id, { commentaire }).subscribe({
      next: (f: Facture) => {
        this.facture = f;
        this.snackBar.open('Facture validée avec succès', 'Fermer', { duration: 3000 });
      },
      error: (e: any) => this.showError(e)
    });
  }

  rejeter() {
    const commentaire = prompt("Motif du rejet (OBLIGATOIRE) :");
    if (!commentaire || !commentaire.trim()) {
      this.snackBar.open('Le motif est obligatoire pour un rejet', 'Fermer', { duration: 3000 });
      return;
    }
    
    this.openConfirm('Rejeter la facture', 'Êtes-vous sûr de vouloir rejeter cette facture ?', () => {
      this.factureService.rejeter(this.facture.id, { commentaire }).subscribe({
        next: (f: Facture) => {
          this.facture = f;
          this.snackBar.open('Facture rejetée avec succès', 'Fermer', { duration: 3000 });
        },
        error: (e: any) => this.showError(e)
      });
    });
  }

  renvoyerAPharmacie() {
    this.openConfirm(
      'Renvoyer à la pharmacie',
      'Êtes-vous sûr de vouloir renvoyer cette facture rejetée par le central à la pharmacie pour correction ?',
      () => {
        this.factureService.renvoyerAPharmacie(this.facture.id).subscribe({
          next: (f: Facture) => {
            this.facture = f;
            this.snackBar.open('Facture renvoyée à la pharmacie avec succès', 'Fermer', { duration: 3000 });
          },
          error: (e: any) => this.showError(e)
        });
      }
    );
  }

  payer() {
    this.openConfirm(
      'Payer la facture',
      'Confirmer le paiement de cette facture ?',
      () => {
        this.factureService.payer(this.facture.id).subscribe({
          next: (f: Facture) => {
            this.facture = f;
            this.snackBar.open('Paiement enregistré avec succès', 'Fermer', { duration: 3000 });
          },
          error: (e: any) => this.showError(e)
        });
      }
    );
  }

  openRejetLigne(index: number) {
    this.rejetLigneIndex = index;
    this.rejetLigneMotif = '';
  }

  closeRejetLigne() {
    this.rejetLigneIndex = null;
    this.rejetLigneMotif = '';
  }

  confirmDeciderLigne(index: number, accepter: boolean) {
    if (!accepter && !this.rejetLigneMotif.trim()) return;
    this.rejetLigneSubmitting = true;
    const req: LigneDecisionRequest = {
      accepter,
      motif: accepter ? undefined : this.rejetLigneMotif.trim()
    };
    this.factureService.deciderLigne(this.facture.id, index, req).subscribe({
      next: (f: Facture) => {
        this.facture = f;
        this.closeRejetLigne();
        this.rejetLigneSubmitting = false;
        this.snackBar.open(accepter ? 'Ligne acceptée' : 'Ligne rejetée', 'Fermer', { duration: 2500 });
      },
      error: (e: any) => {
        this.rejetLigneSubmitting = false;
        this.showError(e);
      }
    });
  }

  private openConfirm(title: string, message: string, onConfirm: () => void) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: { title, message, confirmText: 'Confirmer', cancelText: 'Annuler' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) onConfirm();
    });
  }

  private showError(err: any) {
    this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }
}
