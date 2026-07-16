import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/user.model';

/**
 * Garde de route base sur les roles.
 * Usage : { path: '...', canActivate: [roleGuard], data: { roles: [Role.SERVICE_REGIONAL, Role.ADMIN] } }
 */
export const roleGuard = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  let allowed = (route.data?.['roles'] || route.routeConfig?.data?.['roles']) as Role[] | undefined;

  // Fallback de securite si les donnees de route ne sont pas encore resolues.
  if (!allowed || allowed.length === 0) {
    const path = route.routeConfig?.path || route.url.map(segment => segment.path).join('/');
    if (path.includes('espace-bcsu')) allowed = [Role.BCSU];
    else if (path.includes('espace-pharmacie')) allowed = [Role.PHARMACIEN];
    else if (path.includes('espace-region')) allowed = [Role.SERVICE_REGIONAL];
    else if (path.includes('espace-central')) allowed = [Role.SERVICE_CENTRAL];
    else if (path.includes('espace-structure')) allowed = [Role.STRUCTURE_SANITAIRE];
    else allowed = [];
  }

  const user = authService.getCurrentUser();

  if (user && allowed.includes(user.role)) {
    return true;
  }

  if (!user) {
    return router.parseUrl('/auth/login');
  }

  console.warn('Acces refuse. Role non autorise pour cette route.');
  switch (user.role) {
    case Role.PHARMACIEN:
      return router.parseUrl('/dashboard/espace-pharmacie');
    case Role.SERVICE_REGIONAL:
      return router.parseUrl('/dashboard/espace-region');
    case Role.SERVICE_CENTRAL:
      return router.parseUrl('/dashboard/espace-central');
    case Role.ADMIN:
      return router.parseUrl('/dashboard/regions');
    case Role.BCSU:
      return router.parseUrl('/dashboard/espace-bcsu');
    case Role.STRUCTURE_SANITAIRE:
      return router.parseUrl('/dashboard/espace-structure');
    default:
      authService.logout();
      return false;
  }
};
