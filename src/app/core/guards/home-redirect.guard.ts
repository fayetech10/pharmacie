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
  if (auth.isAdmin()) return router.parseUrl('/dashboard/espace-admin');
  if (auth.isBcsu()) return router.parseUrl('/dashboard/espace-bcsu');
  if (auth.isDistrict()) return router.parseUrl('/dashboard/espace-district');
  if (auth.isPosteDeSante()) return router.parseUrl('/dashboard/espace-poste');
  if (auth.isCentreDeSante()) return router.parseUrl('/dashboard/espace-centre');
  if (auth.isStructureSanitaire()) return router.parseUrl('/dashboard/espace-structure');

  // Session invalide ou rôle inconnu : déconnexion propre pour éviter les boucles de redirection.
  console.warn('Session invalide ou rôle inconnu dans homeRedirectGuard, déconnexion...');
  auth.logout();
  return router.parseUrl('/auth/login');
};
