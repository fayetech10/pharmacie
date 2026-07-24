import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LettreGarantieFormComponent } from './lettre-garantie-form/lettre-garantie-form.component';
import { PatientsComponent } from '../patients/patients.component';
import { ConstatsBcsuComponent } from './constats-bcsu/constats-bcsu.component';
import { ParametrageBcsuComponent } from './parametrage-bcsu/parametrage-bcsu.component';
import { AuthService } from '../../core/services/auth.service';
import { PointageUiService } from '../../core/services/pointage-ui.service';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

/**
 * Espace BCSU — onglets du cahier des charges :
 * 0 Enregistrement · 1 Patients enregistrés · 2 Constats · 3 Paramétrage.
 */
@Component({
  selector: 'app-espace-bcsu',
  standalone: true,
  imports: [
    CommonModule, LettreGarantieFormComponent, PatientsComponent,
    ConstatsBcsuComponent, ParametrageBcsuComponent, MatIconModule, MatButtonModule
  ],
  templateUrl: './espace-bcsu.component.html'
})
export class EspaceBcsuComponent implements OnInit {
  currentUser: any = null;
  selectedTab = 0;

  readonly tabs = [
    { label: 'Enregistrement', icon: 'note_add' },
    { label: 'Patients enregistrés', icon: 'group' },
    { label: 'Constats', icon: 'fact_check' },
    { label: 'Paramétrage', icon: 'settings' }
  ];

  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private pointageUi = inject(PointageUiService);

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab >= 0 && tab < this.tabs.length ? tab : 0;
      });
  }

  /** Ouvre la modale de pointage de départ, affichée par le MainLayout. */
  ouvrirDepartModal() {
    this.pointageUi.requestDepart();
  }
}
