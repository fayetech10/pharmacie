import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FactureService } from '../../core/services/facture.service';
import { StatsService } from '../../core/services/stats.service';
import { AuthService } from '../../core/services/auth.service';
import { MedicamentService } from '../../core/services/medicament.service';
import { Facture, StatutFacture } from '../../core/models/facture.model';
import { Medicament, StatutMedicament } from '../../core/models/medicament.model';
import { StatusBadgeComponent } from '../../shared/status-badge/status-badge.component';
import { ConfirmService } from '../../core/services/confirm.service';
import { compressImageToDataUrl } from '../../core/utils/image-compression';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

type PhotoKey = 'ticketCaisse' | 'bonCommande' | 'ordonnance';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatTooltipModule,
    StatusBadgeComponent,
    BaseChartDirective
  ],
  template: `
    <div class="dashboard-page">
      <!-- Welcome (autres rôles uniquement) -->
      <div class="welcome-section" *ngIf="!authService.isPharmacien()">
        <div>
          <h1>Bonjour, {{ currentUser?.prenom }} 👋</h1>
          <p>Vue d'ensemble de l'activité CSU</p>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid" *ngIf="!authService.isPharmacien()">
        <div class="kpi-card">
          <div class="kpi-icon blue">
            <mat-icon>receipt_long</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ totalFactures }}</span>
            <span class="kpi-label">Total Factures</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon green">
            <mat-icon>payments</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ montantTotal | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="kpi-label">Montant Total</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon amber">
            <mat-icon>pending_actions</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ facturesAttente }}</span>
            <span class="kpi-label">En attente</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon red">
            <mat-icon>error_outline</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ facturesRejetees }}</span>
            <span class="kpi-label">Rejetées</span>
          </div>
        </div>
      </div>

      <!-- ==================== PHARMACIEN: ALL-IN-ONE ==================== -->
      <ng-container *ngIf="authService.isPharmacien()">

        <!-- Section: Facturation -->
        <div class="section-card billing-card">
          <div class="section-header billing-header">
            <div class="section-title-group">
              <span class="section-icon-box"><mat-icon>receipt_long</mat-icon></span>
              <div>
                <h2>Facture du mois de {{ currentMonthLabel }}</h2>
              </div>
            </div>
            <div class="header-actions">
              <a class="btn btn-outline btn-sm" routerLink="/dashboard/factures">
                <mat-icon>folder_open</mat-icon> Mes factures
              </a>
              <button class="btn btn-primary btn-sm" *ngIf="canSendFacture" (click)="envoyerFacture()">
                <mat-icon>send</mat-icon> Envoyer
              </button>
            </div>
          </div>

          <div class="section-body">
            <!-- Étape 1 : Médicaments -->
            <div class="step">
              <span class="step-badge">1</span>
              <div class="step-content">
                <span class="step-label">Médicaments</span>
                <!-- Medication entry -->
                <form [formGroup]="medicamentForm" (ngSubmit)="ajouterMedicamentLigne()" class="form-row">
              <mat-form-field appearance="outline" class="flex-2">
                <mat-label>Médicament</mat-label>
                <input type="text" matInput formControlName="medicament" [matAutocomplete]="auto" (input)="onMedicamentInput($event)" style="text-transform: uppercase;">
                <mat-autocomplete #auto="matAutocomplete" (optionSelected)="onMedicamentSelected($event)">
                  <mat-option *ngFor="let med of suggestions" [value]="med.nom">
                    {{ med.nom }} <span *ngIf="med.statut === 'EXCLU'" class="text-warn">(Exclu)</span>
                  </mat-option>
                </mat-autocomplete>
                <mat-error *ngIf="medicamentForm.get('medicament')?.hasError('exclu')">
                  Ce médicament est exclu.
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Qté</mat-label>
                <input matInput type="number" formControlName="quantite">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Prix</mat-label>
                <input matInput type="number" formControlName="prixUnitaire">
              </mat-form-field>

              <button class="btn btn-outline add-btn" type="submit" [disabled]="medicamentForm.invalid">
                <mat-icon>add</mat-icon> Préparer
              </button>
            </form>

            <!-- Alerte médicament exclu : motif + description -->
            <div class="exclu-alert" *ngIf="excludedInfo">
              <mat-icon>block</mat-icon>
              <div class="exclu-body">
                <span class="exclu-title">« {{ excludedInfo.nom }} » est exclu de la couverture CSU</span>
                <span class="exclu-line"><strong>Motif :</strong> {{ excludedInfo.motif || 'Non précisé' }}</span>
                <span class="exclu-line" *ngIf="excludedInfo.description"><strong>Description :</strong> {{ excludedInfo.description }}</span>
              </div>
            </div>

            <!-- Temp list -->
            <div *ngIf="patientLignes.length > 0" class="temp-list">
              <div class="temp-header">
                <span>{{ patientLignes.length }} médicament(s) préparé(s)</span>
              </div>
              <div class="mini-table-wrap">
                <table class="mini-table">
                  <thead>
                    <tr>
                      <th>Médicament</th>
                      <th>Code</th>
                      <th>Qté</th>
                      <th>Prix</th>
                      <th>Total</th>
                      <th>Part CSU (50%)</th>
                      <th>Part bénéf. (50%)</th>
                      <th class="th-action"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let pl of patientLignes; let i = index">
                      <td data-label="Médicament" class="cell-med">{{ pl.medicament }}</td>
                      <td data-label="Code" class="text-muted">{{ pl.codeProduit }}</td>
                      <td data-label="Qté">{{ pl.quantite }}</td>
                      <td data-label="Prix">{{ pl.prixUnitaire | number }}</td>
                      <td data-label="Total"><strong>{{ pl.quantite * pl.prixUnitaire | number }}</strong></td>
                      <td data-label="Part CSU (50%)" class="part-csu">{{ (pl.quantite * pl.prixUnitaire) / 2 | number:'1.0-0':'fr' }}</td>
                      <td data-label="Part bénéf. (50%)" class="part-benef">{{ (pl.quantite * pl.prixUnitaire) / 2 | number:'1.0-0':'fr' }}</td>
                      <td class="cell-action">
                        <button class="action-btn danger" (click)="retirerMedicamentTemp(i)" type="button" matTooltip="Retirer">
                          <mat-icon>close</mat-icon>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="temp-footer split-totals">
                <span>Sous-total : <strong>{{ tempTotal | number:'1.0-0':'fr' }} CFA</strong></span>
                <span class="part-csu">Part CSU (50%) : <strong>{{ tempTotal / 2 | number:'1.0-0':'fr' }} CFA</strong></span>
                <span class="part-benef">Part bénéficiaire (50%) : <strong>{{ tempTotal / 2 | number:'1.0-0':'fr' }} CFA</strong></span>
              </div>
            </div>

            <div class="hint-empty" *ngIf="patientLignes.length === 0">
              <mat-icon>info_outline</mat-icon>
              <span>Recherchez un médicament, renseignez quantité et prix, puis cliquez sur « Préparer ».</span>
            </div>
              </div>
            </div>

            <!-- Étape 2 : Patient -->
            <div class="step">
              <span class="step-badge">2</span>
              <div class="step-content">
                <span class="step-label">Identité du patient</span>
                <form [formGroup]="patientForm" class="form-row">
              <mat-form-field appearance="outline" class="flex-grow">
                <mat-label>Nom & Prénom du patient</mat-label>
                <input matInput formControlName="patientNomPrenom" placeholder="Ex: Diop Ousmane">
                <mat-icon matPrefix>person</mat-icon>
              </mat-form-field>
              <mat-form-field appearance="outline" class="flex-grow">
                <mat-label>N° Matricule</mat-label>
                <input matInput formControlName="patientMatricule" placeholder="Ex: PAT-2026-987">
                <mat-icon matPrefix>badge</mat-icon>
              </mat-form-field>
                </form>
              </div>
            </div>

            <!-- Étape 3 : Dossier du patient (pièces justificatives) -->
            <div class="step">
              <span class="step-badge">3</span>
              <div class="step-content">
                <span class="step-label">Dossier du patient</span>
                <p class="dossier-hint">Prenez en photo les pièces justificatives (appareil photo ou fichier).</p>
                <div class="photo-grid">
                  <div class="photo-slot" *ngFor="let p of photoFields">
                    <span class="photo-label">{{ p.label }}</span>
                    <div class="photo-drop" *ngIf="!photos[p.key]; else preview">
                      <input type="file" accept="image/*" capture="environment" hidden
                             #photoInput (change)="onPhotoSelected(p.key, $event)">
                      <button type="button" class="photo-btn" (click)="photoInput.click()">
                        <mat-icon>photo_camera</mat-icon>
                        <span>Prendre une photo</span>
                      </button>
                    </div>
                    <ng-template #preview>
                      <div class="photo-preview">
                        <img [src]="photos[p.key]" [alt]="p.label" (click)="openViewer(photos[p.key]!)">
                        <button type="button" class="photo-remove" (click)="removePhoto(p.key)" matTooltip="Supprimer">
                          <mat-icon>close</mat-icon>
                        </button>
                      </div>
                    </ng-template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action : enregistrer -->
            <div class="save-row">
              <button class="btn btn-primary" [disabled]="patientForm.invalid || patientLignes.length === 0 || isSubmitting" (click)="enregistrerPatientFacture()">
                <mat-icon>save</mat-icon> Enregistrer pour ce patient
              </button>
            </div>
          </div>
        </div>

      </ng-container>

      <!-- ==================== OTHER ROLES: STANDARD DASHBOARD ==================== -->
      <ng-container *ngIf="!authService.isPharmacien()">
        <div class="two-col-grid">
          <!-- Recent Factures -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title-group">
                <mat-icon class="section-icon">receipt_long</mat-icon>
                <h2>Factures récentes</h2>
              </div>
              <a class="btn btn-outline btn-sm" [routerLink]="authService.isServiceRegional() ? '/dashboard/factures-regionales' : '/dashboard/regions'">
                Voir tout <mat-icon>arrow_forward</mat-icon>
              </a>
            </div>
            <div class="table-body">
              <table mat-table [dataSource]="recentFactures" class="w-100">
                <ng-container matColumnDef="pharmacie">
                  <th mat-header-cell *matHeaderCellDef> Pharmacie </th>
                  <td mat-cell *matCellDef="let f"> {{ f.pharmacieNom }} </td>
                </ng-container>

                <ng-container matColumnDef="montant">
                  <th mat-header-cell *matHeaderCellDef> Montant </th>
                  <td mat-cell *matCellDef="let f"> <strong>{{ f.montantTotal | number }} CFA</strong> </td>
                </ng-container>

                <ng-container matColumnDef="statut">
                  <th mat-header-cell *matHeaderCellDef> Statut </th>
                  <td mat-cell *matCellDef="let f"> <app-status-badge [statut]="f.statut"></app-status-badge> </td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef></th>
                  <td mat-cell *matCellDef="let f">
                    <a class="action-btn" [routerLink]="['/dashboard/factures', f.id]">
                      <mat-icon>visibility</mat-icon>
                    </a>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
              <div class="empty-state" *ngIf="recentFactures.length === 0">
                <p>Aucune facture récente</p>
              </div>
            </div>
          </div>

          <!-- Chart -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title-group">
                <mat-icon class="section-icon">bar_chart</mat-icon>
                <h2>Évolution Mensuelle</h2>
              </div>
            </div>
            <div class="chart-body">
              <canvas baseChart *ngIf="isChartReady"
                [data]="barChartData"
                [options]="barChartOptions"
                [type]="'bar'">
              </canvas>
              <div class="empty-state" *ngIf="!isChartReady">
                <p>Chargement du graphique...</p>
              </div>
            </div>
          </div>
        </div>
      </ng-container>

      <!-- Visionneuse plein écran d'une pièce justificative -->
      <div class="img-viewer" *ngIf="viewerImage" (click)="viewerImage = null">
        <button type="button" class="viewer-close"><mat-icon>close</mat-icon></button>
        <img [src]="viewerImage" alt="Pièce justificative" (click)="$event.stopPropagation()">
      </div>
    </div>
  `,
  styles: [`
    .dashboard-page {
      animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Welcome */
    .welcome-section {
      margin-bottom: 24px;
    }
    .welcome-section h1 {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .welcome-section p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }
    @media (max-width: 1024px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
    .kpi-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      box-shadow: var(--shadow-sm);
      transition: all 0.2s ease;
    }
    .kpi-card:hover {
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .kpi-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-icon.blue { background: #DBEAFE; color: #2563EB; }
    .kpi-icon.green { background: #DCFCE7; color: #16A34A; }
    .kpi-icon.amber { background: #FEF3C7; color: #D97706; }
    .kpi-icon.red { background: #FEE2E2; color: #EF4444; }
    .kpi-body {
      display: flex;
      flex-direction: column;
    }
    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .kpi-value small {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
    }
    .kpi-label {
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
      margin-top: 2px;
    }

    /* Section Card */
    .section-card {
      background: white;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-sm);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      gap: 16px;
      flex-wrap: wrap;
    }
    .section-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section-icon {
      color: var(--primary);
      font-size: 24px;
    }
    .section-title-group h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
    }
    .section-title-group p {
      margin: 2px 0 0;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .section-body {
      padding: 24px;
    }
    .table-body {
      overflow-x: auto;
    }
    .chart-body {
      padding: 24px;
    }

    /* Two column grid for non-pharmacien */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 960px) {
      .two-col-grid { grid-template-columns: 1fr; }
    }

    /* Forms */
    .form-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .flex-grow {
      flex: 1;
      min-width: 200px;
    }
    .flex-2 {
      flex: 2;
      min-width: 240px;
    }
    mat-form-field {
      flex: 1;
      min-width: 120px;
    }
    .divider {
      border: 0;
      border-top: 1px solid var(--border);
      margin: 20px 0;
    }
    .text-warn {
      color: #EF4444;
      font-weight: 600;
      margin-left: 6px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: all 0.2s ease;
      white-space: nowrap;
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
    .btn-primary:disabled {
      background: #94A3B8;
      cursor: not-allowed;
      transform: none;
    }
    .btn-outline {
      background: white;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-outline:hover {
      background: var(--border-light);
    }
    .btn-outline:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 13px;
    }
    .btn-sm mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .add-btn {
      height: 56px;
      margin-top: 4px;
    }

    /* Temp list */
    .temp-list {
      margin-top: 20px;
      background: #fff;
      border-radius: 12px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .temp-header {
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 700;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
      background: var(--border-light);
    }
    .temp-footer {
      padding: 14px 16px;
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--border);
      background: var(--border-light);
    }
    .mini-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .mini-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 660px;
    }
    .mini-table th {
      text-align: left;
      padding: 11px 16px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
      background: #F8FAFC;
      white-space: nowrap;
    }
    .mini-table td {
      padding: 11px 16px;
      font-size: 14px;
      border-bottom: 1px solid var(--border-light);
      white-space: nowrap;
    }
    .mini-table td.cell-med { font-weight: 600; }
    .mini-table tbody tr:last-child td {
      border-bottom: none;
    }
    .mini-table tbody tr { transition: background 0.15s ease; }
    .mini-table tbody tr:hover td { background: var(--border-light); }

    /* Action buttons */
    .action-group {
      display: flex;
      gap: 4px;
    }
    .action-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .action-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .action-btn:hover {
      background: var(--border-light);
      color: var(--primary);
    }
    .action-btn.danger {
      color: var(--text-muted);
    }
    .action-btn.danger:hover {
      color: var(--warn);
      background: var(--warn-light);
    }

    .text-muted {
      color: var(--text-secondary);
      font-size: 13px;
    }
    .w-100 { width: 100%; }

    .empty-state {
      text-align: center;
      padding: 40px !important;
    }
    .empty-state mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: var(--text-muted);
      margin-bottom: 8px;
    }
    .empty-state p {
      color: var(--text-secondary);
      font-size: 14px;
      margin: 0;
    }

    /* En-tête facturation */
    .billing-card { border-color: var(--border); }
    .billing-header { background: rgba(5, 150, 105, 0.05); }
    .billing-header h2 { font-size: 19px; font-weight: 700; }
    .section-icon-box {
      width: 42px; height: 42px;
      flex-shrink: 0;
      border-radius: 12px;
      background: var(--primary-light);
      color: var(--primary);
      display: flex; align-items: center; justify-content: center;
    }
    .section-icon-box mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    /* ===== Étapes de saisie ===== */
    .step {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      position: relative;
    }
    .step + .step { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-light); }
    .step-badge {
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--primary);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
      box-shadow: 0 0 0 4px var(--primary-light);
    }
    .step-content { flex: 1; min-width: 0; }
    .step-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      margin-bottom: 12px;
    }

    .temp-total { font-size: 14px; color: var(--text-secondary); margin-right: auto; }
    .temp-total strong { color: var(--text-primary); font-size: 15px; }
    .temp-footer { align-items: center; }

    /* Répartition 50/50 par médicament */
    .split-totals {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .split-totals span {
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 14px;
      white-space: nowrap;
    }
    .split-totals strong { color: var(--text-primary); font-size: 14px; }
    .part-csu { color: var(--primary); }
    .part-benef { color: var(--accent); }
    td.part-csu, td.part-benef { font-weight: 600; }

    .save-row {
      display: flex;
      justify-content: flex-end;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border-light);
    }

    .hint-empty {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
      padding: 12px 14px;
      background: var(--border-light);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 13px;
    }
    .hint-empty mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--text-muted); }

    /* Alerte médicament exclu */
    .exclu-alert {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-top: 16px;
      padding: 14px 16px;
      background: var(--warn-light);
      border: 1px solid #FCA5A5;
      border-radius: var(--radius-sm);
    }
    .exclu-alert > mat-icon { color: var(--warn); flex-shrink: 0; }
    .exclu-body { display: flex; flex-direction: column; gap: 3px; }
    .exclu-title { font-weight: 700; color: #B91C1C; font-size: 14px; }
    .exclu-line { font-size: 13px; color: var(--text-primary); }
    .exclu-line strong { color: var(--text-secondary); }

    /* Dossier patient : pièces justificatives */
    .dossier-hint { margin: 0 0 12px; font-size: 13px; color: var(--text-secondary); }
    .photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .photo-slot { display: flex; flex-direction: column; gap: 6px; }
    .photo-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
    .photo-drop { border: 1.5px dashed var(--border); border-radius: 10px; background: var(--border-light); transition: border-color 0.2s ease, background 0.2s ease; }
    .photo-drop:hover { border-color: var(--primary); background: var(--primary-light); }
    .photo-btn { width: 100%; height: 96px; border: none; background: transparent; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--text-secondary); font-size: 13px; font-weight: 500; }
    .photo-btn mat-icon { font-size: 26px; width: 26px; height: 26px; color: var(--primary); }
    .photo-preview { position: relative; height: 96px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
    .photo-preview img { width: 100%; height: 100%; object-fit: cover; cursor: zoom-in; display: block; }
    .photo-remove { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 50%; border: none; background: rgba(17,24,39,0.65); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
    .photo-remove mat-icon { font-size: 16px; width: 16px; height: 16px; }
    @media (max-width: 600px) { .photo-grid { grid-template-columns: 1fr; } }

    /* Visionneuse plein écran */
    .img-viewer { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; padding: 24px; }
    .img-viewer img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
    .viewer-close { position: absolute; top: 18px; right: 18px; width: 44px; height: 44px; border-radius: 50%; border: none; background: rgba(255,255,255,0.15); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }

    /* ===================== RESPONSIVE / MOBILE ===================== */
    @media (max-width: 768px) {
      .welcome-section h1 { font-size: 22px; }
      .section-body { padding: 18px 16px; }
      .section-header { padding: 16px; flex-direction: column; align-items: stretch; }
      .section-header .btn { justify-content: center; }
      .header-actions { width: 100%; }
      .header-actions .btn { flex: 1; }
      .chart-body { padding: 16px; }
      .step { gap: 12px; }
    }

    @media (max-width: 640px) {
      /* Champs de saisie en pleine largeur */
      .form-row { gap: 10px; }
      .form-row mat-form-field,
      .form-row .flex-2,
      .form-row .flex-grow { flex: 1 1 100%; width: 100%; min-width: 0; }
      .add-btn { width: 100%; height: 50px; margin-top: 0; }

      /* Tableau des médicaments -> cartes empilées */
      .mini-table-wrap { overflow: visible; }
      .mini-table { min-width: 0; }
      .mini-table thead { display: none; }
      .mini-table, .mini-table tbody, .mini-table tr, .mini-table td { display: block; width: 100%; }
      .mini-table tr {
        border: 1px solid var(--border);
        border-radius: 10px;
        margin: 12px;
        padding: 2px 12px;
        background: #fff;
      }
      .mini-table tbody tr:hover td { background: transparent; }
      .mini-table td {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 9px 0;
        border-bottom: 1px solid var(--border-light);
        white-space: normal;
        text-align: right;
      }
      .mini-table td::before {
        content: attr(data-label);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--text-secondary);
        text-align: left;
      }
      .mini-table td.cell-action {
        border-bottom: none;
        justify-content: flex-end;
        padding: 6px 0;
      }
      .mini-table td.cell-action::before { content: none; }

      /* Totaux empilés en pleine largeur */
      .temp-footer { padding: 12px; }
      .split-totals { width: 100%; flex-direction: column; gap: 8px; justify-content: flex-start; }
      .split-totals span { width: 100%; text-align: center; }

      /* Boutons d'action en pleine largeur */
      .save-row { justify-content: stretch; }
      .save-row .btn { width: 100%; justify-content: center; }

      /* Pièces justificatives : une colonne */
      .photo-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 380px) {
      .section-body { padding: 16px 12px; }
      .step-label { font-size: 12px; }
      .btn { padding: 9px 12px; }
    }
  `]
})
export class DashboardComponent implements OnInit {
  currentUser: any;
  totalFactures = 0;
  montantTotal = 0;
  facturesAttente = 0;
  facturesRejetees = 0;

  // For other roles
  recentFactures: Facture[] = [];
  displayedColumns: string[] = ['pharmacie', 'montant', 'statut', 'actions'];

  // Saisie rapide
  patientForm!: FormGroup;
  medicamentForm!: FormGroup;
  patientLignes: any[] = [];
  currentFacture: Facture | null = null;
  isSubmitting = false;
  suggestions: Medicament[] = [];
  // Info d'exclusion affichée quand un médicament exclu est saisi/sélectionné
  excludedInfo: { nom: string; motif?: string; description?: string } | null = null;

  // Dossier patient : pièces justificatives (data URL base64)
  readonly photoFields: { key: PhotoKey; label: string }[] = [
    { key: 'ticketCaisse', label: 'Ticket de caisse' },
    { key: 'bonCommande', label: 'Bon de commande' },
    { key: 'ordonnance', label: 'Ordonnance' }
  ];
  photos: Record<PhotoKey, string | null> = { ticketCaisse: null, bonCommande: null, ordonnance: null };
  viewerImage: string | null = null;

  // Chart
  public barChartOptions: ChartOptions = {
    responsive: true,
    plugins: {
      legend: { display: true, position: 'bottom' }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
      x: { grid: { display: false } }
    }
  };
  public barChartData: ChartConfiguration<'bar'>['data'] = {
    labels: [],
    datasets: []
  };
  public isChartReady = false;

  constructor(
    public authService: AuthService,
    private factureService: FactureService,
    private statsService: StatsService,
    private medicamentService: MedicamentService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private router: Router,
    private confirm: ConfirmService
  ) {
    this.currentUser = this.authService.getCurrentUser();

    this.patientForm = this.fb.group({
      patientNomPrenom: ['', Validators.required],
      patientMatricule: ['', Validators.required]
    });

    this.medicamentForm = this.fb.group({
      medicament: ['', Validators.required],
      codeProduit: ['', Validators.required],
      quantite: [1, [Validators.required, Validators.min(1)]],
      prixUnitaire: [0, [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit() {
    this.loadData();
    this.loadCurrentFacture();
    if (!this.authService.isPharmacien()) {
      this.loadChart();
    } else {
      // Précharge le cache des médicaments pour une autocomplétion instantanée dès la 1ʳᵉ frappe
      this.medicamentService.getAllCached().subscribe();
    }
  }

  loadData() {
    this.factureService.getAll().subscribe((factures: Facture[]) => {
      this.totalFactures = factures.length;
      this.montantTotal = factures.reduce((sum: number, f: Facture) => sum + f.montantTotal, 0);
      this.facturesAttente = factures.filter((f: Facture) => f.statut === 'ENVOYEE' || f.statut === 'EN_VERIFICATION').length;
      this.facturesRejetees = factures.filter((f: Facture) => f.statut === 'REJETEE').length;

      if (!this.authService.isPharmacien()) {
        this.recentFactures = factures
          .sort((a: Facture, b: Facture) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
      }
    });
  }

  loadCurrentFacture() {
    this.factureService.getCurrent().subscribe(res => {
      this.currentFacture = res;
    });
  }

  loadChart() {
    let obs$ = this.authService.isServiceCentral()
      ? this.statsService.getEvolutionMensuelle(new Date().getFullYear())
      : this.statsService.getEvolutionMensuelle(new Date().getFullYear(), this.currentUser?.regionId);

    obs$.subscribe((data: any[]) => {
      this.barChartData = {
        labels: data.map((d: any) => `${this.getMonthName(d.mois)}`),
        datasets: [
          {
            data: data.map((d: any) => d.montantTotal),
            label: 'Montant Total (CFA)',
            backgroundColor: '#DBEAFE',
            borderColor: '#2563EB',
            borderWidth: 2,
            borderRadius: 6
          }
        ]
      };
      this.isChartReady = true;
    });
  }

  // === Saisie Rapide Methods ===

  onMedicamentInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    if (query.length >= 2) {
      this.medicamentService.search(query).subscribe(res => {
        this.suggestions = res;
        const exactMatch = res.find(m => m.nom.toLowerCase() === query.trim().toLowerCase());
        if (exactMatch) {
          this.medicamentForm.patchValue({ codeProduit: exactMatch.code }, { emitEvent: false });
          this.applyMedicamentStatut(exactMatch);
        } else {
          this.excludedInfo = null;
        }
      });
    } else {
      this.suggestions = [];
      this.excludedInfo = null;
    }
  }

  onMedicamentSelected(event: any) {
    const nom = event.option.value;
    const med = this.suggestions.find(m => m.nom === nom);
    if (med) {
      this.medicamentForm.patchValue({ codeProduit: med.code });
      this.applyMedicamentStatut(med);
    }
  }

  /** Applique le statut du médicament : bloque + affiche motif/description si EXCLU. */
  private applyMedicamentStatut(med: Medicament) {
    if (med.statut === StatutMedicament.EXCLU) {
      this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
      this.excludedInfo = { nom: med.nom, motif: med.motif, description: med.description };
    } else {
      this.medicamentForm.get('medicament')?.setErrors(null);
      this.excludedInfo = null;
    }
  }

  ajouterMedicamentLigne() {
    if (this.medicamentForm.invalid) return;
    const val = this.medicamentForm.value;
    this.patientLignes.push({
      medicament: (val.medicament || '').toString().toUpperCase(),
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });
    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.suggestions = [];
    this.excludedInfo = null;
    this.snackBar.open('Médicament préparé', 'OK', { duration: 2000 });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
  }

  onPhotoSelected(key: PhotoKey, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner une image', 'Fermer', { duration: 3000 });
      input.value = '';
      return;
    }
    // Compression côté client (≤ 50 Ko) avant envoi au serveur.
    compressImageToDataUrl(file, 50 * 1024)
      .then(dataUrl => { this.photos[key] = dataUrl; })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    input.value = '';
  }

  removePhoto(key: PhotoKey) {
    this.photos[key] = null;
  }

  openViewer(src: string) {
    this.viewerImage = src;
  }

  private resetPhotos() {
    this.photos = { ticketCaisse: null, bonCommande: null, ordonnance: null };
  }

  enregistrerPatientFacture() {
    if (this.patientForm.invalid || this.patientLignes.length === 0) return;

    this.isSubmitting = true;
    const patientVal = this.patientForm.value;
    const nouvellesLignes = this.patientLignes.map(pl => ({
      ...pl,
      patientNomPrenom: patientVal.patientNomPrenom,
      patientMatricule: patientVal.patientMatricule,
      ticketCaisse: this.photos.ticketCaisse || undefined,
      bonCommande: this.photos.bonCommande || undefined,
      ordonnance: this.photos.ordonnance || undefined
    }));

    this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
      next: (res) => {
        this.currentFacture = res;
        this.patientForm.reset();
        this.patientLignes = [];
        this.resetPhotos();
        this.isSubmitting = false;
        this.snackBar.open('Patient et médicaments ajoutés à la facture', 'OK', { duration: 3000 });
        this.loadData(); // refresh KPIs and list
      },
      error: (err) => {
        this.isSubmitting = false;
        this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  envoyerFacture() {
    if (!this.currentFacture) return;
    this.confirm.ask({
      title: 'Envoyer la facture',
      message: 'Êtes-vous sûr de vouloir envoyer cette facture au service régional ? Vous ne pourrez plus la modifier.',
      confirmText: 'Envoyer'
    }).subscribe(ok => {
      if (!ok) return;
      this.factureService.envoyer(this.currentFacture!.id).subscribe({
        next: () => {
          this.snackBar.open('Facture envoyée avec succès', 'OK', { duration: 3000 });
          this.loadData();
          this.loadCurrentFacture();
        },
        error: (err) => {
          this.snackBar.open('Erreur: ' + (err.error?.message || err.message), 'Fermer', { duration: 5000 });
        }
      });
    });
  }

  getMonthName(mois: number): string {
    const moisNoms = [
      '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    return moisNoms[mois] || '';
  }

  get currentMonthLabel(): string {
    const mois = this.currentFacture?.mois ?? (new Date().getMonth() + 1);
    const annee = this.currentFacture?.annee ?? new Date().getFullYear();
    return `${this.getMonthName(mois)} ${annee}`;
  }

  get tempTotal(): number {
    return this.patientLignes.reduce((sum, pl) => sum + (pl.quantite * pl.prixUnitaire), 0);
  }

  get currentStatut(): StatutFacture {
    return this.currentFacture?.statut ?? StatutFacture.BROUILLON;
  }

  get canSendFacture(): boolean {
    return (this.currentFacture?.lignes?.length || 0) > 0 && this.currentStatut === StatutFacture.BROUILLON;
  }
}
