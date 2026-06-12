import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { authInterceptor } from './core/interceptors/auth.interceptor';

// Enregistre les données de locale française (formats nombres/dates/CFA)
registerLocaleData(localeFr, 'fr');

import { loadingInterceptor } from './core/interceptors/loading.interceptor';

/** Pagination en français, format compact « 1–10 / 45 » (style maquette mobile). */
function frenchPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Par page';
  intl.nextPageLabel = 'Page suivante';
  intl.previousPageLabel = 'Page précédente';
  intl.firstPageLabel = 'Première page';
  intl.lastPageLabel = 'Dernière page';
  intl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) return '0 / 0';
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, length);
    return `${start}–${end} / ${length}`;
  };
  return intl;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor])),
    { provide: LOCALE_ID, useValue: 'fr' },
    { provide: MatPaginatorIntl, useValue: frenchPaginatorIntl() }
  ]
};
