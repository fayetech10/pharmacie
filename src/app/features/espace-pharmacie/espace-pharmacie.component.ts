import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { FactureFormComponent } from '../factures/facture-form/facture-form.component';
import { AuthService } from '../../core/services/auth.service';
import { FactureCountService } from '../../core/services/facture-count.service';

@Component({
  selector: 'app-espace-pharmacie',
  standalone: true,
  imports: [CommonModule, FactureFormComponent, MatIconModule],
  templateUrl: './espace-pharmacie.component.html',
  styleUrls: ['./espace-pharmacie.component.css']
})
export class EspacePharmacieComponent implements OnInit {
  currentLines: any[] = [];
  facture: any = null;

  private destroyRef = inject(DestroyRef);

  constructor(
    public authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private factureCount: FactureCountService
  ) {}

  ngOnInit() {
    this.factureCount.refresh();
  }

  onCurrentLinesChange(lines: any[]) {
    this.currentLines = lines;
  }

  onFactureChange(facture: any) {
    this.facture = facture;
  }

  get currentTotal(): number {
    return this.currentLines.reduce((sum, line) => sum + (line.quantite * line.prixUnitaire), 0);
  }

  get currentCsu(): number {
    return Math.round(this.currentTotal / 2);
  }

  get factureLignesCount(): number {
    return this.facture?.lignes?.length || 0;
  }

  get facturePatientsCount(): number {
    if (!this.facture?.lignes) return 0;
    const ids = new Set(this.facture.lignes.map((l: any) => (l.patientMatricule || l.patientNomPrenom || '').trim().toLowerCase()).filter(Boolean));
    return ids.size;
  }

  get facturePatientGroups(): any[] {
    if (!this.facture?.lignes) return [];
    const groups = new Map<string, any>();
    for (const ligne of this.facture.lignes) {
      const key = (ligne.patientNomPrenom || 'Inconnu').trim();
      if (!groups.has(key)) {
        groups.set(key, { nom: key, lignes: [] });
      }
      groups.get(key).lignes.push(ligne);
    }
    return Array.from(groups.values());
  }

  getMonthName(mois: number): string {
    const moisNoms = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return moisNoms[mois] || '';
  }
}

