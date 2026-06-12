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
      case StatutFacture.BROUILLON: return 'Non envoyée';
      case StatutFacture.ENVOYEE: return 'Envoyée';
      case StatutFacture.VALIDEE_SR: return 'Validée SR';
      case StatutFacture.REJETEE_SR: return 'Rejetée SR';
      case StatutFacture.VALIDEE_NC: return 'Validée NC';
      case StatutFacture.REJETEE_NC: return 'Rejetée NC';
      case StatutFacture.PAYEE: return 'Payée';
      default: return String(this.statut);
    }
  }
}
