import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SrGestionService, SuiviBcsuRow } from '../services/sr-gestion.service';

@Component({
  selector: 'app-suivi-bcsu',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule],
  templateUrl: './suivi-bcsu.component.html'
})
export class SuiviBcsuComponent implements OnInit {
  annee = new Date().getFullYear();
  trimestre: number | null = null;
  mois: number | null = null;

  anneesDispo = [2026, 2025, 2024];
  trimestres = [
    { valeur: null, label: 'Toute l’année' },
    { valeur: 1, label: 'Trimestre 1' },
    { valeur: 2, label: 'Trimestre 2' },
    { valeur: 3, label: 'Trimestre 3' },
    { valeur: 4, label: 'Trimestre 4' }
  ];

  moisListe = [
    { num: null, nom: 'Tous les mois' },
    { num: 1, nom: 'Janvier' },
    { num: 2, nom: 'Février' },
    { num: 3, nom: 'Mars' },
    { num: 4, nom: 'Avril' },
    { num: 5, nom: 'Mai' },
    { num: 6, nom: 'Juin' },
    { num: 7, nom: 'Juillet' },
    { num: 8, nom: 'Août' },
    { num: 9, nom: 'Septembre' },
    { num: 10, nom: 'Octobre' },
    { num: 11, nom: 'Novembre' },
    { num: 12, nom: 'Décembre' }
  ];

  bcsuRows: SuiviBcsuRow[] = [];
  loading = false;

  totalFacture = 0;
  totalPaye = 0;
  totalReste = 0;
  totalBeneficiaires = 0;

  get tauxReglePourcent(): number {
    return this.totalFacture > 0 ? Math.round((this.totalPaye / this.totalFacture) * 100) : 0;
  }

  constructor(private srService: SrGestionService) {}

  ngOnInit(): void {
    this.chargerDonnees();
  }

  chargerDonnees(): void {
    this.loading = true;
    this.srService.getSuiviBcsu({
      annee: this.annee,
      trimestre: this.trimestre ?? undefined,
      mois: this.mois ?? undefined
    }).subscribe({
      next: (res) => {
        this.bcsuRows = res;
        this.totalFacture = res.reduce((s, b) => s + b.montantFacture, 0);
        this.totalPaye = res.reduce((s, b) => s + b.montantPaye, 0);
        this.totalReste = res.reduce((s, b) => s + b.resteAPayer, 0);
        this.totalBeneficiaires = res.reduce((s, b) => s + b.nombreBeneficiaires, 0);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onFiltreChange(): void {
    this.chargerDonnees();
  }

  formatMontant(m: number): string {
    return (m || 0).toLocaleString('fr-FR') + ' F CFA';
  }
}
