import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { noAuthGuard } from './core/guards/no-auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { Role } from './core/models/user.model';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'auth/login',
    canActivate: [noAuthGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'espace',
        pathMatch: 'full'
      },
      {
        path: 'espace-pharmacie',
        canActivate: [roleGuard],
        data: { roles: [Role.PHARMACIEN] },
        loadComponent: () => import('./features/espace-pharmacie/espace-pharmacie.component').then(m => m.EspacePharmacieComponent)
      },
      {
        path: 'espace-region',
        canActivate: [roleGuard],
        data: { roles: [Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/espace-region/espace-region.component').then(m => m.EspaceRegionComponent)
      },
      {
        path: 'espace-central',
        canActivate: [roleGuard],
        data: { roles: [Role.SERVICE_CENTRAL] },
        loadComponent: () => import('./features/espace-central/espace-central.component').then(m => m.EspaceCentralComponent)
      },
      {
        path: 'espace',
        // Generic route that will be handled by a generic redirect or in the layout
        redirectTo: 'espace-pharmacie', // We will handle dynamic redirection in main-layout or an auth-guard. Let's just keep the routes accessible.
        pathMatch: 'full'
      },
      {
        path: 'factures/:id/edit',
        loadComponent: () => import('./features/factures/facture-form/facture-form.component').then(m => m.FactureFormComponent)
      },
      {
        path: 'factures/:id',
        loadComponent: () => import('./features/factures/facture-detail/facture-detail.component').then(m => m.FactureDetailComponent)
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () => import('./features/utilisateurs/utilisateurs.component').then(m => m.UtilisateursComponent)
      },
      {
        path: 'pharmacies',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/pharmacies/pharmacies.component').then(m => m.PharmaciesComponent)
      },
      {
        path: 'regions',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () => import('./features/admin-regions/admin-regions.component').then(m => m.AdminRegionsComponent)
      },
      {
        path: 'medicaments',
        loadComponent: () => import('./features/medicaments/medicaments.component').then(m => m.MedicamentsComponent)
      }
    ]
  }
];
