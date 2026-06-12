import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { of, timer } from 'rxjs';
import { switchMap, map, distinctUntilChanged } from 'rxjs/operators';
import { LoadingService } from '../../core/services/loading.service';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-spinner.component.html',
  styleUrls: ['./loading-spinner.component.css']
})
export class LoadingSpinnerComponent {
  private loadingService = inject(LoadingService);

  /**
   * Barre de chargement non bloquante : on ne l'affiche que si la requête dure
   * plus de 250 ms. Les navigations rapides ne déclenchent donc aucun flash,
   * ce qui rend la navigation fluide.
   */
  showLoader$ = this.loadingService.isLoading$.pipe(
    switchMap(loading => (loading ? timer(250).pipe(map(() => true)) : of(false))),
    distinctUntilChanged()
  );
}
