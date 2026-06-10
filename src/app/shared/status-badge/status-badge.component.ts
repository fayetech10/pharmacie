import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StatutFacture } from '../../core/models/facture.model';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="status-badge" [ngClass]="'status-' + statut">
      {{ getLabel() }}
    </span>
  `,
  styles: []
})
export class StatusBadgeComponent {
  @Input() statut!: StatutFacture;

  getLabel(): string {
    switch(this.statut) {
      case StatutFacture.BROUILLON: return 'Brouillon';
      case StatutFacture.ENVOYEE: return 'Envoyée';
      case StatutFacture.EN_VERIFICATION: return 'En vérification';
      case StatutFacture.CONFORME: return 'Conforme';
      case StatutFacture.REJETEE: return 'Rejetée';
      case StatutFacture.VALIDEE: return 'Validée';
      default: return this.statut;
    }
  }
}
