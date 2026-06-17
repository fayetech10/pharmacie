import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Redirige la racine du tableau de bord (`/dashboard` et `/dashboard/espace`)
 * vers l'écran d'accueil correspondant au rôle de l'utilisateur connecté.
 *
 * Remplace l'ancienne redirection statique vers `espace-pharmacie`, qui
 * échouait au roleGuard pour tous les rôles non-pharmacien — l'ADMIN se
 * retrouvait notamment bloqué sur une page blanche (outlet vide).
 */
export const homeRedirectGuard = (): UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isPharmacien()) return router.parseUrl('/dashboard/espace-pharmacie');
  if (auth.isServiceRegional()) return router.parseUrl('/dashboard/espace-region');
  if (auth.isServiceCentral()) return router.parseUrl('/dashboard/espace-central');
  if (auth.isAdmin()) return router.parseUrl('/dashboard/regions');

  // Session invalide ou rôle inconnu : retour à la connexion.
  return router.parseUrl('/auth/login');
};
