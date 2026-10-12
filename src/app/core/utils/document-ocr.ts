/**
 * Lecture automatique (OCR) de la CNI — cahier des charges BCSU : nom, prénom, date de
 * naissance, numéro CNI. Si l'extraction échoue, l'agent complète manuellement.
 *
 * La carte se lit de deux façons :
 *  - le recto, par ses étiquettes (« Prénoms », « Nom », « Date de naissance »…) ;
 *  - la bande MRZ du verso (3 lignes de 30 caractères, norme OACI 9303), bien plus sûre :
 *    nom et prénoms y sont séparés par « << » et la date de naissance porte une clé de
 *    contrôle. Une valeur ainsi contrôlée prime sur celle lue au recto.
 *
 * La carte d'assuré n'est plus lue par OCR : son n° est vérifié sur carte.sencsu.sn
 * (voir CarteCsuService), qui renvoie l'identité exacte et l'état de la carte.
 *
 * tesseract.js est chargé à la demande (chunk lazy) pour ne pas alourdir le bundle initial.
 * Un seul moteur sert toutes les lectures, une à la fois, et il est libéré dès qu'il ne sert
 * plus : sur un téléphone modeste, deux moteurs simultanés ou un moteur oublié en mémoire
 * suffisent à faire recharger la page.
 */

import type { RecognizeOptions, Worker as MoteurOcr } from 'tesseract.js';
import { canvasVersBlob, chargerImageReduite, libererCanvas } from './image-compression';

export type ChampCni = 'nom' | 'prenom' | 'dateNaissance' | 'numeroCni' | 'sexe';

export interface OcrCniResult {
  nom?: string;
  prenom?: string;
  dateNaissance?: string; // yyyy-MM-dd (format input[type=date])
  numeroCni?: string;
  sexe?: string;
  /** Champs lus dans la bande MRZ et validés par ses contrôles : ils priment sur le recto. */
  sures: ChampCni[];
}

const CHAMPS: Record<ChampCni, string> = {
  prenom: 'prénom',
  nom: 'nom',
  dateNaissance: 'date de naissance',
  numeroCni: 'n° CNI',
  sexe: 'sexe'
};

/** OCR d'une CNI sénégalaise, recto ou verso. */
export async function ocrCni(image: Blob): Promise<OcrCniResult> {
  const preparee = await preparerPourOcr(image);
  return avecMoteur(async moteur => {
    const lignes = decouperLignes(await lire(moteur, preparee));
    let mrz = lireMrz(lignes);
    if (!mrz?.sures.length && ressembleAUneMrz(lignes)) {
      // Verso : seconde lecture restreinte à l'alphabet de la MRZ, où l'OCR généraliste
      // confond les « < » de remplissage avec des K, des C ou des guillemets.
      const seconde = lireMrz(decouperLignes(await lire(moteur, preparee, { tessedit_char_whitelist: CARACTERES_MRZ })));
      if (seconde && (seconde.sures.length || !mrz)) mrz = seconde;
    }
    return assembler(lireEtiquettes(lignes), mrz);
  });
}

/**
 * Report des lectures de la CNI (recto puis verso, ou l'inverse) dans le formulaire.
 *
 * Une saisie de l'agent n'est jamais écrasée : un champ vide est rempli ; un champ rempli par
 * une lecture précédente, et resté tel quel, n'est remplacé que par une lecture plus sûre
 * (bande MRZ du verso).
 */
export class RepriseCni {
  private lus = new Map<ChampCni, { valeur: string; sure: boolean }>();

  /** Reporte la lecture dans `cible` et renvoie les libellés des champs repris. */
  appliquer(cible: Record<ChampCni, string>, lu: OcrCniResult): string[] {
    const repris: string[] = [];
    (Object.keys(CHAMPS) as ChampCni[]).forEach(champ => {
      const valeur = lu[champ];
      if (!valeur) return;
      const sure = lu.sures.includes(champ);
      const actuel = (cible[champ] || '').trim();
      const precedent = this.lus.get(champ);
      const ameliorable = !!precedent && precedent.valeur === actuel && sure && !precedent.sure
        && sansAccents(actuel) !== sansAccents(valeur);
      if (actuel && !ameliorable) return;
      cible[champ] = valeur;
      this.lus.set(champ, { valeur, sure });
      repris.push(CHAMPS[champ]);
    });
    return repris;
  }

  oublier() {
    this.lus.clear();
  }
}

// ══════════════════════════ moteur OCR partagé ══════════════════════════

/** Moteur gardé un moment après la dernière lecture (le verso suit souvent le recto), puis libéré. */
const DELAI_LIBERATION_MS = 30_000;

let moteurPartage: Promise<MoteurOcr> | null = null;
let fileAttente: Promise<void> = Promise.resolve();
let lecturesEnAttente = 0;
let minuterieLiberation: ReturnType<typeof setTimeout> | undefined;

/**
 * Libère tout de suite le moteur s'il est inoccupé. À appeler avant que le téléphone n'ouvre
 * son appareil photo : la page passe en arrière-plan, et moins elle occupe de mémoire, moins
 * le système a de raisons de la recharger.
 */
export function libererOcr() {
  if (lecturesEnAttente > 0) return;
  clearTimeout(minuterieLiberation);
  void libererMoteur();
}

/**
 * Charge le moteur une fois, en ligne : ses fichiers (moteur WebAssembly, dictionnaire
 * français) passent alors en cache et la lecture de la CNI fonctionne aussi hors ligne.
 * Le moteur est libéré comme après une lecture.
 */
export function prechargerOcr(): Promise<void> {
  return avecMoteur(async () => undefined);
}

async function creerMoteur(): Promise<MoteurOcr> {
  const Tesseract = await import('tesseract.js');
  // Compatibilité CommonJS / ESM selon que l'on soit en dev ou en production avec esbuild
  const createWorker = Tesseract.createWorker || (Tesseract as any).default?.createWorker;
  if (!createWorker) {
    throw new Error('Impossible de charger la fonction createWorker de Tesseract.');
  }
  // En production, les Web Workers cross-origin (CDN) sont bloqués par la sécurité du navigateur.
  // On utilise donc les fichiers qu'on a placés dans src/assets/tesseract/.
  const moteur = await createWorker('fra', 1, {
    workerPath: '/assets/tesseract/worker.min.js',
    // Dossier (et non un fichier .js précis) : Tesseract détecte alors les capacités
    // de l'appareil et charge le core adapté (SIMD / relaxed-SIMD / sans SIMD).
    // Évite l'échec sur un mobile dont le navigateur ne supporte pas le WASM SIMD.
    corePath: '/assets/tesseract',
    // Hébergement local du fichier de langue pour éviter toute erreur réseau/CORS en production
    langPath: '/assets/tesseract',
  });
  // Une photo ne déclare pas de résolution : sans cela, Tesseract suppose 70 dpi.
  await moteur.setParameters({ user_defined_dpi: '300' });
  return moteur;
}

/** Exécute une tâche sur le moteur partagé, créé à la demande ; les tâches passent une à une. */
function avecMoteur<T>(tache: (moteur: MoteurOcr) => Promise<T>): Promise<T> {
  clearTimeout(minuterieLiberation);
  lecturesEnAttente++;
  const resultat = fileAttente.then(async () => {
    moteurPartage ??= creerMoteur();
    try {
      return await tache(await moteurPartage);
    } catch (err) {
      // Moteur peut-être hors d'usage (mémoire épuisée, chargement raté) : on repartira d'un neuf.
      console.error('Erreur OCR :', err);
      void libererMoteur();
      throw err;
    }
  });
  fileAttente = resultat.then(() => undefined, () => undefined).then(() => {
    lecturesEnAttente--;
    if (lecturesEnAttente === 0) {
      minuterieLiberation = setTimeout(() => void libererMoteur(), DELAI_LIBERATION_MS);
    }
  });
  return resultat;
}

async function libererMoteur() {
  const moteur = moteurPartage;
  moteurPartage = null;
  if (!moteur) return;
  try {
    await (await moteur).terminate();
  } catch {
    /* déjà hors d'usage */
  }
}

async function lire(moteur: MoteurOcr, image: Blob, parametres: Record<string, string> = {}): Promise<string> {
  // rotateAuto redresse une carte photographiée un peu de travers ; les paramètres Tesseract
  // passés ici ne valent que pour cette lecture.
  const options = { rotateAuto: true, ...parametres } as Partial<RecognizeOptions>;
  const { data } = await moteur.recognize(image, options);
  return data.text || '';
}

// ══════════════════════════ préparation de l'image ══════════════════════════

/** Taille visée pour la lecture : assez de pixels par caractère pour Tesseract, sans excès. */
const COTE_LECTURE_MIN = 2000;
const COTE_LECTURE_MAX = 2400;

/**
 * Niveaux de gris, contraste étiré (photo prise sous un néon ou à contre-jour), et
 * agrandissement d'une carte cadrée serrée : Tesseract lit mal les petits caractères.
 */
async function preparerPourOcr(image: Blob): Promise<Blob> {
  let canvas = await chargerImageReduite(image, COTE_LECTURE_MAX);
  try {
    const plusGrandCote = Math.max(canvas.width, canvas.height);
    if (plusGrandCote < COTE_LECTURE_MIN) {
      const echelle = Math.min(2.5, COTE_LECTURE_MIN / plusGrandCote);
      const agrandi = document.createElement('canvas');
      agrandi.width = Math.round(canvas.width * echelle);
      agrandi.height = Math.round(canvas.height * echelle);
      const ctxAgrandi = agrandi.getContext('2d');
      if (!ctxAgrandi) return image;
      ctxAgrandi.imageSmoothingQuality = 'high';
      ctxAgrandi.drawImage(canvas, 0, 0, agrandi.width, agrandi.height);
      libererCanvas(canvas);
      canvas = agrandi;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return image;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    niveauxDeGrisContrastes(pixels.data);
    ctx.putImageData(pixels, 0, 0);
    return await canvasVersBlob(canvas, 'image/png');
  } finally {
    libererCanvas(canvas);
  }
}

/** Passe l'image en niveaux de gris, étirés entre ses 1 % les plus sombres et ses 1 % les plus clairs. */
function niveauxDeGrisContrastes(donnees: Uint8ClampedArray) {
  const histogramme = new Uint32Array(256);
  for (let p = 0; p < donnees.length; p += 4) {
    const gris = Math.round(0.299 * donnees[p] + 0.587 * donnees[p + 1] + 0.114 * donnees[p + 2]);
    donnees[p] = gris;
    histogramme[gris]++;
  }
  const bas = centile(histogramme, 0.01);
  const etendue = centile(histogramme, 0.99) - bas;
  for (let p = 0; p < donnees.length; p += 4) {
    // Étendue trop faible (photo presque unie) : on n'amplifie pas le bruit.
    const gris = etendue > 16 ? ((donnees[p] - bas) * 255) / etendue : donnees[p];
    donnees[p] = donnees[p + 1] = donnees[p + 2] = gris;
  }
}

function centile(histogramme: Uint32Array, part: number): number {
  const cible = part * histogramme.reduce((somme, n) => somme + n, 0);
  let cumul = 0;
  for (let niveau = 0; niveau < 256; niveau++) {
    cumul += histogramme[niveau];
    if (cumul >= cible) return niveau;
  }
  return 255;
}

// ══════════════════════════ bande MRZ (verso) ══════════════════════════

const CARACTERES_MRZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';

/** Confusions de l'OCR entre lettres et chiffres, corrigées là où seuls des chiffres sont permis. */
const VERS_CHIFFRE: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
const CHIFFRE_MRZ = '[0-9OQDILZSGB]';

/** Ligne 2 d'une MRZ TD1 : naissance AAMMJJ + clé, sexe, expiration AAMMJJ + clé, nationalité. */
const LIGNE_DATES = new RegExp(`(${CHIFFRE_MRZ}{6})(${CHIFFRE_MRZ})([MF<])(${CHIFFRE_MRZ}{6})(${CHIFFRE_MRZ}|<)([A-Z<]{3})`);
/** Ligne 3 : NOM<<PRENOM<AUTRE<PRENOM<<<… */
const LIGNE_NOMS = /^<*([A-Z]+(?:<[A-Z]+)*)<<([A-Z]+(?:<[A-Z]+)*)/;

function ressembleAUneMrz(lignes: string[]): boolean {
  return lignes.some(ligne => /<{2,}|«|K{4,}|^I.?SEN/.test(ligne.toUpperCase().replace(/\s/g, '')));
}

function ligneMrz(ligne: string): string {
  return ligne.toUpperCase().replace(/«/g, '<<').replace(/‹/g, '<').replace(/[^A-Z0-9<]/g, '');
}

function chiffres(zone: string): string {
  return zone.replace(/[A-Z]/g, c => VERS_CHIFFRE[c] ?? c);
}

/** Clé de contrôle OACI 9303 (pondération 7-3-1). */
function cleControle(champ: string): string {
  const poids = [7, 3, 1];
  let somme = 0;
  for (let i = 0; i < champ.length; i++) {
    const c = champ[i];
    const valeur = c >= '0' && c <= '9' ? Number(c) : c >= 'A' && c <= 'Z' ? c.charCodeAt(0) - 55 : 0;
    somme += valeur * poids[i % 3];
  }
  return String(somme % 10);
}

/** AAMMJJ de la MRZ → aaaa-mm-jj : un siècle qui placerait la naissance dans le futur est le précédent. */
function dateMrz(aammjj: string): string | undefined {
  const siecleCourant = new Date().getFullYear() % 100;
  const aa = Number(aammjj.slice(0, 2));
  const annee = (aa > siecleCourant ? 1900 : 2000) + aa;
  return dateValide(aammjj.slice(4, 6), aammjj.slice(2, 4), String(annee));
}

/** Retire de la ligne des noms le remplissage mal lu (« KKKK… ») et les séparateurs. */
function nomMrz(brut: string): string {
  return brut.replace(/K{3,}.*$/, '').replace(/</g, ' ').trim();
}

function lireMrz(lignes: string[]): OcrCniResult | null {
  const mrz = lignes.map(ligneMrz);
  const resultat: OcrCniResult = { sures: [] };

  let ligneDates = -1;
  for (let i = 0; i < mrz.length && ligneDates < 0; i++) {
    const m = mrz[i].match(LIGNE_DATES);
    if (!m) continue;
    const naissance = chiffres(m[1]);
    const date = dateMrz(naissance);
    if (!date) continue;
    ligneDates = i;
    if (m[3] === 'M' || m[3] === 'F') resultat.sexe = m[3];
    // Sans clé de contrôle juste, un chiffre mal lu donnerait une fausse date : on l'écarte.
    if (cleControle(naissance) === chiffres(m[2])) {
      resultat.dateNaissance = date;
      resultat.sures.push('dateNaissance');
      if (resultat.sexe) resultat.sures.push('sexe');
    }
  }

  // La ligne des noms suit celle des dates ; à défaut, on la cherche partout.
  const candidates = ligneDates >= 0 ? [mrz[ligneDates + 1] || '', ...mrz] : mrz;
  for (const ligne of candidates) {
    if (/\d/.test(ligne) || !ligne.includes('<<')) continue;
    const m = ligne.match(LIGNE_NOMS);
    if (!m) continue;
    const nom = nomMrz(m[1]);
    const prenom = nomMrz(m[2]);
    if (nom.length < 2 || prenom.length < 2) continue;
    resultat.nom = nom;
    resultat.prenom = prenom;
    // Ligne lue en entier (30 caractères, remplissage compris) sous une ligne de dates contrôlée.
    if (resultat.sures.includes('dateNaissance') && ligne.length >= 28 && ligne.length <= 32) {
      resultat.sures.push('nom', 'prenom');
    }
    break;
  }

  return resultat.nom || resultat.dateNaissance || resultat.sexe ? resultat : null;
}

// ══════════════════════════ étiquettes (recto) ══════════════════════════

const ETIQUETTES = {
  prenom: /pr[eé]noms?|given\s*names?/i,
  // « Nom » seul : ni « Prénoms », ni « Noms ».
  nom: /(?:^|[^a-zà-ÿ])n[o0]m(?![a-zà-ÿ])|surname/i,
  naissance: /naissance|birth/i,
  sexe: /(?:^|[^a-zà-ÿ])sexe?(?![a-zà-ÿ])/i,
  nin: /(?:^|[^a-z])nin(?![a-z])/i
};

/** Toute étiquette de la carte : la valeur cherchée n'est pas au-delà. */
const UNE_ETIQUETTE = /pr[eé]nom|given|n[o0]m\b|surname|naissance|birth|sexe?\b|taille|height|lieu|place|d[eé]livrance|issue|expir|centre|adresse|address|nationalit|signature|nin\b/i;

/** Mots en capitales de la carte qui ne sont pas un nom (en-tête, devise, étiquettes). */
const MOTS_EXCLUS = new Set([
  'REPUBLIQUE', 'DU', 'SENEGAL', 'CARTE', 'IDENTITE', 'NATIONALE', 'CEDEAO', 'ECOWAS', 'IDENTITY', 'CARD',
  'UN', 'PEUPLE', 'BUT', 'UNE', 'FOI', 'NOM', 'NOMS', 'PRENOM', 'PRENOMS', 'SURNAME', 'GIVEN', 'NAME', 'NAMES',
  'SEXE', 'SEX', 'DATE', 'NIN', 'TAILLE', 'LIEU', 'CM'
]);

function lireEtiquettes(lignes: string[]): OcrCniResult {
  return {
    prenom: valeurNom(lignes, ETIQUETTES.prenom),
    nom: valeurNom(lignes, ETIQUETTES.nom),
    dateNaissance: dateDeNaissance(lignes),
    sexe: lireSexe(lignes),
    numeroCni: lireNin(lignes),
    sures: []
  };
}

/**
 * Mots d'une ligne qui peuvent être un nom. Sur la CNI, nom et prénoms sont imprimés en
 * capitales, les étiquettes non : on écarte ainsi les étiquettes et le gros du bruit de
 * l'OCR (motifs de sécurité, photo).
 */
function motsDeNom(ligne: string): string[] {
  return ligne.split(/[^A-Za-zÀ-ÖØ-öø-ÿ'’-]+/)
    .map(mot => mot.replace(/^['’-]+|['’-]+$/g, ''))
    .filter(mot => mot.length >= 2 && mot === mot.toUpperCase() && mot !== mot.toLowerCase())
    // Un vrai nom a une voyelle (BA, SY, NDIAYE) ; « LL », « SS » ou « RN » sont du bruit.
    .filter(mot => /[AEIOUYÀ-Ý]/.test(mot) && !/^(.)\1+$/.test(mot))
    .filter(mot => !MOTS_EXCLUS.has(sansAccents(mot)));
}

/** Valeur d'une étiquette de nom : à sa suite sur la même ligne, ou sur l'une des deux suivantes. */
function valeurNom(lignes: string[], etiquette: RegExp): string | undefined {
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(etiquette);
    if (!m || m.index === undefined) continue;
    const memeLigne = motsDeNom(lignes[i].slice(m.index + m[0].length));
    if (memeLigne.length) return memeLigne.join(' ');
    for (let j = i + 1; j <= i + 2 && j < lignes.length; j++) {
      const mots = motsDeNom(lignes[j]);
      if (mots.length) return mots.join(' ');
      if (UNE_ETIQUETTE.test(lignes[j])) break;
    }
  }
  return undefined;
}

/**
 * Date de naissance : la plus ancienne des dates de la face qui la porte — la délivrance et
 * l'expiration viennent toujours après. Plus sûr que la proximité de l'étiquette, que l'OCR
 * déplace souvent d'une colonne à l'autre.
 */
function dateDeNaissance(lignes: string[]): string | undefined {
  if (!lignes.some(ligne => ETIQUETTES.naissance.test(ligne))) return undefined;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return lignes
    .flatMap(ligne => Array.from(ligne.matchAll(/(\d{2})\s?[\/.\-]\s?(\d{2})\s?[\/.\-]\s?(\d{4})/g)))
    .map(m => dateValide(m[1], m[2], m[3]))
    .filter((date): date is string => !!date && date >= '1900-01-01' && date <= aujourdhui)
    .sort()[0];
}

/** Sexe : lettre M ou F isolée après l'étiquette, sur sa ligne ou les deux suivantes. */
function lireSexe(lignes: string[]): string | undefined {
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(ETIQUETTES.sexe);
    if (!m || m.index === undefined) continue;
    const zones = [lignes[i].slice(m.index + m[0].length), lignes[i + 1] || '', lignes[i + 2] || ''];
    for (const zone of zones) {
      const lettre = zone.match(/(?:^|[^A-Za-z])([MF])(?![A-Za-z])/);
      if (lettre) return lettre[1];
      const mot = zone.match(/masculin|f[eé]minin/i);
      if (mot) return /^m/i.test(mot[0]) ? 'M' : 'F';
    }
  }
  return undefined;
}

/**
 * Numéro d'Identification National (NIN) : 13 ou 14 chiffres, cherché près de l'étiquette
 * « NIN », sinon n'importe où. Le n° de la carte, au recto, en a 17 : il ne peut pas être pris.
 */
function lireNin(lignes: string[]): string | undefined {
  const nin = (texte: string) => texte.replace(/[\s.]/g, '').match(/(?:^|\D)(\d{13,14})(?!\d)/)?.[1];
  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(ETIQUETTES.nin);
    if (!m || m.index === undefined) continue;
    const trouve = nin(lignes[i].slice(m.index + m[0].length)) || nin(lignes[i + 1] || '');
    if (trouve) return trouve;
  }
  for (const ligne of lignes) {
    const trouve = nin(ligne);
    if (trouve) return trouve;
  }
  return undefined;
}

// ══════════════════════════ utilitaires ══════════════════════════

function decouperLignes(texte: string): string[] {
  return texte.split(/\r?\n/).map(ligne => ligne.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** La lecture MRZ (contrôlée) prime ; elle complète sinon ce que le recto n'a pas donné. */
function assembler(etiquettes: OcrCniResult, mrz: OcrCniResult | null): OcrCniResult {
  if (!mrz) return etiquettes;
  const resultat: OcrCniResult = { ...etiquettes, sures: [...mrz.sures] };
  (Object.keys(CHAMPS) as ChampCni[]).forEach(champ => {
    const valeur = mrz[champ];
    if (valeur && (mrz.sures.includes(champ) || !resultat[champ])) resultat[champ] = valeur;
  });
  return resultat;
}

/** jj, mm, aaaa → aaaa-mm-jj, si la date existe au calendrier. */
function dateValide(jj: string, mm: string, aaaa: string): string | undefined {
  const jour = Number(jj), mois = Number(mm), annee = Number(aaaa);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  if (!jour || !mois || date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) {
    return undefined;
  }
  return `${aaaa}-${mm.padStart(2, '0')}-${jj.padStart(2, '0')}`;
}

function sansAccents(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
