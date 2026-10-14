import { HttpInterceptorFn, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/** Pas de barre de progression pour cette requête (elle peut quand même retenir l'affichage de la page). */
export const SKIP_LOADING = new HttpContextToken<boolean>(() => false);

/**
 * Tâche d'arrière-plan : ne retient pas l'affichage de la page (`AttentePageComponent`).
 * Pour ce qui n'est pas la donnée de l'écran — compteurs des badges, revalidation d'un cache
 * déjà affiché, synchronisation hors ligne — ou qui a son propre indicateur de chargement.
 */
export const ARRIERE_PLAN = new HttpContextToken<boolean>(() => false);

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const barre = !req.context.get(SKIP_LOADING);
  const page = !req.context.get(ARRIERE_PLAN);
  if (!barre && !page) {
    return next(req);
  }

  const loadingService = inject(LoadingService);

  if (barre) loadingService.show();
  const generation = page ? loadingService.debutRequetePage() : 0;

  return next(req).pipe(
    finalize(() => {
      if (barre) loadingService.hide();
      if (page) loadingService.finRequetePage(generation);
    })
  );
};
