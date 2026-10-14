import { Component, OnInit, DestroyRef, inject, ViewChild, ElementRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';
import { Facture } from '../../../core/models/facture.model';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  LignePatientListe, ListePatientsFactureComponent, PositionListe
} from '../../../shared/liste-patients-facture/liste-patients-facture.component';
import { EtatListe, EtatListeService } from '../../../shared/pagination/etat-liste.service';
import {
  PatientPharmacie, lignesPatientsPharmacie, patientPharmacieCorrespond, patientsFacturePharmacie
} from '../facture-patients';
import { finDuMoisAtteinte, libelleEnvoiPossible } from '../../../core/utils/fin-de-mois';

/**
 * Détail d'une facture de pharmacie : en-tête, circuit de validation, totaux, puis la liste
 * des patients au gabarit commun à toutes les factures — un tableau sans en-tête, une ligne
 * par patient (nom, nombre de médicaments, matricule). Un clic ouvre l'écran du patient
 * (médicaments, dossier, corrections du pharmacien).
 */
@Component({
  selector: 'app-facture-detail',
  standalone: true,
  imports: [ListePatientsFactureComponent,
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    StatusBadgeComponent
  ],
  templateUrl: './facture-detail.component.html'
})
export class FactureDetailComponent implements OnInit {
  facture!: Facture;

  /** « Envoyer / Renvoyer » n'apparaît qu'à la fin du mois facturé. */
  get finDuMois(): boolean {
    return finDuMoisAtteinte(this.facture?.mois, this.facture?.annee);
  }

  get envoiPossibleLe(): string {
    return libelleEnvoiPossible(this.facture?.mois, this.facture?.annee);
  }

  /** Chargement de la facture : évite la page blanche en affichant un indicateur. */
  loading = true;
  loadError = false;

  @ViewChild('importFileInput') importFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild(ListePatientsFactureComponent) liste?: ListePatientsFactureComponent;

  /**
   * Patients de la facture (le nom n'apparaît qu'une fois) et lignes de la liste.
   *
   * IMPORTANT : ce sont des CHAMPS recalculés via setFacture() / filtrer(), surtout PAS des
   * getters : de nouveaux tableaux à chaque cycle de détection de changements ont déjà figé
   * l'onglet (boucle avec un [(ngModel)]).
   */
  patients: PatientPharmacie[] = [];
  lignesListe: LignePatientListe[] = [];
  searchPatient = '';
  /** Page, recherche et défilement retrouvés en revenant d'un patient. */
  etatRetour?: EtatListe;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private factureService: FactureService,
    public authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private etatListe: EtatListeService
  ) {}

  /** Recalcule la liste affichée (chargement, recherche). */
  filtrer(premierePage = false) {
    if (!this.facture) return;
    const retenus = this.patients.filter(p => patientPharmacieCorrespond(p, this.searchPatient));
    this.lignesListe = lignesPatientsPharmacie(retenus, this.facture.id);
    if (premierePage) this.liste?.premierePage();
  }

  get messageVide(): string {
    return this.searchPatient ? `Aucun patient ne correspond à « ${this.searchPatient} ».` : 'Aucune ligne dans cette facture.';
  }

  private cleEtat(id: string): string {
    return 'facture-pharmacie:' + id;
  }

  /** Un patient s'ouvre : on note où en est la liste, pour y revenir. */
  memoriserPosition(position: PositionListe) {
    if (!this.facture) return;
    this.etatListe.memoriser(this.cleEtat(this.facture.id),
      { ...position, recherche: this.searchPatient, defilement: window.scrollY });
  }

  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const id = params.get('id');
        if (!id) return;
        this.etatRetour = this.etatListe.reprendre(this.cleEtat(id));
        this.searchPatient = this.etatRetour?.recherche || '';
        this.loadFacture(id);
      });
  }

  /** Affecte la facture courante et reconstruit (une seule fois) la liste des patients. */
  private setFacture(f: Facture) {
    this.facture = f;
    this.patients = patientsFacturePharmacie(f);
    this.filtrer();
  }

  loadFacture(id: string) {
    this.loading = true;
    this.loadError = false;
    this.factureService.getById(id).subscribe({
      next: (data: Facture) => {
        this.setFacture(data);
        this.loading = false;
        EtatListeService.defiler(this.etatRetour);
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
      this.router.navigate(['/dashboard/espace-pharmacie/factures']);
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
          // Après envoi/renvoi, retour vers « Mes Factures » (goBack redirige le pharmacien vers espace-pharmacie/factures).
          this.goBack();
        },
        error: (e: any) => this.showError(e)
      });
    });
  }

  valider() {
    const transmet = this.authService.isServiceRegional();
    const title = transmet ? 'Transmettre la facture au central' : 'Valider la facture';
    const message = transmet
      ? 'Êtes-vous sûr de vouloir valider et transmettre cette facture au niveau central ?'
      : 'Confirmer la validation de cette facture au niveau central ?';

    this.openConfirm(title, message, () => {
      this.factureService.valider(this.facture.id).subscribe({
        next: (f: Facture) => {
          this.setFacture(f);
          this.snackBar.open('Facture validée avec succès', 'Fermer', { duration: 3000 });
        },
        error: (e: any) => this.showError(e)
      });
    });
  }

  supprimerFacture() {
    this.openConfirm(
      'Supprimer la facture',
      'Êtes-vous sûr de vouloir supprimer définitivement cette facture ? Cette action est irréversible.',
      () => {
        this.factureService.delete(this.facture.id).subscribe({
          next: () => {
            this.snackBar.open('Facture supprimée avec succès', 'Fermer', { duration: 3000 });
            this.router.navigate(['/dashboard']);
          },
          error: (e: any) => this.showError(e)
        });
      }
    );
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
