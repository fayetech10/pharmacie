import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * Restaure la dernière page visitée au redémarrage de l'application (PWA mobile : téléphone
 * éteint puis rallumé, ou simple rechargement). À chaque navigation authentifiée on mémorise
 * l'URL ; au démarrage « à froid » sur la racine, si une session est ouverte, on y redirige.
 *
 * <p>La restauration ne se déclenche QUE lorsque l'application est ouverte sur la racine ('/')
 * avec une session déjà active — c'est le cas d'un lancement de PWA (start_url = '/'). Si
 * l'utilisateur entre directement sur une route précise (lien profond, rechargement d'une page),
 * on le laisse là. La mémorisation est bornée par la session : voir {@link AuthService}
 * (localStorage, jeton 24 h, inactivité 30 min).</p>
 */
@Injectable({ providedIn: 'root' })
export class RestaurationRouteService {
  /** Clé localStorage ; purgée aussi par AuthService.clearSession (déconnexion). */
  static readonly CLE = 'csu_derniere_route';

  private initialise = false;

  constructor(private router: Router, private auth: AuthService) {}

  /** À appeler une fois au démarrage (AppComponent). Arme la mémorisation et la restauration. */
  initialiser(): void {
    if (this.initialise) return;
    this.initialise = true;

    // Point d'entrée réel, lu avant toute navigation Angular : '/' = lancement de la PWA.
    const entree = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    let premiere = true;

    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        const url = e.urlAfterRedirects;

        if (premiere) {
          premiere = false;
          const sauvegardee = this.lire();
          if (this.auth.isLoggedIn() && sauvegardee && entree === '/' && sauvegardee !== url) {
            // Démarrage à froid sur la racine, session ouverte : on rouvre la dernière page.
            this.router.navigateByUrl(sauvegardee).catch(() => { /* route périmée : on reste sur l'accueil */ });
            return; // ne pas écraser la route mémorisée par la page d'accueil
          }
        }

        if (this.auth.isLoggedIn() && this.estRestaurable(url)) {
          try { localStorage.setItem(RestaurationRouteService.CLE, url); } catch { /* stockage indisponible */ }
        }
      });
  }

  private lire(): string | null {
    try {
      const v = localStorage.getItem(RestaurationRouteService.CLE);
      return v && this.estRestaurable(v) ? v : null;
    } catch {
      return null;
    }
  }

  /** Routes qu'il est pertinent de restaurer : ni la racine nue, ni les écrans d'authentification. */
  private estRestaurable(url: string): boolean {
    if (!url) return false;
    const chemin = url.split(/[?#]/)[0];
    return chemin !== '/' && !chemin.startsWith('/auth');
  }
}
