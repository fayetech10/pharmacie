import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FacturesListComponent } from '../factures/factures-list/factures-list.component';

@Component({
  selector: 'app-pharmacie-factures',
  standalone: true,
  imports: [CommonModule, FacturesListComponent],
  template: `
    <div class="fade-in">
      <app-factures-list [monthlyView]="true" [showToolbar]="false"></app-factures-list>
    </div>
  `
})
export class PharmacieFacturesComponent {}
