import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SrGestionService, ControleurSR } from '../services/sr-gestion.service';
import { UserService } from '../../../core/services/user.service';
import { StructureService } from '../../../core/services/structure.service';
import { PharmacieService } from '../../../core/services/pharmacie.service';
import { DistrictService } from '../../../core/services/district.service';
import { AuthService } from '../../../core/services/auth.service';
import { StructureSanitaire, StructureSanitaireRequest, typeEffectifStructure } from '../../../core/models/structure.model';
import { Pharmacie } from '../../../core/models/pharmacie.model';
import { District } from '../../../core/models/referentiel.model';
import { User, Role } from '../../../core/models/user.model';

@Component({
  selector: 'app-parametrage-sr',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './parametrage-sr.component.html'
})
export class ParametrageSrComponent implements OnInit {
  activeSubTab: 0 | 1 | 2 | 3 = 0; // 0 = Structures, 1 = Pharmacies, 2 = BCSU, 3 = Contrôleurs

  // Données
  structures: StructureSanitaire[] = [];
  pharmacies: Pharmacie[] = [];
  agentsBcsu: User[] = [];
  controleurs: ControleurSR[] = [];
  districts: District[] = [];

  // Modals de création
  afficherModalStructure = false;
  afficherModalPharmacie = false;
  afficherModalBcsu = false;
  afficherModalControleur = false;
  afficherModalAcces = false;
  afficherModalModificationPoste = false;
  posteEnModification: StructureSanitaire | null = null;
  enregistrementPosteEnCours = false;
  modificationPoste = {
    nom: '',
    adresse: '',
    telephone: '',
    email: '',
    structureRattachementId: '',
    districtId: ''
  };

  // Données modal accès
  accesInfo = {
    titre: '',
    identifiant: '',
    motDePasse: '',
    email: '',
    role: ''
  };

  // Formulaires simples
  nouveauControleur = {
    nom: '',
    prenom: '',
    email: '',
    telephone: ''
  };

  nouvelleStructure = {
    nom: '',
    typeStructure: 'CS',
    districtNom: '',
    regionId: '',
    email: '',
    telephone: ''
  };

  nouvellePharmacie = {
    nom: '',
    code: '',
    ville: '',
    adresse: '',
    telephone: '',
    email: '',
    regionId: ''
  };

  nouvelAgentBcsu = {
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    regionId: ''
  };

  loading = false;

  constructor(
    public srService: SrGestionService,
    private userService: UserService,
    private structureService: StructureService,
    private pharmacieService: PharmacieService,
    private districtService: DistrictService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.chargerTousLesParametres();
  }

  chargerTousLesParametres(): void {
    this.loading = true;

    // 1. Contrôleurs
    this.controleurs = this.srService.getControleurs();

    // 2. Districts
    this.districtService.getDistricts().subscribe({
      next: (data) => {
        this.districts = data || [];
      },
      error: () => { this.districts = []; this.snackBar.open('Impossible de charger les districts depuis le backend.', 'Fermer', { duration: 4000 }); }
    });

    // 3. Structures
    this.structureService.getStructures().subscribe({
      next: (data) => this.structures = data || [],
      error: () => { this.structures = []; this.snackBar.open('Impossible de charger les structures depuis le backend.', 'Fermer', { duration: 4000 }); }
    });

    // 4. Pharmacies
    this.pharmacieService.getAll().subscribe({
      next: (data) => this.pharmacies = data || [],
      error: () => { this.pharmacies = []; this.snackBar.open('Impossible de charger les pharmacies depuis le backend.', 'Fermer', { duration: 4000 }); }
    });

    // 5. Agents BCSU
    this.userService.getBcsu().subscribe({
      next: (data) => this.agentsBcsu = data || [],
      error: () => { this.agentsBcsu = []; this.snackBar.open('Impossible de charger les agents BCSU depuis le backend.', 'Fermer', { duration: 4000 }); }
    });

    this.loading = false;
  }

  // ===================== CONTRÔLEURS =====================

  creerControleur(): void {
    if (!this.nouveauControleur.nom.trim() || !this.nouveauControleur.prenom.trim()) {
      this.snackBar.open('Le nom et le prénom sont obligatoires', 'OK', { duration: 3000 });
      return;
    }

    this.loading = true;
    this.srService.creerControleur(this.nouveauControleur).subscribe({
      next: (c) => {
        this.loading = false;
        this.controleurs = this.srService.getControleurs();
        this.afficherModalControleur = false;

        this.afficherAcces({
          titre: `Nouveau Contrôleur créé : ${c.prenom} ${c.nom}`,
          identifiant: c.username,
          motDePasse: c.motDePasseTemp || '',
          email: c.email,
          role: 'Contrôleur Service Régional (Thiès)'
        });

        this.nouveauControleur = { nom: '', prenom: '', email: '', telephone: '' };
        this.snackBar.open('Contrôleur créé avec succès !', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur création contrôleur : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  basculerControleur(c: ControleurSR): void {
    this.srService.basculerActivationControleur(c.id);
    this.controleurs = this.srService.getControleurs();
    this.snackBar.open(`Compte de ${c.prenom} ${c.nom} ${!c.actif ? 'activé' : 'désactivé'}.`, 'OK', { duration: 2500 });
  }

  reinitialiserAccesControleur(c: ControleurSR): void {
    this.loading = true;
    this.srService.reinitialiserMotDePasseControleur(c.id).subscribe({
      next: (nouveauMdp) => {
        this.loading = false;
        this.afficherAcces({
          titre: `Identifiants réinitialisés : ${c.prenom} ${c.nom}`,
          identifiant: c.username,
          motDePasse: nouveauMdp,
          email: c.email,
          role: 'Contrôleur Service Régional'
        });
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Impossible de réinitialiser le mot de passe', 'Fermer', { duration: 3000 });
      }
    });
  }

  // ===================== STRUCTURES =====================

  creerStructure(): void {
    if (!this.nouvelleStructure.nom.trim()) {
      this.snackBar.open('Le nom de l\'établissement est obligatoire', 'Fermer', { duration: 3000 });
      return;
    }

    const typeStr = this.nouvelleStructure.typeStructure || 'CS';
    const regionId = this.authService.getCurrentUser()?.regionId;
    if (!regionId || this.districts.length === 0) {
      this.snackBar.open('La région ou les districts ne sont pas disponibles depuis le backend.', 'Fermer', { duration: 4000 });
      return;
    }
    const distNom = this.nouvelleStructure.districtNom || '';
    const districtObj = this.districts.find(d => d.nom === distNom || d.id === distNom || d.code === distNom) || this.districts[0];
    const mdp = 'SENCSU-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    this.loading = true;
    this.structureService.createStructure({
      nom: this.nouvelleStructure.nom.trim(),
      typeStructure: typeStr,
      districtId: districtObj?.id,
      regionId,
      email: this.nouvelleStructure.email ? this.nouvelleStructure.email.trim() : undefined,
      telephone: this.nouvelleStructure.telephone ? this.nouvelleStructure.telephone.trim() : undefined,
      password: mdp
    }).subscribe({
      next: (s) => {
        this.loading = false;
        this.structures = [s, ...this.structures];
        this.afficherModalStructure = false;

        this.afficherAcces({
          titre: `Nouvelle Structure créée : ${s.nom}`,
          identifiant: s.code || s.email || '',
          motDePasse: mdp,
          email: s.email || '',
          role: `Structure (${s.typeStructure || typeStr})`
        });

        this.nouvelleStructure = { nom: '', typeStructure: 'CS', districtNom: this.districts[0]?.nom || '', regionId, email: '', telephone: '' };
        this.snackBar.open('Structure sanitaire créée avec succès !', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur création structure : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  reinitialiserAccesStructure(s: StructureSanitaire): void {
    this.loading = true;
    this.structureService.reinitialiserMotDePasse(s.id).subscribe({
      next: (acces) => {
        this.loading = false;
        this.afficherAcces({
          titre: `Identifiants réinitialisés : ${s.nom}`,
          identifiant: acces.identifiant || s.code || '',
          motDePasse: acces.motDePasseTemporaire,
          email: s.email || '',
          role: `Structure (${s.typeStructure})`
        });
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur réinitialisation : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  basculerStructure(s: StructureSanitaire): void {
    s.actif = !s.actif;
    this.structureService.basculerActivation(s.id, s.actif).subscribe({
      error: () => {}
    });
    this.snackBar.open(`Structure ${s.nom} ${s.actif ? 'activée' : 'désactivée'}.`, 'OK', { duration: 2500 });
  }

  estPosteSante(s: StructureSanitaire): boolean {
    return typeEffectifStructure(s) === 'PS';
  }

  get centresRattachementPoste(): StructureSanitaire[] {
    return this.structures.filter(s => typeEffectifStructure(s) !== 'PS');
  }

  get districtsDuPoste(): District[] {
    const centre = this.centresRattachementPoste.find(s => s.id === this.modificationPoste.structureRattachementId);
    const regionId = centre?.regionId || this.posteEnModification?.regionId;
    return this.districts.filter(d => !regionId || !d.regionId || d.regionId === regionId);
  }

  get centreRattachementSelectionne(): StructureSanitaire | undefined {
    return this.centresRattachementPoste.find(s => s.id === this.modificationPoste.structureRattachementId);
  }

  selectionnerCentrePoste(): void {
    const centre = this.centreRattachementSelectionne;
    if (centre?.districtId) this.modificationPoste.districtId = centre.districtId;
    else this.modificationPoste.districtId = '';
  }

  ouvrirModificationPoste(poste: StructureSanitaire): void {
    this.posteEnModification = poste;
    this.modificationPoste = {
      nom: poste.nom || '',
      adresse: poste.adresse || '',
      telephone: poste.telephone || '',
      email: poste.email || '',
      structureRattachementId: poste.structureRattachementId || '',
      districtId: poste.districtId || ''
    };
    this.afficherModalModificationPoste = true;
  }

  fermerModificationPoste(): void {
    if (this.enregistrementPosteEnCours) return;
    this.afficherModalModificationPoste = false;
    this.posteEnModification = null;
  }

  enregistrerModificationPoste(): void {
    const poste = this.posteEnModification;
    const nom = this.modificationPoste.nom.trim();
    if (!poste || !nom) {
      this.snackBar.open('Le nom du poste est obligatoire.', 'Fermer', { duration: 3500 });
      return;
    }

    const centre = this.centresRattachementPoste.find(s => s.id === this.modificationPoste.structureRattachementId);
    if (!centre) {
      this.snackBar.open('Choisissez le centre de santé ou l’hôpital de rattachement.', 'Fermer', { duration: 4500 });
      return;
    }
    const districtId = centre.districtId || this.modificationPoste.districtId;
    if (!districtId) {
      this.snackBar.open('Le poste doit être rattaché à un district sanitaire.', 'Fermer', { duration: 4500 });
      return;
    }

    const requete: StructureSanitaireRequest = {
      code: poste.code,
      typeStructure: 'PS',
      nom,
      adresse: this.modificationPoste.adresse.trim() || undefined,
      telephone: this.modificationPoste.telephone.trim() || undefined,
      email: this.modificationPoste.email.trim() || undefined,
      regionId: centre.regionId || poste.regionId,
      districtId,
      siegeDistrict: false,
      bcsuId: poste.bcsuId,
      structureRattachementId: centre.id
    };

    this.enregistrementPosteEnCours = true;
    this.structureService.updateStructure(poste.id, requete).subscribe({
      next: (misAJour) => {
        this.structures = this.structures.map(s => s.id === misAJour.id ? misAJour : s);
        this.enregistrementPosteEnCours = false;
        this.afficherModalModificationPoste = false;
        this.posteEnModification = null;
        this.snackBar.open('Poste de santé modifié avec succès.', 'OK', { duration: 3500 });
      },
      error: (err) => {
        this.enregistrementPosteEnCours = false;
        this.snackBar.open('Erreur de modification : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5500 });
      }
    });
  }

  // ===================== PHARMACIES =====================

  creerPharmacie(): void {
    if (!this.nouvellePharmacie.nom.trim()) {
      this.snackBar.open('Le nom de la pharmacie est obligatoire', 'Fermer', { duration: 3000 });
      return;
    }

    const regionId = this.authService.getCurrentUser()?.regionId;
    if (!regionId) { this.snackBar.open('La région du compte connecté est introuvable.', 'Fermer', { duration: 4000 }); return; }
    const mdp = 'PHARMA-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const code = this.nouvellePharmacie.code.trim();
    const email = this.nouvellePharmacie.email.trim();
    if (!code || !email || !this.nouvellePharmacie.adresse.trim()) {
      this.snackBar.open('Le code, l’adresse et l’email de la pharmacie sont obligatoires.', 'Fermer', { duration: 4000 });
      return;
    }

    this.loading = true;
    this.pharmacieService.create({
      code,
      nom: this.nouvellePharmacie.nom.trim(),
      adresse: this.nouvellePharmacie.adresse.trim(),
      telephone: this.nouvellePharmacie.telephone,
      email,
      regionId,
      password: mdp
    }).subscribe({
      next: (p) => {
        this.loading = false;
        this.pharmacies = [p, ...this.pharmacies];
        this.afficherModalPharmacie = false;

        this.afficherAcces({
          titre: `Nouvelle Pharmacie enregistrée : ${p.nom}`,
          identifiant: p.code,
          motDePasse: (p as any).motDePasseTemporaire || '',
          email: p.email || email,
          role: 'Pharmacien Officine'
        });

        this.nouvellePharmacie = { nom: '', code: '', ville: '', adresse: '', telephone: '', email: '', regionId };
        this.snackBar.open('Pharmacie créée avec succès !', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur création pharmacie : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  basculerPharmacie(p: Pharmacie): void {
    const actif = !p.actif;
    this.pharmacieService.basculerActivation(p.id, actif).subscribe({
      next: () => { p.actif = actif; this.snackBar.open(`Pharmacie ${p.nom} ${actif ? 'activée' : 'désactivée'}.`, 'OK', { duration: 2500 }); },
      error: err => this.snackBar.open('Erreur de mise à jour : ' + (err?.error?.message || err.message), 'Fermer', { duration: 4000 })
    });
  }

  // ===================== BCSU =====================

  creerAgentBcsu(): void {
    if (!this.nouvelAgentBcsu.nom.trim() || !this.nouvelAgentBcsu.prenom.trim()) {
      this.snackBar.open('Le nom et le prénom sont obligatoires', 'Fermer', { duration: 3000 });
      return;
    }

    const regionId = this.authService.getCurrentUser()?.regionId;
    if (!regionId) { this.snackBar.open('La région du compte connecté est introuvable.', 'Fermer', { duration: 4000 }); return; }
    const username = `${this.nouvelAgentBcsu.prenom.toLowerCase().replace(/[^a-z0-9]/g, '')}.${this.nouvelAgentBcsu.nom.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const email = this.nouvelAgentBcsu.email || `${username}@sencsu.sn`;
    const mdp = 'BCSU-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    this.loading = true;
    this.userService.create({
      nom: this.nouvelAgentBcsu.nom.trim(),
      prenom: this.nouvelAgentBcsu.prenom.trim(),
      email,
      username,
      telephone: this.nouvelAgentBcsu.telephone,
      role: Role.BCSU,
      regionId,
      password: mdp
    }).subscribe({
      next: (res) => {
        this.loading = false;
        const u = res?.utilisateur;
        if (!u?.id) { this.loading = false; this.snackBar.open('Le backend n’a pas confirmé la création du compte.', 'Fermer', { duration: 4000 }); return; }
        this.agentsBcsu = [u, ...this.agentsBcsu];
        this.afficherModalBcsu = false;

        this.afficherAcces({
          titre: `Compte Agent BCSU créé : ${u.prenom} ${u.nom}`,
          identifiant: u.username || u.email || '',
          motDePasse: res?.motDePasseTemporaire || '',
          email: u.email || '',
          role: 'Agent de Bureau Régional (BCSU)'
        });

        this.nouvelAgentBcsu = { nom: '', prenom: '', email: '', telephone: '', regionId };
        this.snackBar.open('Agent BCSU créé avec succès !', 'OK', { duration: 3000 });
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur création agent BCSU : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  reinitialiserAccesBcsu(u: User): void {
    if (!u.id) return;
    this.loading = true;
    this.userService.reinitialiserMotDePasse(u.id).subscribe({
      next: (res) => {
        this.loading = false;
        this.afficherAcces({
          titre: `Identifiants réinitialisés : ${u.prenom} ${u.nom}`,
          identifiant: u.username || u.email || '',
          motDePasse: res.motDePasseTemporaire,
          email: u.email || '',
          role: 'Agent BCSU'
        });
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Erreur réinitialisation : ' + (err?.error?.message || err.message), 'Fermer', { duration: 5000 });
      }
    });
  }

  basculerAgentBcsu(u: User): void {
    u.actif = !u.actif;
    if (u.id) {
      this.userService.basculerActivation(u.id, u.actif).subscribe({ error: () => {} });
    }
    this.snackBar.open(`Agent BCSU ${u.prenom} ${u.nom} ${u.actif ? 'activé' : 'désactivé'}.`, 'OK', { duration: 2500 });
  }

  afficherAcces(info: { titre: string; identifiant: string; motDePasse: string; email: string; role: string }): void {
    this.accesInfo = info;
    this.afficherModalAcces = true;
  }
}
