import { Facture, LigneFacture, StatutLigne } from '../../core/models/facture.model';
import { LignePatientListe, PastillePatient } from '../../shared/liste-patients-facture/liste-patients-facture.component';

/** Ligne de médicament avec sa position dans la facture (modification / suppression). */
export interface LigneMedicament {
  ligne: LigneFacture;
  index: number;
}

/** Un patient d'une facture de pharmacie : ses médicaments et les pièces de son dossier. */
export interface PatientPharmacie {
  /** Identifiant dans l'adresse de l'écran patient : matricule + nom. */
  cle: string;
  nom?: string;
  matricule?: string;
  bonCommandeNumero?: string;
  ticketCaisse?: string;
  bonCommande?: string;
  ordonnance?: string;
  lignes: LigneMedicament[];
  total: number;
}

/** Pièces justificatives du dossier patient d'une pharmacie. */
export const PIECES_PHARMACIE: { cle: 'ticketCaisse' | 'bonCommande' | 'ordonnance'; libelle: string; icone: string }[] = [
  { cle: 'ticketCaisse', libelle: 'Ticket de caisse', icone: 'receipt_long' },
  { cle: 'bonCommande', libelle: 'Bon de commande', icone: 'description' },
  { cle: 'ordonnance', libelle: 'Ordonnance', icone: 'clinical_notes' }
];

/** Les patients d'une facture, les derniers saisis en tête (un patient = matricule + nom). */
export function patientsFacturePharmacie(facture: Facture | null | undefined): PatientPharmacie[] {
  const parCle = new Map<string, PatientPharmacie>();
  (facture?.lignes || []).forEach((ligne, index) => {
    const cle = `${ligne.patientMatricule || ''}|${ligne.patientNomPrenom || ''}`;
    let p = parCle.get(cle);
    if (!p) {
      p = { cle, nom: ligne.patientNomPrenom, matricule: ligne.patientMatricule, lignes: [], total: 0 };
      parCle.set(cle, p);
    }
    // Les pièces sont dupliquées sur les lignes du patient, mais PAS forcément sur la
    // première : quand ses médicaments sont ajoutés en plusieurs fois, seules certaines
    // lignes les portent. Chaque pièce vient donc de la première ligne qui la possède.
    p.ticketCaisse ||= ligne.ticketCaisse;
    p.bonCommande ||= ligne.bonCommande;
    p.ordonnance ||= ligne.ordonnance;
    p.bonCommandeNumero ||= ligne.bonCommandeNumero;
    p.lignes.push({ ligne, index });
    p.total += ligne.montant || 0;
  });
  return Array.from(parCle.values()).reverse();
}

export function nombrePieces(p: PatientPharmacie): number {
  return PIECES_PHARMACIE.filter(piece => !!p[piece.cle]).length;
}

/** Recherche : nom, matricule, n° de bon ou médicament. */
export function patientPharmacieCorrespond(p: PatientPharmacie, terme: string): boolean {
  const t = terme.toLowerCase().trim();
  return !t || `${p.nom || ''} ${p.matricule || ''} ${p.bonCommandeNumero || ''}`.toLowerCase().includes(t)
    || p.lignes.some(l => (l.ligne.medicament || '').toLowerCase().includes(t));
}

/**
 * Lignes de la liste des patients (gabarit commun à toutes les factures) : nom, puis — faute
 * de date de délivrance sur les lignes — le nombre de médicaments, puis le matricule.
 */
export function lignesPatientsPharmacie(patients: PatientPharmacie[], factureId: string): LignePatientListe[] {
  return patients.map(p => {
    const pastilles: PastillePatient[] = [];
    if (p.bonCommandeNumero) pastilles.push({ libelle: `Bon ${p.bonCommandeNumero}`, ton: 'primaire' });
    const ajoutes = p.lignes.filter(l => l.ligne.ajouteParPharmacien).length;
    if (ajoutes) {
      pastilles.push({ libelle: `${ajoutes} non répertorié(s)`, ton: 'ambre', titre: 'Ajouté par le pharmacien — à valider par la SEN-CSU' });
    }
    const rejetees = p.lignes.filter(l => l.ligne.statutLigne === StatutLigne.REJETEE).length;
    if (rejetees) pastilles.push({ libelle: `${rejetees} rejeté(s)`, ton: 'ambre' });
    return {
      cle: p.cle,
      nom: p.nom || 'Patient sans nom',
      date: `${p.lignes.length} médicament${p.lignes.length > 1 ? 's' : ''}`,
      matricule: p.matricule,
      lien: ['/dashboard/factures', factureId, 'patients', p.cle],
      pastilles
    };
  });
}
