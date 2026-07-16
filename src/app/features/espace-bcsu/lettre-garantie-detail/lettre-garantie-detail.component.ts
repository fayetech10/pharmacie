import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BcsuService } from '../../../core/services/bcsu.service';
import { AuthService } from '../../../core/services/auth.service';
import { StructureService } from '../../../core/services/structure.service';
import { LettreGarantie, StatutLettreGarantie, BonCommande, REGIME_LABELS } from '../../../core/models/bcsu.model';
import { ConfirmService } from '../../../core/services/confirm.service';
import { sharePdfOnWhatsApp } from '../../../core/utils/whatsapp-share';

@Component({
  selector: 'app-lettre-garantie-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  templateUrl: './lettre-garantie-detail.component.html',
  styleUrls: ['./lettre-garantie-detail.component.css']
})
export class LettreGarantieDetailComponent implements OnInit {
  readonly regimeLabels = REGIME_LABELS;
  readonly StatutLettreGarantie = StatutLettreGarantie;

  lettre: LettreGarantie | null = null;
  bon: BonCommande | null = null;
  loading = true;
  busy = false;
  /** Nombre de lignes de médicaments (vides) à imprimer sur le bon — le pharmacien les remplit. */
  nombreLignesBon = 3;
  /** Service Régional : consultation seule (pas d'émission/annulation/génération de bon). */
  isSR = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private bcsuService: BcsuService,
    private snackBar: MatSnackBar,
    private confirm: ConfirmService,
    private auth: AuthService,
    private structureService: StructureService
  ) {
    this.isSR = this.auth.isServiceRegional();
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.load(id);
  }

  private load(id: string) {
    this.loading = true;
    this.bcsuService.getLettreGarantie(id).subscribe({
      next: (lettre) => {
        this.lettre = lettre;
        this.loading = false;
        // Si structureNom est vide (anciens dossiers), on le récupère dynamiquement.
        if (!lettre.structureNom && lettre.createdBy) {
          this.structureService.getStructuresByBcsu(lettre.createdBy).subscribe({
            next: (structures) => {
              if (structures.length > 0 && this.lettre) {
                this.lettre = { ...this.lettre, structureNom: structures[0].nom };
              }
            },
            error: () => {} // silencieux : ce n'est pas bloquant
          });
        }
        // Recharge le bon déjà généré, le cas échéant (évite de reproposer la génération).
        if (lettre.statut === StatutLettreGarantie.EMISE) {
          this.bcsuService.getBonByLettre(lettre.id).subscribe(bon => {
            if (bon) this.bon = bon;
          });
        }
      },
      error: () => { this.loading = false; }
    });
  }

  getMotifs(): string {
    if (!this.lettre || !this.lettre.prestations) return '';
    return this.lettre.prestations.map(p => 
      p.motifCesarienne ? `${p.designation} (${p.motifCesarienne})` : p.designation
    ).join(', ');
  }

  emettre() {
    if (!this.lettre) return;
    this.busy = true;
    this.bcsuService.emettreLettreGarantie(this.lettre.id).subscribe({
      next: (lettre) => {
        this.lettre = lettre;
        this.busy = false;
        this.snackBar.open('Lettre de garantie émise', 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  modifier() {
    if (!this.lettre) return;
    this.router.navigate(['/dashboard/lettres-garantie', this.lettre.id, 'edit']);
  }

  annuler() {
    if (!this.lettre) return;
    this.confirm.ask({
      title: 'Annuler ce dossier',
      message: 'Veuillez confirmer l\'annulation de ce dossier. Cette action est irréversible.',
      confirmText: 'Annuler le dossier',
      danger: true
    }).subscribe(ok => {
      if (!ok || !this.lettre) return;
      this.bcsuService.annulerLettreGarantie(this.lettre.id, 'Annulation par l\'agent BCSU').subscribe({
        next: (lettre) => {
          this.lettre = lettre;
          this.snackBar.open('Dossier annulé', 'Fermer', { duration: 3000 });
        },
        error: (err) => this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
      });
    });
  }

  imprimerLettre() {
    if (!this.lettre) return;
    this.bcsuService.exportLettreGarantiePdf(this.lettre.id).subscribe(blob => this.openBlob(blob));
  }

  partagerLettreWhatsApp() {
    if (!this.lettre) return;
    const message = `Lettre de garantie ${this.lettre.numero} - ${this.lettre.patientPrenom} ${this.lettre.patientNom} - Montant SEN-CSU : ${this.lettre.montantTotalSencsu} FCFA`;
    const fileName = `Lettre_Garantie_${this.lettre.numero}.pdf`;
    this.bcsuService.exportLettreGarantiePdf(this.lettre.id).subscribe({
      next: (blob) => this.sharePdf(this.lettre!.patientTelephone, message, blob, fileName),
      error: (err) => this.snackBar.open('Erreur PDF : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  genererBonCommande() {
    if (!this.lettre) return;
    const n = Math.max(1, Math.floor(this.nombreLignesBon || 1));
    this.busy = true;
    this.bcsuService.createBonCommande(this.lettre.id, n).subscribe({
      next: (bon) => {
        this.bon = bon;
        this.busy = false;
        this.snackBar.open('Bon de commande généré : ' + bon.numero, 'Fermer', { duration: 3000 });
      },
      error: (err) => {
        this.busy = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }

  imprimerBon() {
    if (!this.bon) return;
    this.bcsuService.exportBonCommandePdf(this.bon.id).subscribe(blob => this.openBlob(blob));
  }

  partagerBonWhatsApp() {
    if (!this.bon || !this.lettre) return;
    const message = `Bon de commande ${this.bon.numero} - ${this.bon.patientPrenom} ${this.bon.patientNom} - Montant SEN-CSU : ${this.bon.montantTotalSencsu} FCFA`;
    const fileName = `Bon_Commande_${this.bon.numero}.pdf`;
    this.bcsuService.exportBonCommandePdf(this.bon.id).subscribe({
      next: (blob) => this.sharePdf(this.lettre!.patientTelephone, message, blob, fileName),
      error: (err) => this.snackBar.open('Erreur PDF : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' })
    });
  }

  private openBlob(blob: Blob) {
    const url = window.URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => window.URL.revokeObjectURL(url), 10000);
  }

  private async sharePdf(phone: string, message: string, blob: Blob, fileName: string) {
    try {
      const shared = await sharePdfOnWhatsApp(phone, message, blob, fileName);
      this.snackBar.open(
        shared ? 'PDF pret a envoyer via WhatsApp' : 'PDF telecharge. Joignez-le dans WhatsApp.',
        'Fermer',
        { duration: 4000 }
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        this.snackBar.open('Partage impossible : ' + (err?.message || err), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    }
  }
}
