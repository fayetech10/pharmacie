import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FactureService } from '../../../core/services/facture.service';
import { AuthService } from '../../../core/services/auth.service';
import { Facture, StatutFacture, StatutLigne } from '../../../core/models/facture.model';
import { StatusBadgeComponent } from '../../../shared/status-badge/status-badge.component';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-facture-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    StatusBadgeComponent
  ],
  template: `
    <div class="detail-page" *ngIf="facture">
      <!-- Header -->
      <div class="detail-header">
        <div class="header-left">
          <button class="back-btn" (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1>Facture #{{ facture.id | slice:0:8 }}</h1>
            <p>{{ getMonthName(facture.mois) }} {{ facture.annee }} · Soumise le {{ facture.createdAt | date:'dd/MM/yyyy' }}</p>
          </div>
        </div>
        <div class="header-actions">
          <app-status-badge [statut]="facture.statut"></app-status-badge>

          <button class="btn btn-outline" (click)="exportExcel()">
            <mat-icon>table_view</mat-icon> Excel
          </button>

          <ng-container *ngIf="authService.isPharmacien() && (facture.statut === 'BROUILLON' || facture.statut === 'A_CORRIGER')">
            <a class="btn btn-outline" [routerLink]="['edit']">
              <mat-icon>edit</mat-icon> {{ facture.statut === 'A_CORRIGER' ? 'Corriger' : 'Modifier' }}
            </a>
            <button class="btn btn-primary" (click)="envoyer()">
              <mat-icon>send</mat-icon> {{ facture.statut === 'A_CORRIGER' ? 'Renvoyer' : 'Envoyer' }}
            </button>
          </ng-container>

          <ng-container *ngIf="authService.isServiceRegional()">
            <button class="btn btn-primary" (click)="verifier()" *ngIf="facture.statut === 'ENVOYEE'">
              <mat-icon>rule</mat-icon> Vérifier
            </button>
            <ng-container *ngIf="facture.statut === 'EN_VERIFICATION'">
              <button class="btn btn-warning" (click)="renvoyerCorrection()"
                      [disabled]="countLignes('REJETEE') === 0"
                      title="Renvoyer au pharmacien pour corriger les lignes rejetées">
                <mat-icon>undo</mat-icon> Renvoyer pour correction
              </button>
              <button class="btn btn-danger" (click)="rejeter()">
                <mat-icon>cancel</mat-icon> Rejeter tout
              </button>
              <button class="btn btn-teal" (click)="conformer()">
                <mat-icon>thumb_up</mat-icon> Conforme
              </button>
              <button class="btn btn-primary" (click)="valider()">
                <mat-icon>check_circle</mat-icon> Valider
              </button>
            </ng-container>
          </ng-container>
        </div>
      </div>

      <!-- Info Summary -->
      <div class="info-strip">
        <div class="info-block">
          <span class="info-label">Pharmacie</span>
          <span class="info-value">{{ facture.pharmacieNom }}</span>
        </div>
        <div class="info-divider"></div>
        <div class="info-block">
          <span class="info-label">Période</span>
          <span class="info-value">{{ getMonthName(facture.mois) }} {{ facture.annee }}</span>
        </div>
        <div class="info-divider"></div>
        <div class="info-block">
          <span class="info-label">Nombre de lignes</span>
          <span class="info-value">{{ facture.lignes?.length || 0 }}</span>
        </div>
        <div class="info-divider"></div>
        <div class="info-block">
          <span class="info-label">Montant Total</span>
          <span class="info-value montant">{{ facture.montantTotal | number }} CFA</span>
        </div>
      </div>

      <!-- Rejection notice -->
      <div class="reject-card" *ngIf="facture.statut === 'REJETEE' && facture.commentaireRejet">
        <mat-icon>error</mat-icon>
        <div>
          <strong>Motif du rejet</strong>
          <p>{{ facture.commentaireRejet }}</p>
        </div>
      </div>

      <!-- Correction notice (pharmacien) -->
      <div class="correction-card" *ngIf="facture.statut === 'A_CORRIGER'">
        <mat-icon>build</mat-icon>
        <div>
          <strong>Facture à corriger ({{ countLignes('REJETEE') }} ligne(s) rejetée(s))</strong>
          <p>Les lignes rejetées sont signalées ci-dessous avec leur motif.
            <ng-container *ngIf="authService.isPharmacien()">Cliquez sur <em>Corriger</em> pour les modifier, puis <em>Renvoyer</em>.</ng-container>
          </p>
        </div>
      </div>

      <!-- Verification hint -->
      <div class="verif-hint" *ngIf="isLineReviewMode()">
        <mat-icon>rule</mat-icon>
        <div>
          <strong>Vérification ligne par ligne</strong>
          <p>Acceptez ou rejetez chaque ligne (un motif est requis pour un rejet), puis cliquez sur <em>Valider</em>. Seules les lignes acceptées seront facturées.</p>
        </div>
        <span class="verif-recap">
          <span class="ok">{{ countLignes('ACCEPTEE') }} acceptée(s)</span> ·
          <span class="ko">{{ countLignes('REJETEE') }} rejetée(s)</span> ·
          <span class="wait">{{ countLignes('EN_ATTENTE') }} en attente</span>
        </span>
      </div>

      <!-- Medications Table -->
      <mat-card class="table-card">
        <div class="card-title-row">
          <h2>Détail des médicaments</h2>
          <span class="line-count">{{ facture.lignes?.length || 0 }} ligne(s)</span>
        </div>
        <table mat-table [dataSource]="facture.lignes" class="w-100">
          <ng-container matColumnDef="patientMatricule">
            <th mat-header-cell *matHeaderCellDef> Matricule </th>
            <td mat-cell *matCellDef="let ligne"> {{ ligne.patientMatricule || '-' }} </td>
          </ng-container>

          <ng-container matColumnDef="patientNom">
            <th mat-header-cell *matHeaderCellDef> Patient </th>
            <td mat-cell *matCellDef="let ligne"> {{ ligne.patientNomPrenom || '-' }} </td>
          </ng-container>

          <ng-container matColumnDef="medicament">
            <th mat-header-cell *matHeaderCellDef> Médicament </th>
            <td mat-cell *matCellDef="let ligne"> {{ ligne.medicament }} </td>
          </ng-container>

          <ng-container matColumnDef="code">
            <th mat-header-cell *matHeaderCellDef> Code </th>
            <td mat-cell *matCellDef="let ligne"> {{ ligne.codeProduit }} </td>
          </ng-container>

          <ng-container matColumnDef="qte">
            <th mat-header-cell *matHeaderCellDef> Qté </th>
            <td mat-cell *matCellDef="let ligne"> {{ ligne.quantite }} </td>
          </ng-container>

          <ng-container matColumnDef="prix">
            <th mat-header-cell *matHeaderCellDef> Prix Unit. </th>
            <td mat-cell *matCellDef="let ligne"> {{ ligne.prixUnitaire | number }} </td>
          </ng-container>

          <ng-container matColumnDef="montant">
            <th mat-header-cell *matHeaderCellDef> Montant </th>
            <td mat-cell *matCellDef="let ligne"
                [class.line-rejected]="ligne.statutLigne === 'REJETEE'">
              <strong>{{ ligne.montant | number }}</strong>
            </td>
          </ng-container>

          <ng-container matColumnDef="decision">
            <th mat-header-cell *matHeaderCellDef> Décision </th>
            <td mat-cell *matCellDef="let ligne; let i = index">
              <!-- Mode revue : boutons accepter / rejeter -->
              <div class="line-actions" *ngIf="isLineReviewMode()">
                <button class="line-btn ok" [class.active]="ligne.statutLigne === 'ACCEPTEE'"
                        (click)="accepterLigne(i)" title="Accepter la ligne" type="button">
                  <mat-icon>check</mat-icon>
                </button>
                <button class="line-btn ko" [class.active]="ligne.statutLigne === 'REJETEE'"
                        (click)="rejeterLigne(i)" title="Rejeter la ligne" type="button">
                  <mat-icon>close</mat-icon>
                </button>
              </div>
              <!-- Lecture seule : badge de statut -->
              <span class="line-tag" [ngClass]="lineTagClass(ligne.statutLigne)" *ngIf="!isLineReviewMode()">
                {{ lineTagLabel(ligne.statutLigne) }}
              </span>
              <div class="line-motif" *ngIf="ligne.statutLigne === 'REJETEE' && ligne.motifRejet">
                <mat-icon>info</mat-icon> {{ ligne.motifRejet }}
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"
              [class.row-rejected]="row.statutLigne === 'REJETEE'"></tr>
        </table>
      </mat-card>
    </div>
  `,
  styles: [`
    .detail-page {
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header-left h1 {
      font-size: 24px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.02em;
    }
    .header-left p {
      margin: 4px 0 0;
      color: var(--text-secondary);
      font-size: 14px;
    }
    .back-btn {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      color: var(--text-secondary);
    }
    .back-btn:hover {
      background: var(--border-light);
      color: var(--text-primary);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: all 0.2s ease;
    }
    .btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
    }
    .btn-outline {
      background: white;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-outline:hover {
      background: var(--border-light);
    }
    .btn-danger {
      background: var(--warn);
      color: white;
    }
    .btn-danger:hover {
      background: #DC2626;
    }
    .btn-teal {
      background: var(--accent);
      color: white;
    }
    .btn-teal:hover {
      background: #0F766E;
    }
    .btn-warning {
      background: #EA580C;
      color: white;
    }
    .btn-warning:hover:not([disabled]) {
      background: #C2410C;
    }
    .btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .info-strip {
      display: flex;
      align-items: center;
      gap: 0;
      background: white;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      padding: 20px 0;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }
    .info-block {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 6px;
    }
    .info-divider {
      width: 1px;
      height: 40px;
      background: var(--border);
    }
    .info-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
    }
    .info-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .info-value.montant {
      color: var(--primary);
      font-size: 22px;
      font-weight: 700;
    }

    .reject-card {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: #FEF2F2;
      border: 1px solid #FECACA;
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .reject-card mat-icon {
      color: #EF4444;
      margin-top: 2px;
    }
    .reject-card strong {
      color: #B91C1C;
      font-size: 15px;
    }
    .reject-card p {
      margin: 4px 0 0;
      color: #7F1D1D;
      font-size: 14px;
    }

    .correction-card {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      background: #FFF7ED;
      border: 1px solid #FED7AA;
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .correction-card mat-icon { color: #EA580C; margin-top: 2px; }
    .correction-card strong { color: #C2410C; font-size: 15px; }
    .correction-card p { margin: 4px 0 0; color: #9A3412; font-size: 14px; }

    .table-card {
      padding: 0 !important;
      overflow: hidden;
    }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
    }
    .card-title-row h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }
    .line-count {
      font-size: 13px;
      color: var(--text-secondary);
      background: var(--border-light);
      padding: 4px 10px;
      border-radius: 6px;
    }
    .w-100 { width: 100%; }

    /* Bandeau d'aide vérification */
    .verif-hint {
      display: flex;
      gap: 12px;
      align-items: center;
      background: var(--primary-light);
      border: 1px solid var(--primary);
      border-radius: var(--radius);
      padding: 14px 20px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .verif-hint > mat-icon { color: var(--primary); }
    .verif-hint strong { color: var(--primary); font-size: 15px; }
    .verif-hint p { margin: 2px 0 0; font-size: 13px; color: var(--text-secondary); }
    .verif-recap {
      margin-left: auto;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
    }
    .verif-recap .ok { color: var(--accent); }
    .verif-recap .ko { color: var(--warn); }
    .verif-recap .wait { color: var(--text-muted); }

    /* Décision par ligne */
    .line-actions { display: inline-flex; gap: 6px; }
    .line-btn {
      width: 30px; height: 30px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: white;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .line-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .line-btn.ok { color: var(--accent); }
    .line-btn.ok:hover, .line-btn.ok.active { background: var(--accent); color: white; border-color: var(--accent); }
    .line-btn.ko { color: var(--warn); }
    .line-btn.ko:hover, .line-btn.ko.active { background: var(--warn); color: white; border-color: var(--warn); }

    .line-tag {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .line-tag.tag-ok { background: #DCFCE7; color: #15803D; }
    .line-tag.tag-ko { background: #FEE2E2; color: #B91C1C; }
    .line-tag.tag-wait { background: var(--border-light); color: var(--text-secondary); }

    .line-motif {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
      font-size: 12px;
      color: #B91C1C;
    }
    .line-motif mat-icon { font-size: 14px; width: 14px; height: 14px; }

    .row-rejected td { background: #FEF2F2; }
    .line-rejected strong { text-decoration: line-through; color: var(--text-muted); }

    @media (max-width: 768px) {
      .detail-header {
        flex-direction: column;
      }
      .info-strip {
        flex-direction: column;
        gap: 16px;
        padding: 16px;
      }
      .info-divider {
        width: 80%;
        height: 1px;
      }
    }
  `]
})
export class FactureDetailComponent implements OnInit {
  facture!: Facture;

  private readonly baseColumns = ['patientMatricule', 'patientNom', 'medicament', 'code', 'qte', 'prix', 'montant'];

  /** Colonne "Décision" affichée pour les services (régional/central) ou si des décisions existent déjà. */
  get displayedColumns(): string[] {
    const showDecision =
      this.authService.isServiceRegional() ||
      this.authService.isServiceCentral() ||
      (this.facture?.lignes || []).some(l => l.statutLigne && l.statutLigne !== StatutLigne.EN_ATTENTE);
    return showDecision ? [...this.baseColumns, 'decision'] : this.baseColumns;
  }

  /** Vrai quand le service régional peut accepter/rejeter les lignes (facture en vérification). */
  isLineReviewMode(): boolean {
    return this.authService.isServiceRegional() && this.facture?.statut === StatutFacture.EN_VERIFICATION;
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

  accepterLigne(index: number) {
    this.factureService.deciderLigne(this.facture.id, index, { accepter: true }).subscribe({
      next: (f: Facture) => this.facture = f,
      error: (e: any) => this.showError(e)
    });
  }

  rejeterLigne(index: number) {
    const motif = prompt('Motif du rejet de cette ligne (OBLIGATOIRE):');
    if (!motif || !motif.trim()) {
      this.snackBar.open('Le motif est obligatoire pour rejeter une ligne', 'Fermer', { duration: 3000 });
      return;
    }
    this.factureService.deciderLigne(this.facture.id, index, { accepter: false, motif: motif.trim() }).subscribe({
      next: (f: Facture) => this.facture = f,
      error: (e: any) => this.showError(e)
    });
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private factureService: FactureService,
    public authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
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
    this.router.navigate(['/dashboard/factures']);
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

  verifier() {
    this.factureService.verifier(this.facture.id).subscribe({
      next: (f: Facture) => this.facture = f,
      error: (e: any) => this.showError(e)
    });
  }

  conformer() {
    this.factureService.conformer(this.facture.id).subscribe({
      next: (f: Facture) => this.facture = f,
      error: (e: any) => this.showError(e)
    });
  }

  valider() {
    const commentaire = prompt("Commentaire de validation (optionnel):") || "";
    this.factureService.valider(this.facture.id, { commentaire }).subscribe({
      next: (f: Facture) => this.facture = f,
      error: (e: any) => this.showError(e)
    });
  }

  rejeter() {
    const commentaire = prompt("Motif du rejet (OBLIGATOIRE):");
    if (!commentaire) {
      this.snackBar.open('Le motif est obligatoire pour un rejet', 'Fermer', { duration: 3000 });
      return;
    }
    
    this.openConfirm('Rejeter la facture', 'Êtes-vous sûr de vouloir rejeter cette facture ?', () => {
      this.factureService.rejeter(this.facture.id, { commentaire }).subscribe({
        next: (f: Facture) => this.facture = f,
        error: (e: any) => this.showError(e)
      });
    });
  }

  renvoyerCorrection() {
    const rejetees = this.countLignes('REJETEE');
    this.openConfirm(
      'Renvoyer pour correction',
      `Renvoyer cette facture au pharmacien pour corriger ${rejetees} ligne(s) rejetée(s) ?`,
      () => {
        this.factureService.renvoyerPourCorrection(this.facture.id).subscribe({
          next: (f: Facture) => this.facture = f,
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
