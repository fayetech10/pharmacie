import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingSpinnerComponent } from './shared/loading-spinner/loading-spinner.component';
import { InstallationService } from './core/hors-ligne/installation.service';
import { RestaurationRouteService } from './core/services/restauration-route.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingSpinnerComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'pharmacie-csu-frontend';

  // Construit dès le démarrage : la proposition d'installation du navigateur n'arrive qu'une
  // fois, tôt, souvent avant même la connexion.
  constructor(_installation: InstallationService, private restaurationRoute: RestaurationRouteService) {}

  ngOnInit(): void {
    // Mémorise la page courante et, au lancement « à froid », rouvre la dernière page visitée.
    this.restaurationRoute.initialiser();
  }
}
