import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { ReseauService } from '../hors-ligne/reseau.service';
import { catchError, tap } from 'rxjs/operators';
import { throwError } from 'rxjs';

/**
 * Reconnaît le refus émis par le filtre JWT côté serveur quand le compte utilise encore
 * un mot de passe provisoire. Le message est le seul marqueur disponible : le statut 403
 * sert aussi aux refus de rôle, qu'il ne faut surtout pas traiter par une déconnexion.
 */
function motDePasseProvisoire(error: HttpErrorResponse): boolean {
  const message = error.error?.message;
  return typeof message === 'string' && message.startsWith('Mot de passe provisoire');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const reseau = inject(ReseauService);
  const token = authService.getToken();

  let modifiedReq = req;
  if (token) {
    modifiedReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  return next(modifiedReq).pipe(
    // État du réseau tenu à jour par les requêtes elles-mêmes (cf. ReseauService).
    tap(evenement => {
      if (evenement instanceof HttpResponse) reseau.signalerReponse();
    }),
    catchError((error: HttpErrorResponse) => {
      if (error.status === 0) {
        reseau.signalerEchec();
        return throwError(() => error);
      }
      reseau.signalerReponse();

      // Session ouverte hors ligne dont le jeton a expiré : le serveur la refuse. On ne
      // déconnecte pas (l'agent perdrait le patient en cours de saisie) : on lui demande de
      // se reconnecter, sur place, et ses saisies partent ensuite.
      if ((error.status === 401 || error.status === 403) && authService.estSessionHorsLigne()
          && authService.isSessionExpired()) {
        authService.signalerReconnexionRequise();
        return throwError(() => error);
      }

      // 401 = session invalide → déconnexion.
      // 403 = refus d'accès : ne déconnecter que si le token est absent/expiré.
      //   Un « accès refusé » métier (ex: endpoint réservé à un autre rôle) ne doit
      //   pas détruire une session encore valide et renvoyer à la page de connexion.
      if (error.status === 401 || (error.status === 403 && authService.isSessionExpired())) {
        authService.logout();
      } else if (error.status === 403 && motDePasseProvisoire(error)) {
        // Compte dont le mot de passe n'a pas encore été choisi : le serveur refuse tout
        // sauf la régularisation, donc insister est inutile. On renvoie à la connexion,
        // qui impose le changement. Sans ça l'utilisateur reste sur un écran qui échoue
        // requête après requête, avec un message perdu dans la console.
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
