/**
 * Lecture automatique (OCR) des documents d'identité — cahier des charges BCSU :
 *  - CNI : nom, prénom, date de naissance, numéro CNI
 *  - Carte d'assuré : nom, prénom, numéro d'immatriculation
 * Si l'extraction échoue, l'agent complète manuellement (repli prévu par le cahier).
 *
 * tesseract.js est chargé à la demande (chunk lazy) pour ne pas alourdir le bundle initial.
 */

export interface OcrCniResult {
  nom?: string;
  prenom?: string;
  dateNaissance?: string; // yyyy-MM-dd (format input[type=date])
  numeroCni?: string;
  sexe?: string;
}

export interface OcrCarteAssureResult {
  nom?: string;
  prenom?: string;
  numeroAssure?: string; // N° Immatriculation (ex. B6349N3856)
}



/** Lance l'OCR (français) sur une image (File ou data URL) et renvoie le texte brut. */
async function extraireTexte(image: File | string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  // En production (Vercel), les fichiers worker/WASM/langue ne sont pas bundlés.
  // On force le chargement depuis le CDN jsDelivr pour que ça marche partout.
  const worker = await createWorker('fra', 1, {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0/tesseract-core-simd-lstm.wasm.js',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}

/** Ligne « étiquette : valeur » ou valeur sur la ligne suivant l'étiquette. */
function chercherValeur(lignes: string[], etiquettes: RegExp, forceNextLine: boolean = false): string | undefined {
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (!etiquettes.test(ligne)) continue;
    
    if (!forceNextLine) {
      // Valeur sur la même ligne, après l'étiquette (et un éventuel séparateur).
      const apres = ligne.replace(etiquettes, '').replace(/^[\s:.\-\/|]+/, '').trim();
      if (apres && /[A-Za-zÀ-ÿ0-9]/.test(apres) && !/surname|given|names|birth/i.test(apres)) return apres;
    }

    // Sinon, première ligne non vide suivante.
    for (let j = i + 1; j < lignes.length; j++) {
      const suivante = lignes[j].trim();
      // Ignorer si la ligne suivante ressemble à une étiquette ou à une traduction anglaise ou des caractères parasites
      if (suivante && !/nom|pr[eé]nom|date|sexe|taille|surname|given|birth/i.test(suivante) && suivante.length > 2) {
        return suivante;
      }
    }
  }
  return undefined;
}

/** Garde uniquement un nom plausible (lettres, espaces, tirets), sinon undefined. */
function nettoyerNom(brut: string | undefined): string | undefined {
  if (!brut) return undefined;
  
  let nettoye = brut.replace(/[^A-Za-zÀ-ÿ' -]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Retirer les mots trop courts ou les parasites connus de l'OCR
  nettoye = nettoye.split(' ')
    .filter(w => w.length >= 2)
    .filter(w => !/^(surname|given|names|name|px|ee|si|fa)$/i.test(w))
    .join(' ');

  return nettoye.length >= 2 ? nettoye.toUpperCase() : undefined;
}

/** Convertit dd/mm/yyyy (ou dd.mm.yyyy, dd-mm-yyyy) en yyyy-MM-dd. */
function versDateIso(dateFr: string): string | undefined {
  const m = dateFr.match(/(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (!m) return undefined;
  const [, jj, mm, aaaa] = m;
  const mois = Number(mm), jour = Number(jj);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return undefined;
  return `${aaaa}-${mm}-${jj}`;
}

/** OCR d'une CNI sénégalaise : nom, prénom, date de naissance, numéro CNI. */
export async function ocrCni(image: File | string): Promise<OcrCniResult> {
  const texte = await extraireTexte(image);
  const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const resultat: OcrCniResult = {
    // Regex pour le nom : on cherche 'Nom' mais pas 'Prenom', et on force la lecture sur la ligne suivante.
    nom: nettoyerNom(chercherValeur(lignes, /(?:^|\s)n[o0]m\b(?!.*pr[eé]nom)/i, true)),
    // Regex pour le prénom : on force la lecture sur la ligne suivante.
    prenom: nettoyerNom(chercherValeur(lignes, /pr[eé]nom/i, true))
  };

  // Sexe : La CNI a l'étiquette bilingue "Sexe / Sex".
  // L'ancienne regex /sexe|sex/ ne remplaçait que la moitié, laissant "Sex" comme valeur.
  const regexSexe = /sexe\s*(?:[\/|]?\s*sex\b)?|sex\b/i;
  const ligneSexe = lignes.find(l => regexSexe.test(l));
  
  if (ligneSexe) {
    const apresSexe = ligneSexe.replace(regexSexe, '').replace(/^[\s:.\-\/|]+/, '').trim().toUpperCase();
    if (apresSexe.startsWith('M') || apresSexe.startsWith('H')) resultat.sexe = 'M';
    else if (apresSexe.startsWith('F')) resultat.sexe = 'F';
  }
  
  if (!resultat.sexe) {
    const valSexe = chercherValeur(lignes, regexSexe);
    if (valSexe) {
      const v = valSexe.trim().toUpperCase();
      if (v.startsWith('M') || v.startsWith('H')) resultat.sexe = 'M';
      else if (v.startsWith('F')) resultat.sexe = 'F';
    }
  }

  // Date de naissance : date proche de « né(e) le / naissance », sinon première date du document.
  const ligneNaissance = lignes.find(l => /n[eé]\(?e?\)?\s*le|naissance|birth/i.test(l) && /\d{2}[\/.-]\d{2}[\/.-]\d{4}/.test(l));
  const sourceDate = ligneNaissance || lignes.find(l => /\d{2}[\/.-]\d{2}[\/.-]\d{4}/.test(l));
  if (sourceDate) resultat.dateNaissance = versDateIso(sourceDate);

  // Numéro CNI : Numéro d'Identification National (NIN) sénégalais est généralement 13 ou 14 chiffres.
  // On ignore le numéro de carte d'identité (17 chiffres) qui est au recto.
  const texteSansEspaces = texte.replace(/[\s.]/g, '');
  // Cherche spécifiquement une séquence de 13 ou 14 chiffres entourée de caractères non-numériques
  const matchNIN = texteSansEspaces.match(/(?:^|\D)(\d{13,14})(?=\D|$)/);
  
  if (matchNIN) {
    resultat.numeroCni = matchNIN[1];
  } else {
    // Repli au cas où : on cherche le label NIN explicitement
    const labelNin = chercherValeur(lignes, /\bnin\b/i);
    if (labelNin) {
      const digits = labelNin.replace(/\D/g, '');
      if (digits.length >= 13) resultat.numeroCni = digits.substring(0, 14);
    }
  }
  
  return resultat;
}

/**
 * OCR d'une carte d'assuré SEN-CSU (régimes Classique / BSF / CEC) :
 * nom, prénom, numéro d'immatriculation.
 * Sur la carte, les valeurs sont sur la même ligne que l'étiquette
 * (« Nom: TOURÉ », « Prénom(s): OUMAR », « N° Immatriculation: B6349N3856 »).
 */
export async function ocrCarteAssure(image: File | string): Promise<OcrCarteAssureResult> {
  const texte = await extraireTexte(image);
  const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const resultat: OcrCarteAssureResult = {
    nom: nettoyerNom(chercherValeur(lignes, /(?:^|\s)n[o0]m\b(?!.*pr[eé]nom)/i)),
    prenom: nettoyerNom(chercherValeur(lignes, /pr[eé]nom(?:\(s\))?/i))
  };

  // Numéro d'immatriculation : valeur alphanumérique située APRÈS l'étiquette
  // (la ligne commence par « N° », qu'il ne faut pas inclure ; l'OCR peut aussi
  // insérer des espaces : « B 6349 N 3856 »).
  const etiquetteImmat = /immatriculation|matricule/i;
  const ligneImmat = lignes.find(l => etiquetteImmat.test(l));
  if (ligneImmat) {
    const apres = ligneImmat.slice(ligneImmat.search(etiquetteImmat)).replace(etiquetteImmat, '');
    const compact = apres.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (compact.length >= 6 && /\d/.test(compact)) {
      resultat.numeroAssure = compact;
    }
  }
  if (!resultat.numeroAssure) {
    // Repli : motif du numéro SEN-CSU (lettre + 4 chiffres + lettre + 4 chiffres)
    // recherché dans tout le texte, espaces retirés.
    const matchImmat = texte.toUpperCase().replace(/[\s.]/g, '').match(/[A-Z]\d{4}[A-Z]\d{4}/);
    if (matchImmat) resultat.numeroAssure = matchImmat[0];
  }

  return resultat;
}


