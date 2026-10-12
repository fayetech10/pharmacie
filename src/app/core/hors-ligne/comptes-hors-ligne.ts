/**
 * Connexion hors ligne : l'appareil reconnaît le mot de passe d'un agent qui s'y est déjà
 * connecté en ligne.
 *
 * À chaque connexion en ligne réussie, la session (profil + jeton) est chiffrée en AES-GCM
 * avec une clé dérivée du mot de passe (PBKDF2, 150 000 itérations, sel aléatoire). Le mot
 * de passe n'est jamais stocké : hors ligne, seul le bon mot de passe redonne la bonne clé,
 * et le déchiffrement — dont GCM vérifie l'intégrité — échoue avec un autre.
 *
 * La reconnaissance expire 30 jours après la dernière connexion en ligne : un compte désactivé
 * entre-temps ne peut pas continuer indéfiniment hors ligne.
 */

import { LoginResponse } from '../models/user.model';

const CLE_STOCKAGE = 'csu_comptes_hors_ligne';
const ITERATIONS = 150_000;
const VALIDITE_MS = 30 * 24 * 60 * 60 * 1000;

interface CompteHorsLigne {
  sel: string;
  iv: string;
  session: string;
  enregistreLe: number;
}

export type EchecHorsLigne = 'INDISPONIBLE' | 'INCONNU' | 'EXPIRE' | 'MOT_DE_PASSE';

export class ErreurConnexionHorsLigne extends Error {
  constructor(readonly motif: EchecHorsLigne) {
    super(motif);
  }
}

/** La cryptographie du navigateur n'existe qu'en contexte sécurisé (HTTPS ou localhost). */
export function horsLigneDisponible(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof localStorage !== 'undefined';
}

/** Mémorise la session pour une connexion hors ligne ultérieure avec ce mot de passe. */
export async function memoriserCompte(identifiant: string, motDePasse: string, session: LoginResponse): Promise<void> {
  if (!horsLigneDisponible()) return;
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cle = await deriverCle(motDePasse, sel);
  const chiffre = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle,
    new TextEncoder().encode(JSON.stringify(session)));
  const comptes = lireComptes();
  comptes[normaliser(identifiant)] = {
    sel: versBase64(sel), iv: versBase64(iv), session: versBase64(new Uint8Array(chiffre)), enregistreLe: Date.now()
  };
  localStorage.setItem(CLE_STOCKAGE, JSON.stringify(comptes));
}

/** Rouvre hors ligne la session mémorisée ; lève ErreurConnexionHorsLigne sinon. */
export async function ouvrirCompte(identifiant: string, motDePasse: string): Promise<LoginResponse> {
  if (!horsLigneDisponible()) throw new ErreurConnexionHorsLigne('INDISPONIBLE');
  const compte = lireComptes()[normaliser(identifiant)];
  if (!compte) throw new ErreurConnexionHorsLigne('INCONNU');
  if (Date.now() - compte.enregistreLe > VALIDITE_MS) throw new ErreurConnexionHorsLigne('EXPIRE');
  try {
    const cle = await deriverCle(motDePasse, depuisBase64(compte.sel));
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisBase64(compte.iv) }, cle,
      depuisBase64(compte.session));
    return JSON.parse(new TextDecoder().decode(clair)) as LoginResponse;
  } catch {
    throw new ErreurConnexionHorsLigne('MOT_DE_PASSE');
  }
}

async function deriverCle(motDePasse: string, sel: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sel, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function lireComptes(): Record<string, CompteHorsLigne> {
  try {
    return JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}');
  } catch {
    return {};
  }
}

function normaliser(identifiant: string): string {
  return (identifiant || '').trim().toLowerCase();
}

function versBase64(octets: Uint8Array): string {
  let binaire = '';
  octets.forEach(o => binaire += String.fromCharCode(o));
  return btoa(binaire);
}

function depuisBase64(texte: string): Uint8Array {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}
