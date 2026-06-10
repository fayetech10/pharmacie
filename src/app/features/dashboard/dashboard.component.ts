import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
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
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

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
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatAutocompleteModule,
    MatSnackBarModule,
    MatTooltipModule,
    StatusBadgeComponent,
    BaseChartDirective
  ],
  template: `
    <div class="dashboard-page">
      <!-- Welcome -->
      <div class="welcome-section">
        <div>
          <h1>Bonjour, {{ currentUser?.prenom }} 👋</h1>
          <p>{{ authService.isPharmacien() ? 'Gérez vos factures pharmaceutiques depuis cette page' : 'Vue d\\'ensemble de l\\'activité CSU' }}</p>
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

        <!-- Résumé de la facture du mois -->
        <div class="invoice-summary">
          <div class="summary-period">
            <mat-icon>event_available</mat-icon>
            <div>
              <span class="summary-label">Facture du mois</span>
              <span class="summary-month">{{ currentMonthLabel }}</span>
            </div>
          </div>
          <div class="summary-amount">
            <span class="amount-value">{{ (currentFacture?.montantTotal || 0) | number:'1.0-0':'fr' }}</span>
            <span class="amount-unit">CFA</span>
          </div>
          <div class="summary-meta">
            <div class="meta-item">
              <span class="meta-value">{{ currentFacture?.lignes?.length || 0 }}</span>
              <span class="meta-label">ligne(s)</span>
            </div>
            <app-status-badge [statut]="currentStatut"></app-status-badge>
          </div>
          <button class="btn btn-primary"
                  *ngIf="canSendFacture"
                  (click)="envoyerFacture()">
            <mat-icon>send</mat-icon> Envoyer
          </button>
        </div>

        <!-- Section: Saisie Rapide -->
        <div class="section-card">
          <div class="section-header">
            <div class="section-title-group">
              <mat-icon class="section-icon">edit_note</mat-icon>
              <div>
                <h2>Saisie rapide</h2>
                <p>Ajoutez un patient et ses médicaments à la facture du mois</p>
              </div>
            </div>
            <a class="btn btn-outline btn-sm" routerLink="/dashboard/factures">
              <mat-icon>folder_open</mat-icon> Mes factures
            </a>
          </div>

          <div class="section-body">
            <!-- Étape 1 : Patient -->
            <div class="step">
              <span class="step-badge">1</span>
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

            <!-- Étape 2 : Médicaments -->
            <div class="step">
              <span class="step-badge">2</span>
              <div class="step-content">
                <span class="step-label">Médicaments du patient</span>
                <!-- Medication entry -->
                <form [formGroup]="medicamentForm" (ngSubmit)="ajouterMedicamentLigne()" class="form-row">
              <mat-form-field appearance="outline" class="flex-2">
                <mat-label>Médicament</mat-label>
                <input type="text" matInput formControlName="medicament" [matAutocomplete]="auto" (input)="onMedicamentInput($event)">
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
                <mat-label>Code</mat-label>
                <input matInput formControlName="codeProduit" readonly>
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

            <!-- Temp list -->
            <div *ngIf="patientLignes.length > 0" class="temp-list">
              <div class="temp-header">
                <span>{{ patientLignes.length }} médicament(s) préparé(s)</span>
              </div>
              <table class="mini-table">
                <thead>
                  <tr>
                    <th>Médicament</th>
                    <th>Code</th>
                    <th>Qté</th>
                    <th>Prix</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let pl of patientLignes; let i = index">
                    <td>{{ pl.medicament }}</td>
                    <td class="text-muted">{{ pl.codeProduit }}</td>
                    <td>{{ pl.quantite }}</td>
                    <td>{{ pl.prixUnitaire | number }}</td>
                    <td><strong>{{ pl.quantite * pl.prixUnitaire | number }}</strong></td>
                    <td>
                      <button class="action-btn danger" (click)="retirerMedicamentTemp(i)" type="button">
                        <mat-icon>close</mat-icon>
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="temp-footer">
                <span class="temp-total">Sous-total : <strong>{{ tempTotal | number:'1.0-0':'fr' }} CFA</strong></span>
                <button class="btn btn-primary" [disabled]="patientForm.invalid || isSubmitting" (click)="enregistrerPatientFacture()">
                  <mat-icon>save</mat-icon> Enregistrer pour ce patient
                </button>
              </div>
            </div>

            <div class="hint-empty" *ngIf="patientLignes.length === 0">
              <mat-icon>info_outline</mat-icon>
              <span>Recherchez un médicament, renseignez quantité et prix, puis cliquez sur « Préparer ».</span>
            </div>
              </div>
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
              <a class="btn btn-outline btn-sm" routerLink="/dashboard/factures">
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
      background: var(--border-light);
      border-radius: 10px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .temp-header {
      padding: 12px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
    }
    .temp-footer {
      padding: 12px 16px;
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--border);
    }
    .mini-table {
      width: 100%;
      border-collapse: collapse;
    }
    .mini-table th {
      text-align: left;
      padding: 10px 16px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border);
    }
    .mini-table td {
      padding: 10px 16px;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
    }
    .mini-table tbody tr:last-child td {
      border-bottom: none;
    }

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

    /* ===== Résumé facture du mois (pharmacien) ===== */
    .invoice-summary {
      display: flex;
      align-items: center;
      gap: 24px;
      flex-wrap: wrap;
      background: linear-gradient(120deg, #1E40AF 0%, #2563EB 55%, #0D9488 100%);
      color: #fff;
      border-radius: var(--radius-lg);
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-md);
    }
    .summary-period {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .summary-period mat-icon {
      background: rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      padding: 6px;
      width: 34px;
      height: 34px;
      font-size: 22px;
    }
    .summary-period > div { display: flex; flex-direction: column; }
    .summary-label { font-size: 12px; color: rgba(255, 255, 255, 0.8); text-transform: uppercase; letter-spacing: 0.04em; }
    .summary-month { font-size: 16px; font-weight: 700; }

    .summary-amount {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-left: auto;
    }
    .amount-value { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
    .amount-unit { font-size: 14px; font-weight: 600; color: rgba(255, 255, 255, 0.85); }

    .summary-meta {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-left: 24px;
      border-left: 1px solid rgba(255, 255, 255, 0.2);
    }
    .meta-item { display: flex; flex-direction: column; align-items: center; }
    .meta-value { font-size: 20px; font-weight: 700; line-height: 1; }
    .meta-label { font-size: 12px; color: rgba(255, 255, 255, 0.8); }
    .summary-meta .status-badge { background: rgba(255, 255, 255, 0.9); }
    .invoice-summary .btn-primary { background: rgba(255, 255, 255, 0.18); border: 1px solid rgba(255,255,255,0.35); }
    .invoice-summary .btn-primary:hover { background: rgba(255, 255, 255, 0.28); transform: translateY(-1px); }

    @media (max-width: 700px) {
      .summary-amount { margin-left: 0; }
      .summary-meta { padding-left: 0; border-left: none; }
    }

    /* ===== Étapes de saisie ===== */
    .step {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .step + .step { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-light); }
    .step-badge {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--primary-light);
      color: var(--primary);
      font-size: 14px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 4px;
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

  // For pharmacien – all-in-one
  allFactures: Facture[] = [];
  factureDataSource!: MatTableDataSource<Facture>;
  pharmacienColumns: string[] = ['periode', 'montant', 'statut', 'date', 'actions'];
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  // Saisie rapide
  patientForm!: FormGroup;
  medicamentForm!: FormGroup;
  patientLignes: any[] = [];
  currentFacture: Facture | null = null;
  isSubmitting = false;
  suggestions: Medicament[] = [];

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
    if (!this.authService.isPharmacien()) {
      this.router.navigate([this.authService.isServiceCentral() ? '/dashboard/regions' : '/dashboard/factures']);
      return;
    }
    this.loadData();
    this.loadCurrentFacture();
  }

  loadData() {
    this.factureService.getAll().subscribe((factures: Facture[]) => {
      this.totalFactures = factures.length;
      this.montantTotal = factures.reduce((sum: number, f: Facture) => sum + f.montantTotal, 0);
      this.facturesAttente = factures.filter((f: Facture) => f.statut === 'ENVOYEE' || f.statut === 'EN_VERIFICATION').length;
      this.facturesRejetees = factures.filter((f: Facture) => f.statut === 'REJETEE').length;

      if (this.authService.isPharmacien()) {
        this.allFactures = factures.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        this.factureDataSource = new MatTableDataSource(this.allFactures);
        setTimeout(() => {
          if (this.paginator) this.factureDataSource.paginator = this.paginator;
          if (this.sort) this.factureDataSource.sort = this.sort;
        });
      } else {
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
          if (exactMatch.statut === StatutMedicament.EXCLU) {
            this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
          } else {
            this.medicamentForm.get('medicament')?.setErrors(null);
          }
        }
      });
    } else {
      this.suggestions = [];
    }
  }

  onMedicamentSelected(event: any) {
    const nom = event.option.value;
    const med = this.suggestions.find(m => m.nom === nom);
    if (med) {
      this.medicamentForm.patchValue({ codeProduit: med.code });
      if (med.statut === StatutMedicament.EXCLU) {
        this.medicamentForm.get('medicament')?.setErrors({ exclu: true });
      } else {
        this.medicamentForm.get('medicament')?.setErrors(null);
      }
    }
  }

  ajouterMedicamentLigne() {
    if (this.medicamentForm.invalid) return;
    const val = this.medicamentForm.value;
    this.patientLignes.push({
      medicament: val.medicament,
      codeProduit: val.codeProduit,
      quantite: val.quantite,
      prixUnitaire: val.prixUnitaire
    });
    this.medicamentForm.reset({ quantite: 1, prixUnitaire: 0 });
    this.suggestions = [];
    this.snackBar.open('Médicament préparé', 'OK', { duration: 2000 });
  }

  retirerMedicamentTemp(index: number) {
    this.patientLignes.splice(index, 1);
  }

  enregistrerPatientFacture() {
    if (this.patientForm.invalid || this.patientLignes.length === 0) return;

    this.isSubmitting = true;
    const patientVal = this.patientForm.value;
    const nouvellesLignes = this.patientLignes.map(pl => ({
      ...pl,
      patientNomPrenom: patientVal.patientNomPrenom,
      patientMatricule: patientVal.patientMatricule
    }));

    this.factureService.addLignesToCurrent(nouvellesLignes).subscribe({
      next: (res) => {
        this.currentFacture = res;
        this.patientForm.reset();
        this.patientLignes = [];
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
