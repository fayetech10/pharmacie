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
import { MonthData } from '../../core/models/stats.model';
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
    <div class="dashboard-page fade-in">
      <!-- Welcome (autres rôles uniquement) -->
      <div class="welcome-section welcome-flex" *ngIf="!authService.isPharmacien()">
        <div>
          <h1>Bonjour, {{ currentUser?.prenom }} 👋</h1>
          <p>Vue d'ensemble de l'activité CSU · {{ todayLabel }}</p>
        </div>
        <span class="scope-pill">
          <mat-icon>{{ authService.isServiceRegional() ? 'place' : 'public' }}</mat-icon>
          {{ scopeLabel }}
        </span>
      </div>

      <!-- KPI Cards -->
      <div class="kpi-grid" *ngIf="!authService.isPharmacien()">
        <div class="kpi-card accent-blue">
          <div class="kpi-icon blue">
            <mat-icon>receipt_long</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ totalFactures }}</span>
            <span class="kpi-label">
              Total factures
              <span class="trend" *ngIf="countTrend !== null" [class.up]="countTrend! >= 0" [class.down]="countTrend! < 0">
                <mat-icon>{{ countTrend! >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>{{ countTrend! >= 0 ? '+' : '' }}{{ countTrend }}%
              </span>
            </span>
          </div>
        </div>

        <div class="kpi-card accent-green">
          <div class="kpi-icon green">
            <mat-icon>payments</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ montantTotal | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="kpi-label">
              Montant total
              <span class="trend" *ngIf="montantTrend !== null" [class.up]="montantTrend! >= 0" [class.down]="montantTrend! < 0">
                <mat-icon>{{ montantTrend! >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>{{ montantTrend! >= 0 ? '+' : '' }}{{ montantTrend }}%
              </span>
            </span>
          </div>
        </div>

        <div class="kpi-card accent-amber">
          <div class="kpi-icon amber">
            <mat-icon>pending_actions</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ facturesAttente }}</span>
            <span class="kpi-label">En attente de traitement</span>
          </div>
        </div>

        <div class="kpi-card accent-red">
          <div class="kpi-icon red">
            <mat-icon>error_outline</mat-icon>
          </div>
          <div class="kpi-body">
            <span class="kpi-value">{{ facturesRejetees }}</span>
            <span class="kpi-label">Rejetées</span>
          </div>
        </div>
      </div>

      <!-- Bandeau de stats secondaires -->
      <div class="stat-strip" *ngIf="!authService.isPharmacien()">
        <div class="stat-pill">
          <div class="stat-pill-ic csu"><mat-icon>volunteer_activism</mat-icon></div>
          <div class="stat-pill-body">
            <span class="stat-pill-val">{{ montantCsu | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="stat-pill-cap">Part CSU prise en charge (50%)</span>
          </div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-ic moy"><mat-icon>functions</mat-icon></div>
          <div class="stat-pill-body">
            <span class="stat-pill-val">{{ montantMoyen | number:'1.0-0':'fr' }} <small>CFA</small></span>
            <span class="stat-pill-cap">Montant moyen par facture</span>
          </div>
        </div>
        <div class="stat-pill">
          <div class="stat-pill-ic rate"><mat-icon>verified</mat-icon></div>
          <div class="stat-pill-body">
            <span class="stat-pill-val">{{ tauxValidation }}%</span>
            <span class="stat-pill-cap">Taux de validation</span>
            <div class="rate-bar"><span [style.width.%]="tauxValidation"></span></div>
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
              <a class="btn btn-outline btn-sm" routerLink="/dashboard/espace-pharmacie" [queryParams]="{ tab: 1 }">
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

        <!-- Graphiques : évolution + répartition -->
        <div class="analytics-grid">
          <!-- Évolution mensuelle -->
          <div class="section-card chart-card">
            <div class="section-header">
              <div class="section-title-group">
                <mat-icon class="section-icon">bar_chart</mat-icon>
                <h2>Évolution mensuelle {{ chartYear }}</h2>
              </div>
              <div class="seg-toggle">
                <button type="button" [class.active]="chartMode === 'montant'" (click)="setChartMode('montant')">Montant</button>
                <button type="button" [class.active]="chartMode === 'nombre'" (click)="setChartMode('nombre')">Nombre</button>
              </div>
            </div>
            <div class="chart-body bar-body">
              <canvas baseChart *ngIf="isChartReady"
                [data]="barChartData"
                [options]="barChartOptions"
                [type]="'bar'">
              </canvas>
              <div class="empty-state" *ngIf="!isChartReady">
                <mat-icon>bar_chart</mat-icon>
                <p>Chargement du graphique…</p>
              </div>
            </div>
          </div>

          <!-- Répartition par statut -->
          <div class="section-card chart-card">
            <div class="section-header">
              <div class="section-title-group">
                <mat-icon class="section-icon">donut_large</mat-icon>
                <h2>Répartition par statut</h2>
              </div>
            </div>
            <div class="chart-body donut-body">
              <div class="donut-wrap" *ngIf="hasStatusData; else noStatus">
                <canvas baseChart
                  [data]="doughnutData"
                  [options]="doughnutOptions"
                  [type]="'doughnut'">
                </canvas>
                <div class="donut-center">
                  <span class="donut-total">{{ totalFactures }}</span>
                  <span class="donut-cap">factures</span>
                </div>
              </div>
              <ng-template #noStatus>
                <div class="empty-state"><mat-icon>donut_large</mat-icon><p>Aucune donnée</p></div>
              </ng-template>
              <ul class="legend" *ngIf="hasStatusData">
                <li *ngFor="let s of statusBreakdown">
                  <span class="dot" [style.background]="s.color"></span>
                  <span class="legend-label">{{ s.label }}</span>
                  <b>{{ s.count }}</b>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Listes : factures récentes + top pharmacies -->
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
                <mat-icon>receipt_long</mat-icon>
                <p>Aucune facture récente</p>
              </div>
            </div>
          </div>

          <!-- Top pharmacies -->
          <div class="section-card">
            <div class="section-header">
              <div class="section-title-group">
                <mat-icon class="section-icon">leaderboard</mat-icon>
                <h2>Top pharmacies</h2>
              </div>
            </div>
            <div class="ranking">
              <div class="rank-row" *ngFor="let p of topPharmacies; let i = index">
                <span class="rank-pos" [class.gold]="i === 0">{{ i + 1 }}</span>
                <div class="rank-info">
                  <div class="rank-top">
                    <span class="rank-name">{{ p.nom }}</span>
                    <span class="rank-amount">{{ p.montant | number:'1.0-0':'fr' }} CFA</span>
                  </div>
                  <div class="rank-bar"><span [style.width.%]="p.pct"></span></div>
                  <span class="rank-sub">{{ p.count }} facture(s)</span>
                </div>
              </div>
              <div class="empty-state" *ngIf="topPharmacies.length === 0">
                <mat-icon>leaderboard</mat-icon>
                <p>Aucune donnée</p>
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
    /* Welcome */
    .welcome-section {
      margin-bottom: 24px;
    }
    .welcome-section h1 {
      font-size: 28px;
      font-weight: 800;
      margin: 0 0 4px;
      letter-spacing: -0.02em;
    }
    .welcome-section p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 15px;
    }

    .table-body {
      overflow-x: auto;
    }

    /* En-tête de bienvenue avec pastille de périmètre */
    .welcome-flex { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .welcome-section p::first-letter { text-transform: capitalize; }
    .scope-pill {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--primary-light); color: var(--primary);
      border: 1px solid var(--primary-200);
      padding: 7px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 700; white-space: nowrap;
    }
    .scope-pill mat-icon { font-size: 17px; width: 17px; height: 17px; }

    /* Accent coloré à gauche des cartes KPI */
    .kpi-card { position: relative; overflow: hidden; }
    .kpi-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--border); }
    .kpi-card.accent-blue::before  { background: #2563EB; }
    .kpi-card.accent-green::before { background: var(--primary); }
    .kpi-card.accent-amber::before { background: #D97706; }
    .kpi-card.accent-red::before   { background: #EF4444; }

    /* Chip de tendance (+/- %) */
    .trend {
      display: inline-flex; align-items: center; gap: 1px;
      font-size: 11.5px; font-weight: 700; padding: 1px 7px 1px 4px;
      border-radius: 999px; margin-left: 6px; vertical-align: 1px;
    }
    .trend mat-icon { font-size: 14px; width: 14px; height: 14px; }
    .trend.up { background: var(--primary-100); color: var(--primary-hover); }
    .trend.down { background: #FEE2E2; color: #DC2626; }

    /* Bandeau de stats secondaires */
    .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-pill {
      display: flex; align-items: center; gap: 14px;
      background: var(--card-bg); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 16px 18px; box-shadow: var(--shadow-sm);
    }
    .stat-pill-ic { width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .stat-pill-ic mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .stat-pill-ic.csu  { background: #EDE9FE; color: #7C3AED; }
    .stat-pill-ic.moy  { background: #E0F2FE; color: #0284C7; }
    .stat-pill-ic.rate { background: var(--primary-100); color: var(--primary); }
    .stat-pill-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .stat-pill-val { font-size: 19px; font-weight: 800; color: var(--text-primary); line-height: 1.2; }
    .stat-pill-val small { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
    .stat-pill-cap { font-size: 12.5px; color: var(--text-secondary); font-weight: 500; margin-top: 2px; }
    .rate-bar { height: 6px; border-radius: 999px; background: var(--border-light); margin-top: 8px; overflow: hidden; }
    .rate-bar span { display: block; height: 100%; border-radius: 999px; background: var(--primary); transition: width 0.5s ease; }

    /* Grille graphiques : évolution (large) + doughnut */
    .analytics-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 24px; margin-bottom: 24px; }
    .chart-card { margin-bottom: 0; display: flex; flex-direction: column; }
    .chart-body { padding: 16px 20px 20px; }
    .bar-body { height: 300px; }
    .bar-body canvas { max-height: 100%; }

    /* Bascule segmentée Montant / Nombre */
    .seg-toggle { display: inline-flex; gap: 3px; padding: 3px; background: var(--border-light); border-radius: 10px; }
    .seg-toggle button {
      border: none; background: transparent; padding: 6px 14px; border-radius: 8px;
      font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-secondary);
      cursor: pointer; transition: all 0.2s ease;
    }
    .seg-toggle button.active { background: #fff; color: var(--primary); box-shadow: var(--shadow-sm); }

    /* Doughnut + légende */
    .donut-body { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .donut-wrap { position: relative; width: 200px; height: 200px; margin: 4px auto 8px; }
    .donut-center {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; pointer-events: none;
    }
    .donut-total { font-size: 30px; font-weight: 800; color: var(--text-primary); line-height: 1; }
    .donut-cap { font-size: 12px; color: var(--text-secondary); font-weight: 500; }
    .legend { list-style: none; margin: 4px 0 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 2px; }
    .legend li { display: flex; align-items: center; gap: 8px; padding: 6px 4px; font-size: 13px; border-bottom: 1px solid var(--border-light); }
    .legend li:last-child { border-bottom: none; }
    .legend .dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
    .legend-label { color: var(--text-secondary); flex: 1; }
    .legend b { color: var(--text-primary); font-weight: 700; }

    /* Two column grid for non-pharmacien */
    .two-col-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    /* Classement Top pharmacies */
    .ranking { padding: 12px 20px 20px; }
    .rank-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--border-light); }
    .rank-row:last-child { border-bottom: none; }
    .rank-pos {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--border-light); color: var(--text-secondary);
      font-size: 13px; font-weight: 700;
    }
    .rank-pos.gold { background: #FEF3C7; color: #B45309; }
    .rank-info { flex: 1; min-width: 0; }
    .rank-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .rank-name { font-weight: 600; font-size: 14px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rank-amount { font-weight: 700; font-size: 13.5px; color: var(--primary); white-space: nowrap; }
    .rank-bar { height: 6px; border-radius: 999px; background: var(--border-light); margin: 7px 0 4px; overflow: hidden; }
    .rank-bar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--primary-200), var(--primary)); transition: width 0.5s ease; }
    .rank-sub { font-size: 12px; color: var(--text-muted); }

    @media (max-width: 1100px) {
      .analytics-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 960px) {
      .two-col-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .stat-strip { grid-template-columns: 1fr; gap: 12px; }
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

    .text-muted { font-size: 13px; }

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

  // === Statistiques dérivées (rôles superviseurs) ===
  montantCsu = 0;
  montantMoyen = 0;
  facturesValidees = 0;
  tauxValidation = 0;
  montantTrend: number | null = null;   // % d'évolution du dernier mois vs précédent
  countTrend: number | null = null;
  chartYear = new Date().getFullYear();

  topPharmacies: { nom: string; montant: number; count: number; pct: number }[] = [];
  statusBreakdown: { statut: string; label: string; count: number; color: string }[] = [];
  hasStatusData = false;

  /** Libellés + couleurs des statuts (alignés sur les badges de statut). */
  private readonly statusMeta: Record<string, { label: string; color: string }> = {
    BROUILLON:  { label: 'Non envoyée', color: '#64748B' },
    ENVOYEE:    { label: 'Envoyée',     color: '#2563EB' },
    VALIDEE_SR: { label: 'Validée SR',  color: '#059669' },
    VALIDEE_NC: { label: 'Validée NC',  color: '#047857' },
    PAYEE:      { label: 'Payée',       color: '#A16207' },
    REJETEE_SR: { label: 'Rejetée SR',  color: '#EA580C' },
    REJETEE_NC: { label: 'Rejetée NC',  color: '#DC2626' }
  };
  private readonly statusOrder = ['ENVOYEE', 'VALIDEE_SR', 'VALIDEE_NC', 'PAYEE', 'REJETEE_SR', 'REJETEE_NC', 'BROUILLON'];

  // === Graphique en barres (évolution mensuelle) ===
  chartMode: 'montant' | 'nombre' = 'montant';
  private evolutionData: MonthData[] = [];

  public barChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 10,
        callbacks: {
          label: (ctx: any) => this.chartMode === 'montant'
            ? `  ${Number(ctx.parsed.y).toLocaleString('fr-FR')} CFA`
            : `  ${ctx.parsed.y} facture(s)`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#F1F5F9' },
        ticks: { callback: (v: any) => this.chartMode === 'montant' ? this.shortNum(+v) : v }
      },
      x: { grid: { display: false } }
    }
  };
  public barChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  public isChartReady = false;

  // === Graphique doughnut (répartition par statut) ===
  public doughnutData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  public doughnutOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 10,
        callbacks: {
          label: (ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((s, n) => s + n, 0) || 1;
            const pct = Math.round((ctx.parsed / total) * 100);
            return `  ${ctx.label} : ${ctx.parsed} (${pct}%)`;
          }
        }
      }
    }
  };

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
      this.facturesAttente = factures.filter((f: Facture) => f.statut === StatutFacture.ENVOYEE).length;
      this.facturesRejetees = factures.filter((f: Facture) => f.statut === StatutFacture.REJETEE_SR || f.statut === StatutFacture.REJETEE_NC).length;

      if (this.authService.isPharmacien()) return;

      // --- Statistiques dérivées (superviseurs) ---
      this.montantCsu = Math.round(this.montantTotal / 2);
      this.montantMoyen = this.totalFactures ? Math.round(this.montantTotal / this.totalFactures) : 0;
      this.facturesValidees = factures.filter(f =>
        f.statut === StatutFacture.VALIDEE_SR || f.statut === StatutFacture.VALIDEE_NC || f.statut === StatutFacture.PAYEE
      ).length;
      const traitees = factures.filter(f => f.statut !== StatutFacture.BROUILLON).length;
      this.tauxValidation = traitees ? Math.round((this.facturesValidees / traitees) * 100) : 0;

      // Répartition par statut (pour le doughnut + la légende)
      const counts: Record<string, number> = {};
      for (const f of factures) counts[f.statut] = (counts[f.statut] || 0) + 1;
      this.statusBreakdown = this.statusOrder
        .filter(s => counts[s])
        .map(s => ({ statut: s, label: this.statusMeta[s].label, count: counts[s], color: this.statusMeta[s].color }));
      this.hasStatusData = this.statusBreakdown.length > 0;
      this.doughnutData = {
        labels: this.statusBreakdown.map(s => s.label),
        datasets: [{
          data: this.statusBreakdown.map(s => s.count),
          backgroundColor: this.statusBreakdown.map(s => s.color),
          borderColor: '#fff',
          borderWidth: 2,
          hoverOffset: 6
        }]
      };

      // Top pharmacies (par montant total)
      const byPh: Record<string, { montant: number; count: number }> = {};
      for (const f of factures) {
        const key = f.pharmacieNom || '—';
        byPh[key] = byPh[key] || { montant: 0, count: 0 };
        byPh[key].montant += f.montantTotal;
        byPh[key].count++;
      }
      const ranked = Object.entries(byPh)
        .map(([nom, v]) => ({ nom, montant: v.montant, count: v.count }))
        .sort((a, b) => b.montant - a.montant);
      const max = ranked.length ? ranked[0].montant : 0;
      this.topPharmacies = ranked.slice(0, 5).map(p => ({ ...p, pct: max ? Math.round((p.montant / max) * 100) : 0 }));

      this.recentFactures = [...factures]
        .sort((a: Facture, b: Facture) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
    });
  }

  loadCurrentFacture() {
    this.factureService.getCurrent().subscribe(res => {
      this.currentFacture = res;
    });
  }

  loadChart() {
    this.chartYear = new Date().getFullYear();
    const obs$ = this.authService.isServiceCentral()
      ? this.statsService.getEvolutionMensuelle(this.chartYear)
      : this.statsService.getEvolutionMensuelle(this.chartYear, this.currentUser?.regionId);

    obs$.subscribe((data: MonthData[]) => {
      this.evolutionData = data || [];
      this.computeTrends();
      this.buildBarChart();
      this.isChartReady = true;
    });
  }

  /** Bascule l'axe du graphique entre Montant (CFA) et Nombre de factures. */
  setChartMode(mode: 'montant' | 'nombre') {
    if (this.chartMode === mode) return;
    this.chartMode = mode;
    this.buildBarChart();
  }

  private buildBarChart() {
    const data = this.evolutionData;
    const isMontant = this.chartMode === 'montant';
    this.barChartData = {
      labels: data.map(d => this.getMonthName(d.mois).slice(0, 3)),
      datasets: [{
        data: data.map(d => isMontant ? d.montantTotal : d.nombreFactures),
        label: isMontant ? 'Montant (CFA)' : 'Nombre de factures',
        backgroundColor: isMontant ? 'rgba(5, 150, 105, 0.85)' : 'rgba(37, 99, 235, 0.85)',
        hoverBackgroundColor: isMontant ? '#047857' : '#1D4ED8',
        borderRadius: 8,
        maxBarThickness: 38
      }]
    };
  }

  /** Tendance du dernier mois (renseigné) vs le mois précédent. */
  private computeTrends() {
    const withData = this.evolutionData.filter(d => d.nombreFactures > 0 || d.montantTotal > 0);
    if (withData.length >= 2) {
      const cur = withData[withData.length - 1];
      const prev = withData[withData.length - 2];
      this.montantTrend = this.pctChange(prev.montantTotal, cur.montantTotal);
      this.countTrend = this.pctChange(prev.nombreFactures, cur.nombreFactures);
    } else {
      this.montantTrend = null;
      this.countTrend = null;
    }
  }

  private pctChange(prev: number, cur: number): number | null {
    if (!prev) return null;
    return Math.round(((cur - prev) / prev) * 100);
  }

  /** Formate les grands nombres pour l'axe Y : 1 200 000 → « 1,2 M ». */
  private shortNum(n: number): string {
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M';
    if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + ' k';
    return String(n);
  }

  get scopeLabel(): string {
    if (this.authService.isServiceRegional()) return this.currentUser?.regionNom || 'Ma région';
    if (this.authService.isServiceCentral()) return 'Niveau national';
    return 'Administration';
  }

  get todayLabel(): string {
    return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
