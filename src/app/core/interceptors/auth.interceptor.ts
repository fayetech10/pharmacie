import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  let modifiedReq = req;
  if (token) {
    modifiedReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  return next(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 = session invalide → déconnexion.
      // 403 = refus d'accès : ne déconnecter que si le token est absent/expiré.
      //   Un « accès refusé » métier (ex: endpoint réservé à un autre rôle) ne doit
      //   pas détruire une session encore valide et renvoyer à la page de connexion.
      if (error.status === 401 || (error.status === 403 && authService.isSessionExpired())) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
