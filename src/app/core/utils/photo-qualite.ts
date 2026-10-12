/**
 * Contrôle de qualité d'une photo de document (CNI, extrait de naissance, ticket…) avant
 * qu'elle soit acceptée dans un dossier patient.
 *
 * Tout se passe dans le navigateur, sur une version réduite de la photo : aucun envoi au
 * serveur pour une image qui sera de toute façon refusée. Les critères suivent le cahier
 * des charges : document entièrement visible et non coupé, correctement cadré, lisible,
 * pas excessivement flou.
 *
 * Ce sont des heuristiques d'analyse d'image, réglées pour ne refuser que les photos
 * franchement mauvaises : mieux vaut laisser passer une photo moyenne que bloquer un
 * agent devant un patient.
 */

import { libererCanvas } from './image-compression';

export interface ResultatQualite {
  conforme: boolean;
  /** Raisons du refus, formulées pour l'agent. */
  motifs: string[];
}

export const MESSAGE_PHOTO_NON_CONFORME =
  'Photo non conforme. Veuillez reprendre la photo en veillant à ce que l\'intégralité du document soit visible et lisible.';

/** Largeur d'analyse : assez pour mesurer la netteté du texte, assez peu pour rester instantané. */
const LARGEUR_ANALYSE = 640;

const SEUILS = {
  /** Plus petit côté de la photo d'origine (après correction d'orientation), en pixels. */
  resolutionMin: 480,
  luminositeMin: 45,
  luminositeMax: 235,
  /** Écart-type de la luminance : en dessous, le texte se confond avec le fond. */
  contrasteMin: 22,
  /** Variance du laplacien : mesure classique du flou (bords nets = forte variance). */
  netteteMin: 40,
  /** Densité de contours d'un bord de la photo au-delà de laquelle le document y est coupé. */
  bordMax: 0.12
};

/**
 * Analyse une photo déjà décodée dans un canvas de travail (voir `chargerImageReduite`,
 * qui applique l'orientation EXIF et borne la mémoire sur mobile).
 */
export function analyserPhoto(image: HTMLCanvasElement): ResultatQualite {
  const motifs: string[] = [];
  if (Math.min(image.width, image.height) < SEUILS.resolutionMin) {
    motifs.push('Résolution trop faible : rapprochez-vous du document.');
  }

  const echelle = Math.min(1, LARGEUR_ANALYSE / image.width);
  const l = Math.max(3, Math.round(image.width * echelle));
  const h = Math.max(3, Math.round(image.height * echelle));
  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    // Analyse impossible sur ce navigateur : on ne bloque pas l'agent pour autant.
    return { conforme: motifs.length === 0, motifs };
  }
  ctx.drawImage(image, 0, 0, l, h);
  const gris = niveauxDeGris(ctx.getImageData(0, 0, l, h).data);
  libererCanvas(canvas);

  let somme = 0;
  for (let i = 0; i < gris.length; i++) {
    somme += gris[i];
  }
  const moyenne = somme / gris.length;
  let variance = 0;
  for (let i = 0; i < gris.length; i++) {
    variance += (gris[i] - moyenne) ** 2;
  }
  const contraste = Math.sqrt(variance / gris.length);
  const nettete = varianceLaplacien(gris, l, h);

  // Carte des contours.
  const bande = Math.max(3, Math.round(0.03 * Math.min(l, h)));
  const zones = { haut: [0, 0], bas: [0, 0], gauche: [0, 0], droite: [0, 0], centre: [0, 0] };
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      const contour = Math.abs(gris[i + 1] - gris[i - 1]) + Math.abs(gris[i + l] - gris[i - l]) > 60 ? 1 : 0;
      const enHaut = y < bande, enBas = y >= h - bande, aGauche = x < bande, aDroite = x >= l - bande;
      if (enHaut) { zones.haut[0] += contour; zones.haut[1]++; }
      if (enBas) { zones.bas[0] += contour; zones.bas[1]++; }
      if (aGauche) { zones.gauche[0] += contour; zones.gauche[1]++; }
      if (aDroite) { zones.droite[0] += contour; zones.droite[1]++; }
      if (y >= bande * 3 && y < h - bande * 3 && x >= bande * 3 && x < l - bande * 3) {
        zones.centre[0] += contour; zones.centre[1]++;
      }
    }
  }
  const densite = (z: number[]) => z[1] ? z[0] / z[1] : 0;

  if (moyenne < SEUILS.luminositeMin) {
    motifs.push('Photo trop sombre : éclairez davantage le document.');
  } else if (moyenne > SEUILS.luminositeMax) {
    motifs.push('Photo surexposée : évitez le flash ou la lumière directe.');
  }
  if (contraste < SEUILS.contrasteMin) {
    motifs.push('Les informations ne sont pas lisibles (photo trop peu contrastée).');
  }
  if (nettete < SEUILS.netteteMin) {
    motifs.push('Photo floue : tenez l\'appareil immobile et faites la mise au point.');
  }

  // Un document coupé laisse son contenu (texte, cadres) toucher le bord de la photo.
  const centre = densite(zones.centre);
  const coupes = (['haut', 'bas', 'gauche', 'droite'] as const)
    .filter(cote => densite(zones[cote]) > Math.max(SEUILS.bordMax, centre * 0.9));
  if (centre > 0.01 && coupes.length > 0) {
    motifs.push(`Document coupé ou mal cadré (bord ${coupes.join(', ')}) : laissez une petite marge tout autour.`);
  }

  return { conforme: motifs.length === 0, motifs };
}

/** Zone d'une image, en pixels de cette image. */
export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

/** Netteté en dessous de laquelle le contrôle de qualité refuse une photo. */
export const NETTETE_MIN = SEUILS.netteteMin;

/**
 * Netteté d'une zone d'image (vidéo de la caméra, photo), mesurée comme au contrôle de
 * qualité : la caméra intégrée s'en sert pour guider l'agent, puis pour garder l'image la
 * plus nette d'une rafale. `canvas` est un canvas de travail réutilisé d'une mesure à l'autre.
 */
export function mesurerNettete(source: CanvasImageSource, zone: Zone, canvas: HTMLCanvasElement): number {
  const echelle = Math.min(1, LARGEUR_ANALYSE / zone.largeur);
  const l = Math.max(3, Math.round(zone.largeur * echelle));
  const h = Math.max(3, Math.round(zone.hauteur * echelle));
  if (canvas.width !== l || canvas.height !== h) {
    canvas.width = l;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(source, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, l, h);
  return varianceLaplacien(niveauxDeGris(ctx.getImageData(0, 0, l, h).data), l, h);
}

function niveauxDeGris(pixels: Uint8ClampedArray): Float32Array {
  const gris = new Float32Array(pixels.length / 4);
  for (let i = 0, p = 0; i < gris.length; i++, p += 4) {
    gris[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
  }
  return gris;
}

/** Variance du laplacien : mesure classique du flou (bords nets = forte variance). */
function varianceLaplacien(gris: Float32Array, l: number, h: number): number {
  let somme = 0;
  let carres = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < l - 1; x++) {
      const i = y * l + x;
      const lap = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - l] - gris[i + l];
      somme += lap;
      carres += lap * lap;
      n++;
    }
  }
  const moyenne = somme / Math.max(1, n);
  return carres / Math.max(1, n) - moyenne * moyenne;
}
