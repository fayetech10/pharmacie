import { Regime, REGIME_LABELS, REGIMES_CONTRIBUTIFS } from '../../core/models/bcsu.model';
import {
  DocumentComplementaire, DossierPatient, FactureStructure, LigneFactureStructure, StatutFactureStructure, TypePiece
} from '../../core/models/structure.model';
import { LignePatientListe, PastillePatient } from '../../shared/liste-patients-facture/liste-patients-facture.component';

/**
 * Règles de facturation CSU du poste de santé (cahier des charges « Poste de Santé »).
 *
 * <p>Le serveur reste seul juge des montants : ce qui est ici sert l'aperçu immédiat et
 * l'enchaînement des écrans (quelles pièces demander, quel contrôle faire, quels prix
 * montrer). Les mêmes règles vivent côté Java dans Regime et ServiceFacturePoste.</p>
 */

/** Forfait des enfants de moins de 5 ans, par visite (100 % SEN-CSU) : un enfant revenu dans le mois compte un forfait par visite. */
export const FORFAIT_0_5_ANS = 1400;

export interface CategoriePoste {
  /** Clé de la tuile (une catégorie peut regrouper plusieurs régimes). */
  cle: string;
  libelle: string;
  description: string;
  icone: string;
  regle: string;
  /** Régimes proposés dans la catégorie (sous-choix quand il y en a plusieurs). */
  regimes: Regime[];
}

/** Les quatre catégories du poste, dans l'ordre du cahier des charges (§5). */
export const CATEGORIES_POSTE: CategoriePoste[] = [
  {
    cle: 'CONTRIBUTIF', libelle: 'Régime contributif', icone: 'badge',
    description: 'Adhérent de mutuelle, élèves, Ndongo Daara — carte CSU',
    regle: '80 % SEN-CSU · 20 % patient',
    regimes: [Regime.CONTRIBUTIF]
  },
  {
    cle: 'ZERO_CINQ_ANS', libelle: 'Enfants de moins de 5 ans', icone: 'child_care',
    description: 'Extrait de naissance',
    regle: `Forfait ${FORFAIT_0_5_ANS.toLocaleString('fr-FR')} F / visite · 100 % SEN-CSU`,
    regimes: [Regime.ZERO_CINQ_ANS]
  },
  {
    cle: 'SESAME', libelle: 'Plan Sésame', icone: 'elderly',
    description: '60 ans et plus — CNI recto verso',
    regle: '100 % SEN-CSU · facturation à l\'acte',
    regimes: [Regime.SESAME]
  },
  {
    cle: 'BSF_CEC', libelle: 'BSF / CEC', icone: 'family_restroom',
    description: 'Bourse familiale, égalité des chances — carte CSU',
    regle: '100 % SEN-CSU · facturation à l\'acte',
    regimes: [Regime.BSF_CEC]
  }
];

/**
 * Catégories de l'agent BCSU, présentées comme celles du poste : mêmes tuiles, mêmes
 * règles. L'agent sert aussi les centres et les EPS, d'où la césarienne et les dialyses,
 * et BSF / CEC restent distincts (sous-choix) puisque les lettres les distinguent.
 */
export const CATEGORIES_BCSU: CategoriePoste[] = [
  CATEGORIES_POSTE[0],
  {
    cle: 'BSF_CEC', libelle: 'BSF / CEC', icone: 'family_restroom',
    description: 'Bourse familiale, égalité des chances — carte CSU',
    regle: '100 % SEN-CSU',
    regimes: [Regime.BSF, Regime.CEC]
  },
  {
    cle: 'ZERO_CINQ_ANS', libelle: 'Enfants de moins de 5 ans', icone: 'child_care',
    description: 'Extrait de naissance',
    regle: '100 % SEN-CSU',
    regimes: [Regime.ZERO_CINQ_ANS]
  },
  CATEGORIES_POSTE[2],
  {
    cle: 'CESARIENNE', libelle: 'Césarienne', icone: 'pregnant_woman',
    description: 'Gratuité de la césarienne — CNI recto verso',
    regle: '100 % SEN-CSU',
    regimes: [Regime.CESARIENNE]
  },
  {
    cle: 'DIALYSE', libelle: 'Dialyse', icone: 'water_drop',
    description: 'Péritonéale ou hémodialyse — CNI recto verso',
    regle: '100 % SEN-CSU',
    regimes: [Regime.DIALYSE_PERITONEALE, Regime.HEMODIALYSE]
  }
];

/** Régimes facturables au poste, à plat (filtre « Mes factures »). */
export const REGIMES_POSTE: Regime[] = CATEGORIES_POSTE.flatMap(c => c.regimes);

/** Libellés courts du poste. */
export const LIBELLES_REGIME_POSTE: Partial<Record<Regime, string>> = {
  [Regime.CONTRIBUTIF]: 'Classique',
  [Regime.NDONGO_DARA]: 'Ndongo Daara',
  [Regime.ELEVES]: 'Élèves',
  [Regime.ZERO_CINQ_ANS]: 'Enfants de moins de 5 ans',
  [Regime.SESAME]: 'Plan Sésame',
  [Regime.BSF_CEC]: 'BSF / CEC',
  [Regime.BSF]: 'BSF',
  [Regime.CEC]: 'CEC',
  [Regime.CESARIENNE]: 'Césarienne',
  [Regime.DIALYSE_PERITONEALE]: 'Dialyse péritonéale',
  [Regime.HEMODIALYSE]: 'Hémodialyse'
};

export function libelleRegimePoste(regime: Regime | string | null | undefined): string {
  if (!regime) return '';
  return LIBELLES_REGIME_POSTE[regime as Regime] || REGIME_LABELS[regime as Regime] || String(regime);
}

export function categorieDe(regime: Regime | null | undefined,
                            categories: CategoriePoste[] = CATEGORIES_POSTE): CategoriePoste | undefined {
  if (!regime) return undefined;
  if (estContributif(regime)) return categories.find(c => c.cle === 'CONTRIBUTIF');
  return categories.find(c => c.regimes.includes(regime));
}

export function estContributif(regime: Regime | null | undefined): boolean {
  return !!regime && REGIMES_CONTRIBUTIFS.includes(regime);
}

/** Identification par code d'immatriculation + contrôle d'éligibilité en ligne. */
export function exigeCartePoste(regime: Regime | null | undefined): boolean {
  return estContributif(regime) || regime === Regime.BSF_CEC || regime === Regime.BSF || regime === Regime.CEC;
}

export function estForfaitaire(regime: Regime | null | undefined): boolean {
  return regime === Regime.ZERO_CINQ_ANS;
}

/** Les factures des enfants de moins de 5 ans n'ont pas de PDF (§12.4 et §16). */
export function aUnPdf(regime: Regime | null | undefined): boolean {
  return estForfaitaire(regime);
}

export function tauxSencsuPoste(regime: Regime | null | undefined): number {
  return estContributif(regime) ? 0.8 : 1;
}

/** Pièces sans lesquelles le dossier reste « à compléter » (miroir de ServiceFacturePoste). */
export function piecesExigees(regime: Regime | null | undefined): TypePiece[] {
  if (regime === Regime.SESAME) return ['CNI_RECTO', 'CNI_VERSO'];
  if (regime === Regime.ZERO_CINQ_ANS) return ['EXTRAIT_NAISSANCE'];
  return [];
}

/** Âge limite des régimes qui en ont un (miroir de Regime.ageMaximumAnnees / ageMinimumAnnees). */
export function controleAge(regime: Regime | null | undefined, naissance: Date | null): string | null {
  if (!naissance || isNaN(naissance.getTime())) return null;
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - naissance.getFullYear();
  const m = aujourdhui.getMonth() - naissance.getMonth();
  if (m < 0 || (m === 0 && aujourdhui.getDate() < naissance.getDate())) age--;
  if (age < 0) return 'La date de naissance est dans le futur.';
  if (regime === Regime.ZERO_CINQ_ANS && age >= 5) {
    return `Ce patient a ${age} ans : le régime est réservé aux enfants de moins de 5 ans.`;
  }
  if (regime === Regime.SESAME && age < 60) {
    return `Ce patient a ${age} ans : le Plan Sésame est réservé aux personnes de 60 ans et plus.`;
  }
  return null;
}

/**
 * Statuts de la facture : référentiel commun à tout le projet (core/models/statuts.ts).
 * « À compléter » est l'état d'un DOSSIER patient, jamais un statut de facture.
 */
export { STATUTS_FACTURE } from '../../core/models/statuts';

/** La structure peut encore modifier / envoyer la facture (miroir de StatutFacture.MODIFIABLES). */
export function estModifiable(statut: StatutFactureStructure | null | undefined): boolean {
  return statut === 'BROUILLON' || statut === 'REJETEE_CS' || statut === 'REJETEE_SR' || statut === 'REJETEE_NC';
}

export const MOIS = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août',
  'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Télécharge un blob sous le nom donné. */
export function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ouvre un PDF dans un nouvel onglet (impression), à défaut le télécharge. */
export function ouvrirPdf(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const fenetre = window.open(url, '_blank');
  if (!fenetre) {
    telecharger(blob, nom);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Code dérivé d'une désignation (miroir du serveur), pour créer une prestation à la volée. */
export function codeDepuis(designation: string): string {
  return designation.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'PRESTATION';
}

export function normaliser(texte: string | null | undefined): string {
  return (texte || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

/**
 * Patients distincts d'une facture. Chaque visite crée un dossier : un patient revenu deux
 * ou trois fois dans le mois en a plusieurs, mais ne compte qu'une fois. Même patient =
 * même code d'immatriculation, à défaut mêmes prénom, nom et date de naissance.
 */
export function nombrePatients(facture: FactureStructure | null | undefined): number {
  if (!facture) return 0;
  const dossiers = facture.dossiers || [];
  if (!dossiers.length) return facture.nombreBeneficiaires || 0;
  return new Set(dossiers.map(clePatientDossier)).size;
}

/** Clé « même patient » d'un dossier : son matricule, à défaut prénom + nom + date de naissance. */
export function clePatientDossier(d: DossierPatient): string {
  return normaliser(d.matricule)
    || `n:${normaliser(`${d.prenom || ''}|${d.nom || ''}|${(d.dateNaissance || '').substring(0, 10)}`)}`;
}

/** Ligne de la facture avec sa position, pour la modifier ou la supprimer côté serveur. */
export type LigneIndexee = LigneFactureStructure & { _index: number };

/**
 * Une visite (un rendez-vous) de la facture : un dossier patient — à défaut, pour les
 * anciennes saisies d'un centre, les lignes d'une même lettre de garantie ou d'un même nom —
 * avec ses prestations, leurs totaux et ce qui l'accompagne (lettre, feuille de soins, pièces).
 */
export interface VisiteFacture {
  /** Identifiant de la visite (adresse de l'écran patient) : le dossier, à défaut la lettre, à défaut le nom. */
  cle: string;
  /** Dossier patient ; absent pour les anciennes saisies sans dossier. */
  dossier?: DossierPatient;
  prenom: string;
  nom: string;
  nomComplet: string;
  matricule?: string;
  dateNaissance?: string;
  sexe?: string;
  telephone?: string;
  adresse?: string;
  numeroCni?: string;
  /** Bénéficiaire du référentiel (fiche consultable : lettres, bons, factures). */
  patientId?: string;
  lettreNumero?: string;
  feuilleSoins?: { id: string; numero: string };
  verificationCarte?: string;
  service?: string;
  diagnostique?: string;
  numeroRegistre?: string;
  ircIra?: string;
  indicationCbt?: string;
  /** Pièces rattachées hors du dossier : documents d'une lettre de garantie, ancien ticket de caisse. */
  documents: DocumentComplementaire[];
  /** Prestations, dans l'ordre des dates de prise en charge. */
  lignes: LigneIndexee[];
  total: number;
  sencsu: number;
  patient: number;
  /** Date de la visite (aaaa-mm-jj) : sa première prise en charge, à défaut l'enregistrement du dossier. */
  date: string;
  /** Rang de la visite parmi celles du même patient dans le mois (1, 2…), et leur nombre. */
  rang: number;
  nombre: number;
}

/** Clé « même patient » d'une visite : son matricule, à défaut prénom + nom + date de naissance. */
export function clePatientVisite(v: VisiteFacture): string {
  return normaliser(v.matricule)
    || `n:${normaliser(`${v.prenom}|${v.nom}|${(v.dateNaissance || '').substring(0, 10)}`)}`;
}

/** Visite à compléter : son dossier est « à compléter » (bloque l'envoi de la facture). */
export function visiteACompleter(v: VisiteFacture): boolean {
  return v.dossier?.statut === 'A_COMPLETER';
}

/**
 * Les visites d'une facture, une par dossier (ou, sans dossier, par lettre de garantie puis
 * par nom), dans l'ordre des dates puis de saisie. Un patient revenu dans le mois a plusieurs
 * visites ; chacune note son rang parmi les siennes.
 */
export function visitesFacture(facture: FactureStructure | null | undefined): VisiteFacture[] {
  if (!facture) return [];
  const jour = (iso?: string) => (iso || '').substring(0, 10);
  const dossiers = new Map((facture.dossiers || []).map(d => [d.id, d]));
  const parCle = new Map<string, VisiteFacture>();

  const nouvelle = (cle: string, dossier?: DossierPatient, ligne?: LigneFactureStructure): VisiteFacture => {
    const prenom = (dossier ? dossier.prenom : ligne?.patientPrenom) || '';
    const nom = (dossier ? dossier.nom : ligne?.patientNom) || '';
    return {
      cle, dossier, prenom, nom,
      nomComplet: `${prenom} ${nom}`.trim() || 'Patient non renseigné',
      matricule: dossier?.matricule || ligne?.patientMatricule,
      dateNaissance: dossier?.dateNaissance || ligne?.patientDateNaissance,
      sexe: dossier?.sexe || ligne?.patientSexe,
      telephone: dossier?.telephone || ligne?.patientTelephone,
      adresse: dossier?.adresse || ligne?.patientAdresse,
      numeroCni: dossier?.numeroCni || ligne?.patientNumeroCni,
      lettreNumero: dossier?.lettreGarantieNumero || ligne?.lettreGarantieNumero,
      verificationCarte: dossier?.verificationCarte,
      diagnostique: dossier?.diagnostic,
      numeroRegistre: dossier?.numeroRegistre,
      documents: [], lignes: [], total: 0, sencsu: 0, patient: 0, date: '', rang: 1, nombre: 1
    };
  };

  (facture.lignes || []).forEach((ligne, index) => {
    const cle = ligne.dossierId || ligne.lettreGarantieNumero || `${ligne.patientPrenom || ''}|${ligne.patientNom || ''}`;
    let v = parCle.get(cle);
    if (!v) {
      v = nouvelle(cle, ligne.dossierId ? dossiers.get(ligne.dossierId) : undefined, ligne);
      parCle.set(cle, v);
    }
    if (ligne.feuilleSoinsId) {
      v.feuilleSoins = { id: ligne.feuilleSoinsId, numero: ligne.feuilleSoinsNumero || ligne.feuilleSoinsId };
    }
    v.patientId ||= ligne.patientId;
    v.verificationCarte ||= ligne.verificationCarte;
    v.service ||= ligne.service;
    v.diagnostique ||= ligne.diagnostique;
    v.numeroRegistre ||= ligne.numeroRegistre;
    v.ircIra ||= ligne.ircIra;
    v.indicationCbt ||= ligne.indicationCbt;
    v.lignes.push({ ...ligne, _index: index });
    v.total += ligne.montant || 0;
    v.sencsu += ligne.montantSencsu || 0;
    v.patient += ligne.montantBeneficiaire || 0;
  });

  // Dossiers sans prestation (enregistrés « à compléter ») : ils figurent aussi.
  for (const d of facture.dossiers || []) {
    if (!parCle.has(d.id)) parCle.set(d.id, nouvelle(d.id, d));
  }

  const visites = Array.from(parCle.values());
  // Pièces jointes rangées par lettre de garantie (saisie d'un centre).
  for (const doc of facture.documentsComplementaires || []) {
    if (!doc.lettreGarantieNumero) continue;
    visites.find(v => v.lettreNumero === doc.lettreGarantieNumero)?.documents.push(doc);
  }
  // Ticket de caisse enregistré au niveau de la facture (anciennes données).
  if (facture.ticketCaisse) {
    for (const v of visites) {
      if (!v.documents.some(d => (d.titre || '').toLowerCase().includes('ticket'))) {
        v.documents.push({ titre: 'Ticket de caisse', image: facture.ticketCaisse });
      }
    }
  }

  for (const v of visites) {
    v.lignes.sort((a, b) => jour(a.datePriseEnCharge).localeCompare(jour(b.datePriseEnCharge)));
    v.date = v.lignes.map(l => jour(l.datePriseEnCharge)).find(Boolean) || jour(v.dossier?.createdAt);
  }
  visites.sort((a, b) => a.date.localeCompare(b.date)
    || (a.dossier?.createdAt || '').localeCompare(b.dossier?.createdAt || ''));

  const parPatient = new Map<string, VisiteFacture[]>();
  visites.forEach(v => {
    const cle = clePatientVisite(v);
    parPatient.set(cle, [...(parPatient.get(cle) || []), v]);
  });
  parPatient.forEach(siennes => siennes.forEach((v, i) => { v.rang = i + 1; v.nombre = siennes.length; }));
  return visites;
}

/**
 * D'où l'on ouvre une facture : l'Espace PS du poste ou du centre qui la complète, ou le
 * détail de facture de point de soins lu par le centre, le service régional, le central.
 */
export type ContexteFacture = 'espace-ps' | 'structure';

/** Adresse de la facture selon le contexte ; l'écran patient est en dessous (…/patients/:visite). */
export function cheminFacture(contexte: ContexteFacture, factureId: string): any[] {
  return [contexte === 'espace-ps' ? '/dashboard/espace-ps/factures' : '/dashboard/factures-structure', factureId];
}

/** Visite pointée « vérifiée » par cet échelon de contrôle. */
export function visiteVerifiee(v: VisiteFacture, echelon: EchelonPointage): boolean {
  return echelon === 'centre' ? !!v.dossier?.verifieCentreLe : !!v.dossier?.verifieRegionLe;
}

/**
 * Lignes de la liste des patients d'une facture (une par visite) : nom, date, matricule,
 * pastilles (à compléter, carte non vérifiée, visite n/N, pointages), lien vers l'écran patient.
 * `echelon` : échelon qui pointe en ce moment (sa coche teinte la ligne en vert).
 */
export function lignesPatients(visites: VisiteFacture[], cheminFacture: any[],
                               options: { aCarte: boolean; echelon?: EchelonPointage | null }): LignePatientListe[] {
  return visites.map(v => {
    const pastilles: PastillePatient[] = [];
    if (visiteACompleter(v)) pastilles.push({ libelle: 'À compléter', ton: 'ambre' });
    if (options.aCarte && !v.lettreNumero && v.verificationCarte === 'NON_VERIFIEE_PANNE') {
      pastilles.push({ libelle: 'Carte non vérifiée', ton: 'ambre' });
    }
    if (v.nombre > 1) {
      pastilles.push({ libelle: `Visite ${v.rang}/${v.nombre}`, ton: 'primaire', titre: 'Ce patient est venu plusieurs fois dans le mois' });
    }
    if (v.lettreNumero) pastilles.push({ libelle: `Lettre ${v.lettreNumero}`, ton: 'primaire' });
    const verifieIci = !!options.echelon && visiteVerifiee(v, options.echelon);
    if (verifieIci) pastilles.push({ libelle: 'Vérifié', ton: 'vert' });
    if (options.echelon !== 'centre' && visiteVerifiee(v, 'centre')) pastilles.push({ libelle: 'Vérifié par le district', ton: 'vert' });
    if (options.echelon !== 'region' && visiteVerifiee(v, 'region')) pastilles.push({ libelle: 'Vérifié par le SR', ton: 'vert' });
    return {
      cle: v.cle,
      nom: v.nomComplet,
      date: dateFr(v.date),
      matricule: v.matricule,
      lien: [...cheminFacture, 'patients', v.cle],
      pastilles,
      identiteVerifiee: !!v.dossier?.identiteVerrouillee,
      teinte: verifieIci ? 'vert' : (visiteACompleter(v) ? 'ambre' : undefined)
    };
  });
}

/** Filtre de recherche commun aux listes de patients : nom, matricule, lettre, prestation. */
export function visiteCorrespond(v: VisiteFacture, terme: string): boolean {
  const t = normaliser(terme);
  return !t || normaliser(`${v.nomComplet} ${v.matricule || ''} ${v.lettreNumero || ''}`).includes(t)
    || v.lignes.some(l => normaliser(l.designation).includes(t));
}

/** Date ISO (aaaa-mm-jj…) affichée jj/mm/aaaa ; vide si absente. */
export function dateFr(iso?: string | null): string {
  if (!iso) return '';
  const [a, m, j] = iso.substring(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

/** Échelon de contrôle qui pointe les patients d'une facture. */
export type EchelonPointage = 'centre' | 'region';

/**
 * Avancement du pointage « patient vérifié » d'un échelon sur une facture : patients
 * distincts, un patient venu plusieurs fois n'étant vérifié que si toutes ses visites le sont.
 */
export function avancementPointage(facture: FactureStructure | null | undefined,
                                   echelon: EchelonPointage): { faits: number; total: number } {
  const parPatient = new Map<string, DossierPatient[]>();
  for (const d of facture?.dossiers || []) {
    const cle = clePatientDossier(d);
    parPatient.set(cle, [...(parPatient.get(cle) || []), d]);
  }
  let faits = 0;
  for (const dossiers of parPatient.values()) {
    if (dossiers.every(d => echelon === 'centre' ? !!d.verifieCentreLe : !!d.verifieRegionLe)) faits++;
  }
  return { faits, total: parPatient.size };
}
