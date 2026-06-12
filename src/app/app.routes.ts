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
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'factures',
        canActivate: [roleGuard],
        data: { roles: [Role.PHARMACIEN] },
        loadComponent: () => import('./features/factures/factures-list/factures-list.component').then(m => m.FacturesListComponent)
      },
      {
        path: 'factures-regionales',
        canActivate: [roleGuard],
        data: { roles: [Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/regional-factures/regional-factures.component').then(m => m.RegionalFacturesComponent)
      },
      {
        // L'ancien formulaire « Saisie Rapide » est remplacé par la page Facturation (dashboard).
        path: 'factures/create',
        redirectTo: '',
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
        path: 'stats',
        loadComponent: () => import('./features/stats/stats.component').then(m => m.StatsComponent)
      },
      {
        path: 'pharmacies',
        canActivate: [roleGuard],
        // Gestion des pharmacies réservée au Service Régional (Central et Admin exclus)
        data: { roles: [Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/pharmacies/pharmacies.component').then(m => m.PharmaciesComponent)
      },
      {
        path: 'regions',
        loadComponent: () => import('./features/admin-regions/admin-regions.component').then(m => m.AdminRegionsComponent)
      },
      {
        path: 'utilisateurs',
        loadComponent: () => import('./features/utilisateurs/utilisateurs.component').then(m => m.UtilisateursComponent)
      },
      {
        path: 'medicaments',
        loadComponent: () => import('./features/medicaments/medicaments.component').then(m => m.MedicamentsComponent)
      }
    ]
  }
];
