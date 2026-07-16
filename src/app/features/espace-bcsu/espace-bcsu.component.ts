import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LettreGarantieFormComponent } from './lettre-garantie-form/lettre-garantie-form.component';
import { AuthService } from '../../core/services/auth.service';
import { PointageUiService } from '../../core/services/pointage-ui.service';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-espace-bcsu',
  standalone: true,
  imports: [CommonModule, LettreGarantieFormComponent, MatIconModule, MatButtonModule],
  templateUrl: './espace-bcsu.component.html',
  styleUrls: ['./espace-bcsu.component.css']
})
export class EspaceBcsuComponent implements OnInit {
  currentUser: any = null;
  
  private destroyRef = inject(DestroyRef);
  private authService = inject(AuthService);
  private pointageUi = inject(PointageUiService);

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    
  }

  /** Ouvre la modale de pointage de départ, affichée par le MainLayout. */
  ouvrirDepartModal() {
    this.pointageUi.requestDepart();
  }

}

