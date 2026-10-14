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
        path: 'espace-admin',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () => import('./features/espace-admin/espace-admin.component').then(m => m.EspaceAdminComponent)
      },
      {
        path: 'espace-district',
        canActivate: [roleGuard],
        data: { roles: [Role.DISTRICT] },
        loadComponent: () => import('./features/espace-district/espace-district.component').then(m => m.EspaceDistrictComponent)
      },
      {
        path: 'espace-poste',
        canActivate: [roleGuard],
        data: { roles: [Role.POSTE_SANTE, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/espace-poste/espace-poste.component').then(m => m.EspacePosteComponent)
      },
      {
        // Facture mensuelle de l'Espace PS (poste comme centre de santé) : consultation, et
        // modification des dossiers patients.
        path: 'espace-ps/factures/:id',
        canActivate: [roleGuard],
        data: { roles: [Role.POSTE_SANTE, Role.CENTRE_SANTE, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/espace-poste/facture-poste-detail/facture-poste-detail.component').then(m => m.FacturePosteDetailComponent)
      },
      {
        // Détail d'un patient (une visite) de cette facture : identité, prestations, dossier.
        path: 'espace-ps/factures/:id/patients/:visite',
        canActivate: [roleGuard],
        data: { roles: [Role.POSTE_SANTE, Role.CENTRE_SANTE, Role.STRUCTURE_SANITAIRE], contexte: 'espace-ps' },
        loadComponent: () => import('./features/espace-poste/patient-facture-detail/patient-facture-detail.component').then(m => m.PatientFactureDetailComponent)
      },
      { path: 'espace-poste/factures/:id', redirectTo: 'espace-ps/factures/:id' },
      {
        path: 'espace-centre',
        canActivate: [roleGuard],
        data: { roles: [Role.CENTRE_SANTE, Role.STRUCTURE_SANITAIRE] },
        loadComponent: () => import('./features/espace-centre/espace-centre.component').then(m => m.EspaceCentreComponent)
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
        // Détail d'un patient d'une facture de pharmacie : médicaments et dossier (même gabarit que les points de soins).
        path: 'factures/:id/patients/:patient',
        loadComponent: () => import('./features/factures/facture-patient-detail/facture-patient-detail.component').then(m => m.FacturePatientDetailComponent)
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
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.BCSU, Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE] },
        loadComponent: () => import('./features/patients/patients.component').then(m => m.PatientsComponent)
      },
      {
        path: 'patients/:id',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_REGIONAL, Role.BCSU, Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE] },
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
        canActivate: [roleGuard],
        // Référentiels éligibles / exclusions : administrés par la SEN-CSU (service central) et l'admin.
        data: { roles: [Role.ADMIN, Role.SERVICE_CENTRAL] },
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
        // Espace du point de soins : saisie, mes factures, factures des postes polarisés,
        // module Hors CSU. POSTE_SANTE / CENTRE_SANTE sont les rôles de l'architecture
        // microservices ; STRUCTURE_SANITAIRE reste accepté pour les comptes existants.
        path: 'espace-structure',
        canActivate: [roleGuard],
        data: { roles: [Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE] },
        loadComponent: () => import('./features/espace-structure/espace-structure.component').then(m => m.EspaceStructureComponent)
      },
      {
        // Référentiel Service → Prestation → Prix (§5) : administré par le niveau central.
        path: 'referentiel',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_CENTRAL] },
        loadComponent: () => import('./features/referentiel/prestations.component').then(m => m.PrestationsComponent)
      },
      {
        // Prestations par défaut des postes de santé (catalogue national « PS », 14/10/2026).
        path: 'prestations-postes',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN] },
        loadComponent: () => import('./features/prestations-postes/prestations-postes.component').then(m => m.PrestationsPostesComponent)
      },
      {
        // Districts sanitaires (§6) : la maille de consolidation.
        path: 'districts',
        canActivate: [roleGuard],
        data: { roles: [Role.ADMIN, Role.SERVICE_CENTRAL, Role.SERVICE_REGIONAL] },
        loadComponent: () => import('./features/districts/districts.component').then(m => m.DistrictsComponent)
      },
      {
        // Consolidation district et tableau de bord (§9-§10) : réservée STRICTEMENT au district.
        path: 'consolidation',
        canActivate: [roleGuard],
        data: { roles: [Role.DISTRICT] },
        loadComponent: () => import('./features/consolidation/consolidation.component').then(m => m.ConsolidationComponent)
      },
      {
        // Feuilles de soins : circuit patient → agent bureau (BCSU) → facturation structure.
        path: 'feuilles-soins',
        canActivate: [roleGuard],
        data: { roles: [Role.BCSU, Role.ADMIN, Role.SERVICE_REGIONAL, Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE] },
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
        data: { roles: [Role.BCSU, Role.ADMIN, Role.SERVICE_REGIONAL, Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE] },
        loadComponent: () => import('./features/feuilles-soins/feuille-soins-detail.component').then(m => m.FeuilleSoinsDetailComponent)
      },
      {
        path: 'factures-structure/:id',
        canActivate: [roleGuard],
        // DISTRICT : contrôle des factures des postes de santé de son district.
        data: { roles: [Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE, Role.DISTRICT, Role.SERVICE_REGIONAL, Role.SERVICE_CENTRAL, Role.ADMIN] },
        loadComponent: () => import('./features/espace-structure/facture-structure-detail/facture-structure-detail.component').then(m => m.FactureStructureDetailComponent)
      },
      {
        // Détail d'un patient de cette facture (même écran que l'Espace PS) : contrôle, pointage, corrections.
        path: 'factures-structure/:id/patients/:visite',
        canActivate: [roleGuard],
        data: {
          roles: [Role.STRUCTURE_SANITAIRE, Role.POSTE_SANTE, Role.CENTRE_SANTE, Role.DISTRICT, Role.SERVICE_REGIONAL, Role.SERVICE_CENTRAL, Role.ADMIN],
          contexte: 'structure'
        },
        loadComponent: () => import('./features/espace-poste/patient-facture-detail/patient-facture-detail.component').then(m => m.PatientFactureDetailComponent)
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
