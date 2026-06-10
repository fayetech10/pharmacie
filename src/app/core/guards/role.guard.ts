import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/user.model';

/**
 * Garde de route basé sur les rôles.
 * Usage : { path: '...', canActivate: [roleGuard], data: { roles: [Role.SERVICE_REGIONAL, Role.ADMIN] } }
 */
export const roleGuard = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const allowed = (route.data?.['roles'] as Role[] | undefined) ?? [];
  const user = authService.getCurrentUser();

  if (user && allowed.includes(user.role)) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};
