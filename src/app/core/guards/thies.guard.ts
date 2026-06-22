import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { RegionService } from '../services/region.service';

/**
 * Garde de route réservant l'accès au service régional de Thiès.
 * Usage : { path: 'bases', canActivate: [authGuard, thiesGuard], ... }
 * Le contrôle d'accès est ré-appliqué côté backend (défense en profondeur).
 */
export const thiesGuard: CanActivateFn = () => {
  const regionService = inject(RegionService);
  const router = inject(Router);

  return regionService.isCurrentUserThies().pipe(
    map(ok => (ok ? true : router.createUrlTree(['/dashboard'])))
  );
};
