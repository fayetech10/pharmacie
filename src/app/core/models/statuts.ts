/**
 * Apparence des statuts, unique pour tout le projet : un même statut a partout le même
 * libellé, la même couleur et la même icône — celles des écrans du poste de santé.
 *
 * Les libellés suivent la nomenclature de l'outil (StatutFacture côté serveur) : aucun
 * statut n'est inventé ici, seulement nommé.
 */

export interface ApparenceStatut {
  libelle: string;
  /** Classes Tailwind de la puce (fond + texte). */
  classe: string;
  icone: string;
}

export type FamilleStatut = 'facture' | 'lettre' | 'bon' | 'feuille' | 'ligne' | 'dossier' | 'etape';

const GRIS = 'bg-slate-100 text-slate-700';
const BLEU = 'bg-blue-50 text-blue-700';
const VERT = 'bg-emerald-50 text-emerald-700';
const VERT_FONCE = 'bg-emerald-100 text-emerald-800';
const ROUGE = 'bg-red-50 text-red-700';
const AMBRE = 'bg-amber-50 text-amber-800';

/** Factures (pharmacie et points de soins). */
export const STATUTS_FACTURE: Record<string, ApparenceStatut> = {
  BROUILLON: { libelle: 'Brouillon', classe: GRIS, icone: 'edit_note' },
  // Noms historiques « CS » : le contrôle des factures de postes est fait par le district.
  SOUMISE_CS: { libelle: 'Envoyée au district', classe: BLEU, icone: 'send' },
  REJETEE_CS: { libelle: 'Rejetée par le district', classe: ROUGE, icone: 'cancel' },
  ENVOYEE: { libelle: 'Transmise au service régional', classe: BLEU, icone: 'forward_to_inbox' },
  VALIDEE_SR: { libelle: 'Validée (service régional)', classe: VERT, icone: 'task_alt' },
  REJETEE_SR: { libelle: 'Rejetée (service régional)', classe: ROUGE, icone: 'cancel' },
  VALIDEE_NC: { libelle: 'Validée (niveau central)', classe: VERT, icone: 'verified' },
  REJETEE_NC: { libelle: 'Rejetée (niveau central)', classe: ROUGE, icone: 'cancel' },
  PAYEE: { libelle: 'Payée', classe: VERT_FONCE, icone: 'payments' }
};

export const STATUTS_LETTRE: Record<string, ApparenceStatut> = {
  BROUILLON: { libelle: 'Brouillon', classe: GRIS, icone: 'edit_note' },
  EMISE: { libelle: 'Émise', classe: VERT, icone: 'task_alt' },
  ANNULEE: { libelle: 'Annulée', classe: ROUGE, icone: 'block' }
};

export const STATUTS_BON: Record<string, ApparenceStatut> = {
  EMIS: { libelle: 'Émis', classe: VERT, icone: 'task_alt' },
  ANNULE: { libelle: 'Annulé', classe: ROUGE, icone: 'block' }
};

export const STATUTS_FEUILLE: Record<string, ApparenceStatut> = {
  EMISE: { libelle: 'Délivrée au patient', classe: BLEU, icone: 'outbox' },
  DEPOSEE_STRUCTURE: { libelle: 'Déposée en structure', classe: AMBRE, icone: 'move_to_inbox' },
  FACTUREE: { libelle: 'Facturée', classe: VERT, icone: 'task_alt' },
  ANNULEE: { libelle: 'Annulée', classe: ROUGE, icone: 'block' }
};

/** Contrôle d'une ligne de facture pharmacie. */
export const STATUTS_LIGNE: Record<string, ApparenceStatut> = {
  EN_ATTENTE: { libelle: 'En attente', classe: GRIS, icone: 'schedule' },
  ACCEPTEE: { libelle: 'Acceptée', classe: VERT, icone: 'check_circle' },
  REJETEE: { libelle: 'Rejetée', classe: ROUGE, icone: 'cancel' }
};

/** Dossier patient d'une facture de point de soins. */
export const STATUTS_DOSSIER: Record<string, ApparenceStatut> = {
  A_COMPLETER: { libelle: 'À compléter', classe: AMBRE, icone: 'pending_actions' },
  COMPLET: { libelle: 'Complet', classe: VERT, icone: 'check_circle' }
};

/**
 * Étapes d'une facture de centre / EPS (spécification « Facturation CS / EPS ») : calculées
 * par le serveur (`FactureStructure.etape`), à côté du statut du circuit.
 */
export const ETAPES_FACTURE: Record<string, ApparenceStatut> = {
  EN_COURS_DE_SAISIE: { libelle: 'En cours de saisie', classe: GRIS, icone: 'edit_note' },
  IMPORTEE: { libelle: 'Importée', classe: AMBRE, icone: 'upload_file' },
  COMPLETE: { libelle: 'Complète', classe: VERT, icone: 'task_alt' },
  TRANSMISE: { libelle: 'Transmise', classe: BLEU, icone: 'lock' }
};

const FAMILLES: Record<FamilleStatut, Record<string, ApparenceStatut>> = {
  facture: STATUTS_FACTURE,
  lettre: STATUTS_LETTRE,
  bon: STATUTS_BON,
  feuille: STATUTS_FEUILLE,
  ligne: STATUTS_LIGNE,
  dossier: STATUTS_DOSSIER,
  etape: ETAPES_FACTURE
};

export function apparenceStatut(statut: string | null | undefined, famille: FamilleStatut = 'facture'): ApparenceStatut {
  const valeur = statut || '';
  return FAMILLES[famille][valeur] || { libelle: valeur || '—', classe: GRIS, icone: 'info' };
}

/** La structure peut encore modifier / envoyer la facture (miroir de StatutFacture.MODIFIABLES). */
export function factureModifiable(statut: string | null | undefined): boolean {
  return statut === 'BROUILLON' || statut === 'REJETEE_CS' || statut === 'REJETEE_SR' || statut === 'REJETEE_NC';
}

/**
 * Le service régional peut supprimer la facture, ou un patient / une prestation qu'elle
 * contient, à toute étape — brouillon compris — avant la validation nationale (23/10/2026 ;
 * miroir de ServiceFacturation.factureDuServiceRegional).
 */
export function supprimableParServiceRegional(statut: string | null | undefined): boolean {
  return !!statut && statut !== 'VALIDEE_NC' && statut !== 'PAYEE';
}
