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
import { Facture, LigneFacture, StatutFacture, StatutLigne } from '../../../core/models/facture.model';
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

          <ng-container *ngIf="authService.isPharmacien() && (facture.statut === 'BROUILLON' || facture.statut === 'REJETEE_SR')">
            <a class="btn btn-outline" [routerLink]="['edit']">
              <mat-icon>edit</mat-icon> {{ facture.statut === 'REJETEE_SR' ? 'Corriger' : 'Modifier' }}
            </a>
            <button class="btn btn-primary" (click)="envoyer()">
              <mat-icon>send</mat-icon> {{ facture.statut === 'REJETEE_SR' ? 'Renvoyer' : 'Envoyer' }}
            </button>
          </ng-container>

          <ng-container *ngIf="authService.isServiceRegional()">
            <ng-container *ngIf="facture.statut === 'ENVOYEE'">
              <button class="btn btn-danger" (click)="rejeter()">
                <mat-icon>cancel</mat-icon> Rejeter
              </button>
              <button class="btn btn-primary" (click)="valider()">
                <mat-icon>check_circle</mat-icon> Valider et Transmettre
              </button>
            </ng-container>
            <ng-container *ngIf="facture.statut === 'REJETEE_NC'">
              <button class="btn btn-warning" (click)="renvoyerAPharmacie()">
                <mat-icon>undo</mat-icon> Renvoyer à la pharmacie
              </button>
            </ng-container>
          </ng-container>

          <ng-container *ngIf="authService.isServiceCentral()">
            <ng-container *ngIf="facture.statut === 'VALIDEE_SR'">
              <button class="btn btn-danger" (click)="rejeter()">
                <mat-icon>cancel</mat-icon> Rejeter
              </button>
              <button class="btn btn-primary" (click)="valider()">
                <mat-icon>check_circle</mat-icon> Valider
              </button>
            </ng-container>
            <ng-container *ngIf="facture.statut === 'VALIDEE_NC'">
              <button class="btn btn-teal" (click)="payer()">
                <mat-icon>payment</mat-icon> Enregistrer Paiement
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
          <span class="info-label">Lignes</span>
          <span class="info-value">{{ facture.lignes?.length || 0 }}</span>
        </div>
        <div class="info-divider"></div>
        <div class="info-block">
          <span class="info-label">Montant Total</span>
          <span class="info-value montant">{{ facture.montantTotal | number }} CFA</span>
        </div>
      </div>

      <!-- Rejection notice -->
      <div class="reject-card" *ngIf="(facture.statut === 'REJETEE_SR' || facture.statut === 'REJETEE_NC') && facture.commentaireRejet">
        <mat-icon>error</mat-icon>
        <div>
          <strong>Motif du rejet</strong>
          <p>{{ facture.commentaireRejet }}</p>
        </div>
      </div>

      <!-- Correction notice (pharmacien) -->
      <div class="correction-card" *ngIf="facture.statut === 'REJETEE_SR'">
        <mat-icon>build</mat-icon>
        <div>
          <strong>Facture à corriger ({{ countLignes('REJETEE') }} ligne(s) rejetée(s))</strong>
          <p>Les lignes rejetées sont signalées ci-dessous avec leur motif.
            <ng-container *ngIf="authService.isPharmacien()">Cliquez sur <em>Corriger</em> pour les modifier, puis <em>Renvoyer</em>.</ng-container>
          </p>
        </div>
      </div>



      <!-- Détail mobile : une carte par patient -->
      <div class="m-cards">
        <div class="m-card" *ngFor="let g of patientGroups; trackBy: trackGroup">
          <div class="m-card-top">
            <span class="m-title">{{ g.nom || 'Patient sans nom' }}</span>
            <button class="dossier-btn" type="button" *ngIf="dossierCount(g) > 0" (click)="openDossier(g)">
              <mat-icon>folder</mat-icon> {{ dossierCount(g) }}
            </button>
          </div>
          <div class="m-sub">{{ g.matricule || '—' }}</div>
          <div class="med-line" *ngFor="let item of g.lignes" [class.rejected]="item.ligne.statutLigne === 'REJETEE'">
            <div class="med-head">
              <span class="med-name">{{ item.ligne.medicament }}</span>
              <span class="line-tag" *ngIf="showDecision" [ngClass]="lineTagClass(item.ligne.statutLigne)">
                {{ lineTagLabel(item.ligne.statutLigne) }}
              </span>
            </div>
            <div class="med-calc">
              {{ item.ligne.quantite }} × {{ item.ligne.prixUnitaire | number }} =
              <strong>{{ item.ligne.montant | number }} CFA</strong>
            </div>
            <div class="line-motif" *ngIf="item.ligne.statutLigne === 'REJETEE' && item.ligne.motifRejet">
              <mat-icon>info</mat-icon> {{ item.ligne.motifRejet }}
            </div>
          </div>
        </div>
        <div class="empty-state" *ngIf="patientGroups.length === 0">
          <mat-icon>medication</mat-icon>
          <p>Aucune ligne dans cette facture</p>
        </div>
      </div>

      <!-- Medications Table (desktop) -->
      <mat-card class="table-card desktop-only">
        <div class="card-title-row">
          <h2>Détail des médicaments</h2>
          <span class="line-count">{{ facture.lignes?.length || 0 }} ligne(s)</span>
        </div>
        <div class="table-scroll">
          <table class="detail-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Dossier</th>
                <th>Médicament</th>
                <th>Qté</th>
                <th>Prix Unit.</th>
                <th>Montant</th>
                <th *ngIf="showDecision">Décision</th>
              </tr>
            </thead>
            <tbody>
              <ng-container *ngFor="let g of patientGroups; trackBy: trackGroup">
                <tr *ngFor="let item of g.lignes; let first = first"
                    [class.row-rejected]="item.ligne.statutLigne === 'REJETEE'"
                    [class.group-start]="first">
                  <!-- Patient : affiché une seule fois par dossier -->
                  <td *ngIf="first" [attr.rowspan]="g.lignes.length" class="patient-cell">
                    <div class="patient-name">{{ g.nom || '-' }}</div>
                    <div class="patient-mat">{{ g.matricule || '-' }}</div>
                  </td>
                  <!-- Dossier : pièces justificatives, une seule fois par patient -->
                  <td *ngIf="first" [attr.rowspan]="g.lignes.length" class="dossier-cell">
                    <button class="dossier-btn" *ngIf="dossierCount(g) > 0; else noDossier" (click)="openDossier(g)">
                      <mat-icon>folder</mat-icon>
                      <span>Dossier</span>
                      <span class="dossier-count">{{ dossierCount(g) }}</span>
                    </button>
                    <ng-template #noDossier><span class="no-dossier">—</span></ng-template>
                  </td>
                  <td>{{ item.ligne.medicament }}</td>
                  <td>{{ item.ligne.quantite }}</td>
                  <td>{{ item.ligne.prixUnitaire | number }}</td>
                  <td [class.line-rejected]="item.ligne.statutLigne === 'REJETEE'">
                    <strong>{{ item.ligne.montant | number }}</strong>
                  </td>
                  <td *ngIf="showDecision">
                    <!-- Lecture seule : badge de statut -->
                    <span class="line-tag" [ngClass]="lineTagClass(item.ligne.statutLigne)">
                      {{ lineTagLabel(item.ligne.statutLigne) }}
                    </span>
                    <div class="line-motif" *ngIf="item.ligne.statutLigne === 'REJETEE' && item.ligne.motifRejet">
                      <mat-icon>info</mat-icon> {{ item.ligne.motifRejet }}
                    </div>
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </mat-card>

      <!-- Modal Dossier : pièces justificatives du patient -->
      <div class="dossier-overlay" *ngIf="dossierPatient" (click)="dossierPatient = null">
        <div class="dossier-modal" (click)="$event.stopPropagation()">
          <div class="dossier-modal-head">
            <div>
              <h3>Dossier — {{ dossierPatient.nom || '-' }}</h3>
              <span class="dossier-modal-mat">{{ dossierPatient.matricule || '-' }}</span>
            </div>
            <button class="dossier-modal-close" (click)="dossierPatient = null"><mat-icon>close</mat-icon></button>
          </div>
          <div class="dossier-modal-body">
            <ng-container *ngFor="let p of photoFields">
              <div class="dossier-piece" *ngIf="dossierPatient[p.key]">
                <span class="dossier-piece-label">{{ p.label }}</span>
                <img [src]="dossierPatient[p.key]" [alt]="p.label" (click)="viewerImage = dossierPatient[p.key]!">
              </div>
            </ng-container>
          </div>
        </div>
      </div>

      <!-- Visionneuse plein écran -->
      <div class="img-viewer" *ngIf="viewerImage" (click)="viewerImage = null">
        <button type="button" class="viewer-close"><mat-icon>close</mat-icon></button>
        <img [src]="viewerImage" alt="Pièce justificative" (click)="$event.stopPropagation()">
      </div>
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

    /* Tableau détaillé groupé par patient */
    .table-scroll { overflow-x: auto; }
    .detail-table { width: 100%; border-collapse: collapse; }
    .detail-table thead th {
      text-align: left;
      padding: 14px 16px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      background: #F8FAFC;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .detail-table td {
      padding: 12px 16px;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .detail-table tr.group-start td { border-top: 2px solid var(--border); }
    .detail-table tbody tr:first-child td { border-top: none; }
    .patient-cell { background: #FCFDFE; min-width: 150px; }
    .patient-name { font-weight: 600; color: var(--text-primary); }
    .patient-mat { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
    .dossier-cell { background: #FCFDFE; }
    .dossier-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px;
      border: 1px solid var(--primary); background: var(--primary-light);
      color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.15s ease;
    }
    .dossier-btn:hover { background: var(--primary); color: #fff; }
    .dossier-btn mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .dossier-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
      background: rgba(0,0,0,0.08); font-size: 11px; font-weight: 700;
    }
    .no-dossier { color: var(--text-muted); }

    /* Modal dossier */
    .dossier-overlay {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(17,24,39,0.55);
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .dossier-modal {
      background: #fff; border-radius: 16px; width: 100%; max-width: 640px;
      max-height: 88vh; overflow: hidden; display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .dossier-modal-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 18px 22px; border-bottom: 1px solid var(--border);
    }
    .dossier-modal-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
    .dossier-modal-mat { font-size: 13px; color: var(--text-secondary); }
    .dossier-modal-close {
      width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--border);
      background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
      color: var(--text-secondary);
    }
    .dossier-modal-body {
      padding: 20px 22px; overflow-y: auto;
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px;
    }
    .dossier-piece { display: flex; flex-direction: column; gap: 6px; }
    .dossier-piece-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
    .dossier-piece img {
      width: 100%; height: 150px; object-fit: cover; border-radius: 10px;
      border: 1px solid var(--border); cursor: zoom-in;
    }

    /* Visionneuse plein écran */
    .img-viewer {
      position: fixed; inset: 0; z-index: 1100;
      background: rgba(0,0,0,0.85);
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .img-viewer img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
    .viewer-close {
      position: absolute; top: 18px; right: 18px; width: 44px; height: 44px; border-radius: 50%;
      border: none; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }

    /* Lignes médicaments dans les cartes mobiles */
    .med-line {
      padding: 10px 0;
      border-top: 1px solid var(--border-light);
      margin-top: 10px;
    }
    .med-line.rejected { background: #FEF2F2; margin: 10px -16px 0; padding: 10px 16px; }
    .med-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .med-name { font-weight: 600; font-size: 14px; }
    .med-calc { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
    .med-calc strong { color: var(--text-primary); }

    @media (max-width: 768px) {
      .hide-mobile { display: none !important; }
      .detail-header { flex-direction: column; }
      .header-actions { width: 100%; }
      .header-actions .btn { flex: 1; justify-content: center; }
      .header-actions app-status-badge { order: -1; }

      .info-strip {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px 10px;
        padding: 16px;
      }
      .info-divider { display: none; }
      .info-block { align-items: flex-start; text-align: left; gap: 3px; }
      .info-value { font-size: 15px; }
      .info-value.montant { font-size: 18px; }
    }
  `]
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

  /** Colonne "Décision" affichée pour les services (régional/central) ou si des décisions existent déjà. */
  get showDecision(): boolean {
    return this.authService.isServiceRegional() ||
      this.authService.isServiceCentral() ||
      (this.facture?.lignes || []).some(l => l.statutLigne && l.statutLigne !== StatutLigne.EN_ATTENTE);
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
