import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const utilisateur = authService.getCurrentUser();
  if (!utilisateur) {
    return router.parseUrl('/auth/login');
  }

  // Mot de passe encore provisoire : le serveur refuse désormais toute requête de ce
  // compte (403), l'écran s'afficherait donc vide ou en erreur. On renvoie à la
  // connexion, qui impose le choix du mot de passe avant d'entrer.
  //
  // Le cas se produit avec une session ouverte AVANT la régularisation : elle est
  // restaurée depuis le stockage local, et sans ce contrôle rien ne la réexaminait.
  if (utilisateur.mustChangePassword) {
    authService.logout();
    return router.parseUrl('/auth/login');
  }

  return true;
};
