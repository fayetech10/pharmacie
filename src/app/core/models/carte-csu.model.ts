import { Regime } from './bcsu.model';

/**
 * Carte CSU lue sur le site officiel (carte.sencsu.sn) via le service poste-santé,
 * pour préremplir le patient (poste de santé, lettre de garantie BCSU).
 * Dates au format ISO « aaaa-mm-jj ».
 */
export interface CarteCsu {
  codeImmatriculation: string;
  prenom?: string;
  nom?: string;
  /** « M » ou « F ». */
  sexe?: string;
  telephone?: string;
  dateNaissance?: string;
  typePiece?: string;
  numeroPiece?: string;
  /** Catégorie CSU telle que libellée par l'Agence (ex. « CLASSIQUE »). */
  categorie?: string;
  tauxCouverture?: number;
  /** État brut de la carte : « Active », « SUSPENDRE », « BLOQUER »… */
  etat?: string;
  carteActive: boolean;
  /** Date d'adhésion (début renvoyé par le site) : les droits ne s'ouvrent qu'après l'observation. */
  dateDebut?: string;
  dateFin?: string;
  /** Carte active ET droits ouverts (hors période d'observation) ET dans la période de couverture. */
  carteValide: boolean;
  /** Vrai tant que le bénéficiaire est dans la période d'observation (droits pas encore ouverts). */
  enPeriodeObservation?: boolean;
  /** Date d'ouverture des droits = date d'adhésion + période d'observation. */
  dateDebutDroits?: string;
  /** Photo du porteur (data URL ou URL https), si le site la fournit. */
  photo?: string;
  /** Mutuelle de rattachement et type d'adhésion, quand le site les fournit. */
  mutuelle?: string;
  typeAdhesion?: string;
}

/** Issue de la vérification, enregistrée dans le dossier (lettre de garantie, ligne de facture). */
export type VerificationCarte = 'VERIFIEE' | 'NON_VERIFIEE_PANNE';

/**
 * Ce que rend le modal de vérification : une carte valide, l'accord de continuer sans
 * vérification — proposé UNIQUEMENT quand le site carte.sencsu.sn est en panne —, ou le
 * constat d'une carte invalide (qui annule toute dérogation accordée plus tôt).
 */
export type ResultatCarteCsu = { carte: CarteCsu } | { panne: true } | { invalide: true };

/**
 * La catégorie imprimée sur la carte correspond-elle au régime choisi ?
 * `null` quand la catégorie n'est pas reconnue : rien à signaler.
 */
export function categorieCompatible(categorie: string | undefined, regime: Regime | null | undefined): boolean | null {
  const c = (categorie || '').toUpperCase();
  let attendus: Regime[] | null = null;
  if (c.includes('CLASSIQUE') || c.includes('CONTRIBUTIF') || c.includes('NDONGO') || c.includes('DAARA') || c.includes('ELEVE') || c.includes('ÉLÈVE')) {
    attendus = [Regime.CONTRIBUTIF, Regime.NDONGO_DARA, Regime.ELEVES];
  }
  else if (c.includes('BSF') || c.includes('CEC')) attendus = [Regime.BSF, Regime.CEC, Regime.BSF_CEC];
  else if (c.includes('SESAME') || c.includes('SÉSAME')) attendus = [Regime.SESAME];
  if (!attendus || !regime) return null;
  return attendus.includes(regime);
}

/**
 * Carte d'une autre catégorie que le régime choisi — une carte classique sur BSF / CEC, ou
 * l'inverse : la prise en charge est REFUSÉE (demande du 19/10/2026 ; ce n'était qu'un
 * avertissement). Rend le motif, ou null si la carte convient (ou si sa catégorie n'est pas
 * reconnue). Miroir de Regime.compatibleAvecCarte côté serveur.
 */
export function refusCategorie(categorie: string | undefined, regime: Regime | null | undefined,
                               libelleRegime: string): string | null {
  if (categorieCompatible(categorie, regime) !== false) return null;
  return `Carte de catégorie « ${categorie} » : elle ne relève pas du régime « ${libelleRegime} »`;
}
