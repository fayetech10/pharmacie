import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { noAuthGuard } from './core/guards/no-auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';
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
        // Accueil du tableau de bord : redirige vers l'espace selon le rôle.
        path: '',
        pathMatch: 'full',
        canActivate: [homeRedirectGuard],
        children: []
      },
      {
        path: 'espace-pharmacie/factures',
        canActivate: [roleGuard],
        data: { roles: [Role.PHARMACIEN] },
        loadComponent: () => import('./features/espace-pharmacie/pharmacie-factures.component').then(m => m.PharmacieFacturesComponent)
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
        // Alias historique : même redirection dynamique selon le rôle.
        path: 'espace',
        pathMatch: 'full',
        canActivate: [homeRedirectGuard],
        children: []
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
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/utilisateurs/utilisateurs.component').then(m => m.UtilisateursComponent)
      },
      {
        path: 'pointages',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.SERVICE_CENTRAL] },
        loadComponent: () => import('./features/pointages/pointages.component').then(m => m.PointagesComponent)
      },
      {
        path: 'statistiques-agents',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/statistiques/statistiques-agents.component').then(m => m.StatistiquesAgentsComponent)
      },
      {
        path: 'patients',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.BCSU, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/patients/patients.component').then(m => m.PatientsComponent)
      },
      {
        path: 'patients/:id',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.BCSU, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/patients/patient-detail/patient-detail.component').then(m => m.PatientDetailComponent)
      },
      {
        path: 'pharmacies',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.SERVICE_CENTRAL] },
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
      },
      {
        path: 'espace-bcsu',
        canActivate: [roleGuard],
        data: { roles: [Role.BCSU] },
        loadComponent: () => import('./features/espace-bcsu/espace-bcsu.component').then(m => m.EspaceBcsuComponent)
      },
      {
        path: 'lettres-garantie/:id/edit',
        canActivate: [roleGuard],
        data: { roles: [Role.BCSU, Role.ADMIN] },
        loadComponent: () => import('./features/espace-bcsu/lettre-garantie-form/lettre-garantie-form.component').then(m => m.LettreGarantieFormComponent)
      },
      {
        path: 'lettres-garantie/:id',
        canActivate: [roleGuard],
        // Le Service Régional consulte en lecture seule les lettres émises dans sa région.
        data: { roles: [Role.BCSU, Role.ADMIN, Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/espace-bcsu/lettre-garantie-detail/lettre-garantie-detail.component').then(m => m.LettreGarantieDetailComponent)
      },
      {
        path: 'espace-structure',
        canActivate: [roleGuard],
        data: { roles: [Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/espace-structure/espace-structure.component').then(m => m.EspaceStructureComponent)
      },
      {
        // Feuilles de soins : circuit patient → agent bureau (BCSU) → facturation structure.
        path: 'feuilles-soins',
        canActivate: [roleGuard],
        data: { roles: [Role.BCSU, Role.ADMIN, Role.SERVICE_REGIONAL, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/feuilles-soins/feuilles-soins-list.component').then(m => m.FeuillesSoinsListComponent)
      },
      {
        path: 'feuilles-soins/new',
        canActivate: [roleGuard],
        data: { roles: [Role.BCSU, Role.ADMIN] },
        loadComponent: () => import('./features/feuilles-soins/feuille-soins-form.component').then(m => m.FeuilleSoinsFormComponent)
      },
      {
        path: 'feuilles-soins/:id',
        canActivate: [roleGuard],
        data: { roles: [Role.BCSU, Role.ADMIN, Role.SERVICE_REGIONAL, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/feuilles-soins/feuille-soins-detail.component').then(m => m.FeuilleSoinsDetailComponent)
      },
      {
        path: 'factures-structure/:id',
        canActivate: [roleGuard],
        data: { roles: [Role.STRUCTURE_SANITAIRE, Role.SERVICE_REGIONAL, Role.SERVICE_CENTRAL, Role.ADMIN] },
        loadComponent: () => import('./features/espace-structure/facture-structure-detail/facture-structure-detail.component').then(m => m.FactureStructureDetailComponent)
      },
      {
        path: 'structures-sanitaires',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.SERVICE_CENTRAL] },
        loadComponent: () => import('./features/structures-sanitaires/structures-sanitaires.component').then(m => m.StructuresSanitairesComponent)
      }
    ]
  }
];
