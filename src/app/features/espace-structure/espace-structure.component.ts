import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FactureStructureFormComponent } from './facture-structure-form/facture-structure-form.component';
import { FacturesStructureListComponent } from './factures-structure-list/factures-structure-list.component';
import { PostesFacturesComponent } from './postes-factures/postes-factures.component';

@Component({
  selector: 'app-espace-structure',
  standalone: true,
  imports: [CommonModule, FactureStructureFormComponent, FacturesStructureListComponent, PostesFacturesComponent],
  templateUrl: './espace-structure.component.html'
})
export class EspaceStructureComponent implements OnInit {
  /** 0 Nouvelle facturation · 1 Mes factures · 2 Factures postes de santé — piloté par la sidebar (?tab=). */
  selectedTab = 0;
  private destroyRef = inject(DestroyRef);

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab >= 0 && tab <= 2 ? tab : 0;
      });
  }
}
