import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { FactureStructure } from '../../core/models/structure.model';
import { EchelonPointage, avancementPointage } from '../../features/espace-poste/poste-facturation';

/**
 * Avancement du pointage « patient vérifié » d'une facture dans les listes : « 45/120
 * vérifiés » et une mini-barre, verte une fois tous les patients vérifiés.
 *
 * <p>Affiché pendant l'étape de contrôle de l'échelon ({@code [enControle]}), ou dès qu'un
 * patient a été pointé — une facture que personne n'a commencé à contrôler n'encombre pas
 * la liste d'un « 0/120 ».</p>
 */
@Component({
  selector: 'app-avancement-pointage',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <span *ngIf="visible" class="inline-flex items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap"
          [ngClass]="complet ? 'text-success' : 'text-text-secondary'"
          [attr.title]="avancement.faits + ' patient(s) sur ' + avancement.total + ' vérifié(s) par ' + libelleEchelon">
      <mat-icon class="!text-[16px] !w-4 !h-4">{{ complet ? 'task_alt' : 'fact_check' }}</mat-icon>
      <span class="tabular-nums">{{ avancement.faits }}/{{ avancement.total }}</span>
      <span class="w-12 h-1.5 rounded-full bg-border-light overflow-hidden" aria-hidden="true">
        <span class="block h-full rounded-full" [ngClass]="complet ? 'bg-success' : 'bg-primary'"
              [style.width.%]="avancement.faits * 100 / avancement.total"></span>
      </span>
      <span class="hidden sm:inline">vérifiés</span>
    </span>
  `
})
export class AvancementPointageComponent implements OnChanges {
  @Input() facture?: FactureStructure | null;
  @Input() echelon: EchelonPointage = 'region';
  /** La facture est à l'étape de contrôle de cet échelon : l'avancement s'affiche même à 0. */
  @Input() enControle = false;

  /** Calculé à chaque nouvelle facture, pas à chaque cycle d'affichage de la liste. */
  avancement = { faits: 0, total: 0 };
  visible = false;
  complet = false;

  ngOnChanges(): void {
    this.avancement = avancementPointage(this.facture, this.echelon);
    const { faits, total } = this.avancement;
    this.visible = total > 0 && (this.enControle || faits > 0);
    this.complet = total > 0 && faits === total;
  }

  get libelleEchelon(): string {
    return this.echelon === 'centre' ? 'le district' : 'le service régional';
  }
}
