import { Component, OnInit, DestroyRef, inject, ViewChild, ElementRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
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
  expanded?: boolean;
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
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    StatusBadgeComponent
  ],
  templateUrl: './facture-detail.component.html',
  styleUrls: ['./facture-detail.component.css']
})
export class FactureDetailComponent implements OnInit {
  facture!: Facture;
  /** Chargement de la facture : évite la page blanche en affichant un indicateur. */
  loading = true;
  loadError = false;

  // Pièces justificatives affichées dans le dossier patient
  readonly photoFields: { key: 'ticketCaisse' | 'bonCommande' | 'ordonnance'; label: string }[] = [
    { key: 'ticketCaisse', label: 'Ticket de caisse' },
    { key: 'bonCommande', label: 'Bon de commande' },
    { key: 'ordonnance', label: 'Ordonnance' }
  ];
  dossierPatient: PatientGroup | null = null;
  viewerImage: string | null = null;

  @ViewChild('importFileInput') importFileInput!: ElementRef<HTMLInputElement>;





  /**
   * Lignes regroupées par patient (le nom n'apparaît qu'une fois — rowspan).
   *
   * IMPORTANT : c'est un CHAMP recalculé via setFacture(), surtout PAS un getter.
   * Un getter renverrait de nouveaux tableaux à chaque cycle de détection de
   * changements ; combiné au champ [(ngModel)] du motif de rejet, cela créait une
   * boucle infinie (NgModel reprogramme un microtask → nouveau rendu → nouvelles
   * références → input recréé → …) qui figeait l'onglet dès l'ouverture du rejet
   * d'une ligne.
   */
  patientGroups: PatientGroup[] = [];

  private buildPatientGroups(): PatientGroup[] {
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
          lignes: [],
          expanded: false
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

  trackLigne(_i: number, item: { ligne: LigneFacture; index: number }): number {
    return item.index;
  }

  dossierCount(g: PatientGroup): number {
    return [g.ticketCaisse, g.bonCommande, g.ordonnance].filter(p => !!p).length;
  }

  openDossier(g: PatientGroup) {
    this.dossierPatient = g;
  }

  toggleGroup(g: PatientGroup) {
    g.expanded = !g.expanded;
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

  /** Affecte la facture courante et reconstruit (une seule fois) les groupes patients. */
  private setFacture(f: Facture) {
    this.facture = f;
    this.patientGroups = this.buildPatientGroups();
  }

  loadFacture(id: string) {
    this.loading = true;
    this.loadError = false;
    this.factureService.getById(id).subscribe({
      next: (data: Facture) => {
        this.setFacture(data);
        this.loading = false;
      },
      error: (e: any) => {
        this.loading = false;
        this.loadError = true;
        this.showError(e);
      }
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

  exportPdf() {
    this.factureService.exportFacturePdf(this.facture.id).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${this.getMonthName(this.facture.mois)}_${this.facture.annee}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.snackBar.open('Export PDF réussi', 'Fermer', { duration: 3000 });
      },
      error: (err: any) => this.showError(err)
    });
  }

  /** Import d'une facture corrigée (Service Régional uniquement) — écrase les données existantes. */
  onImportFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.openConfirm(
      'Importer la facture corrigée',
      `Le fichier « ${file.name} » va remplacer les données actuelles de cette facture. Cette action est irréversible.`,
      () => {
        this.factureService.importFactureExcel(this.facture.id, file).subscribe({
          next: (f: Facture) => {
            this.setFacture(f);
            this.snackBar.open('Facture importée avec succès — données mises à jour', 'Fermer', { duration: 4000 });
          },
          error: (err: any) => this.showError(err)
        });
      }
    );

    // Reset file input so the same file can be re-selected
    input.value = '';
  }

  envoyer() {
    this.openConfirm('Envoyer la facture', 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.', () => {
      this.factureService.envoyer(this.facture.id).subscribe({
        next: () => {
          this.snackBar.open('Facture envoyée avec succès', 'Fermer', { duration: 3000 });
          // Après envoi/renvoi, retour vers « Mes Factures » (goBack redirige le pharmacien vers espace-pharmacie ?tab=1).
          this.goBack();
        },
        error: (e: any) => this.showError(e)
      });
    });
  }

  valider() {
    const transmet = this.authService.isServiceRegional();
    this.openPrompt({
      title: 'Valider la facture',
      message: transmet
        ? 'La facture sera validée et transmise au niveau central.'
        : 'La facture sera validée au niveau central.',
      label: 'Commentaire (optionnel)',
      placeholder: 'Ajouter un commentaire…',
      confirmText: 'Valider',
      required: false,
      maxLength: 500
    }, (commentaire) => {
      this.factureService.valider(this.facture.id, { commentaire }).subscribe({
        next: (f: Facture) => {
          this.setFacture(f);
          this.snackBar.open('Facture validée avec succès', 'Fermer', { duration: 3000 });
        },
        error: (e: any) => this.showError(e)
      });
    });
  }

  rejeter() {
    this.openPrompt({
      title: 'Rejeter la facture',
      message: 'Indiquez le motif du rejet. Il sera transmis pour correction.',
      label: 'Motif du rejet',
      placeholder: 'Ex : pièces justificatives manquantes, quantité non conforme…',
      confirmText: 'Rejeter',
      danger: true,
      required: true,
      maxLength: 500
    }, (motif) => {
      this.factureService.rejeter(this.facture.id, { commentaire: motif }).subscribe({
        next: (f: Facture) => {
          this.setFacture(f);
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
            this.setFacture(f);
            this.snackBar.open('Facture renvoyée à la pharmacie avec succès', 'Fermer', { duration: 3000 });
          },
          error: (e: any) => this.showError(e)
        });
      }
    );
  }

  renvoyerAuCentral() {
    this.openConfirm(
      'Renvoyer au central',
      'Êtes-vous sûr de vouloir renvoyer cette facture au niveau central pour réexamen ?',
      () => {
        this.factureService.renvoyerAuCentral(this.facture.id).subscribe({
          next: (f: Facture) => {
            this.setFacture(f);
            this.snackBar.open('Facture renvoyée au central avec succès', 'Fermer', { duration: 3000 });
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
            this.setFacture(f);
            this.snackBar.open('Paiement enregistré avec succès', 'Fermer', { duration: 3000 });
          },
          error: (e: any) => this.showError(e)
        });
      }
    );
  }



  private openConfirm(title: string, message: string, onConfirm: () => void) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: { title, message, confirmText: 'Confirmer', cancelText: 'Annuler' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) onConfirm();
    });
  }

  /** Modale de saisie (remplace `prompt()`) : appelle `onConfirm` avec la valeur saisie. */
  private openPrompt(
    opts: {
      title: string; message?: string; label?: string; placeholder?: string;
      confirmText?: string; danger?: boolean; required?: boolean; maxLength?: number;
    },
    onConfirm: (value: string) => void
  ) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '460px',
      data: {
        title: opts.title,
        message: opts.message ?? '',
        confirmText: opts.confirmText ?? 'Valider',
        cancelText: 'Annuler',
        danger: opts.danger ?? false,
        prompt: true,
        label: opts.label,
        placeholder: opts.placeholder ?? '',
        required: opts.required ?? false,
        multiline: true,
        maxLength: opts.maxLength
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (typeof result === 'string') onConfirm(result);
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
