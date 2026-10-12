import { ApplicationConfig, LOCALE_ID, isDevMode } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { AdaptateurDateFr, FORMATS_DATE_FR } from './core/utils/adaptateur-date-fr';
import { authInterceptor } from './core/interceptors/auth.interceptor';

// Enregistre les données de locale française (formats nombres/dates/CFA)
registerLocaleData(localeFr, 'fr');

import { loadingInterceptor } from './core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor])),
    // Enregistre tous les contrôleurs Chart.js (barres, doughnut, lignes…) pour ng2-charts.
    provideCharts(withDefaultRegisterables()),
    { provide: LOCALE_ID, useValue: 'fr' },

    // Application installable et utilisable hors ligne (ngsw-config.json) : l'application
    // entière est mise en cache à la première visite. Désactivé en développement (ng serve).
    // Exige HTTPS (ou localhost), comme toute application web hors ligne.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),

    // Calendriers en français, saisie et affichage en jj/mm/aaaa (cf. AdaptateurDateFr).
    // Déclaré ICI et pas dans les composants : un MatNativeDateModule importé par un
    // composant standalone fournit son propre DateAdapter et masquerait celui-ci pour
    // cet écran — on aurait des calendriers français partout sauf à un endroit.
    { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },
    { provide: DateAdapter, useClass: AdaptateurDateFr, deps: [MAT_DATE_LOCALE] },
    { provide: MAT_DATE_FORMATS, useValue: FORMATS_DATE_FR }
  ]
};
