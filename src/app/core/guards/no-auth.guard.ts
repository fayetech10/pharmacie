import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard pour la page de login :
 * Si l'utilisateur est déjà connecté, le redirige vers /dashboard
 * pour éviter de voir la page de login inutilement.
 */
export const noAuthGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};
