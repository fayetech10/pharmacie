/**
 * Génère « la carte d'assuré » de la liasse à partir de la vérification sur
 * carte.sencsu.sn : au lieu de photographier la carte, on reconstitue une image
 * (data URL) avec les données officielles renvoyées par le site.
 *
 * Le rendu reprend la présentation de la carte officielle de couverture santé :
 * drapeau du Sénégal, titre « CARTE DE COUVERTURE SANTE », identité (nom, prénoms,
 * n° d'immatriculation), photo, QR code vers la fiche officielle, logo de l'Agence
 * (SEN-CSU) et bandeau aux couleurs nationales. Canvas 2D ; le QR est produit par la
 * librairie `qrcode`. Le résultat s'intègre au stockage base64 existant des pièces
 * (carteAssureRecto de la lettre de garantie).
 */

import QRCode from 'qrcode';
import { CarteCsu } from '../models/carte-csu.model';

const NAVY = '#16357E';        // titre et libellés
const INK = '#1F2937';         // valeurs
const MUTED = '#9CA3AF';       // emplacement photo
const LINE = '#CBD5E1';
const FLAG_GREEN = '#00853F';
const FLAG_YELLOW = '#FDEF42';
const FLAG_RED = '#E31B23';
const LOGO_GREEN = '#3C8C4E';  // texte du logo SEN-CSU

const W = 700;
const H = 400; // présentation proche d'une carte officielle (ratio ~1,75:1)

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function rondRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Étoile à 5 branches (drapeau et bandeau), pointe vers le haut. */
function etoile(ctx: CanvasRenderingContext2D, cx: number, cy: number, rExt: number, couleur: string) {
  const rInt = rExt * 0.4;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rExt : rInt;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = couleur;
  ctx.fill();
}

/** Drapeau du Sénégal : tricolore vertical vert-jaune-rouge, étoile verte au centre. */
function drapeau(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const b = w / 3;
  ctx.fillStyle = FLAG_GREEN; ctx.fillRect(x, y, b, h);
  ctx.fillStyle = FLAG_YELLOW; ctx.fillRect(x + b, y, b, h);
  ctx.fillStyle = FLAG_RED; ctx.fillRect(x + 2 * b, y, b, h);
  etoile(ctx, x + w / 2, y + h / 2, h * 0.3, FLAG_GREEN);
  ctx.strokeStyle = LINE; ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, w, h);
}

/** Image embarquée (data URL) ou asset même origine : les URL externes « saliraient » le canvas. */
function chargerImage(src?: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function assetUrl(chemin: string): string {
  try {
    return new URL(chemin, document.baseURI).href;
  } catch {
    return chemin;
  }
}

/** Ligne « Libellé : valeur ». */
function ligne(ctx: CanvasRenderingContext2D, x: number, y: number, maxW: number, libelle: string, valeur: string) {
  ctx.fillStyle = NAVY;
  ctx.font = '700 15px Arial, sans-serif';
  const lib = libelle + ' : ';
  ctx.fillText(lib, x, y);
  const lw = ctx.measureText(lib).width;
  ctx.fillStyle = INK;
  ctx.font = '400 15px Arial, sans-serif';
  ctx.fillText(fitText(ctx, valeur || '—', maxW - lw), x + lw, y);
}

export async function renderCarteAssureToDataUrl(carte: CarteCsu, _verifieeLe: Date = new Date()): Promise<string> {
  const S = 2; // suréchantillonnage : net à l'impression tout en gardant le base64 raisonnable
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);
  ctx.textBaseline = 'alphabetic';

  // Fond blanc puis carte aux coins arrondis, bordure bleu marine.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  const m = 8;
  rondRect(ctx, m, m, W - 2 * m, H - 2 * m, 18);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // En-tête : drapeau centré puis titre.
  drapeau(ctx, W / 2 - 23, 22, 46, 30);
  ctx.textAlign = 'center';
  ctx.fillStyle = NAVY;
  ctx.font = '700 23px Arial, sans-serif';
  const anyCtx = ctx as unknown as { letterSpacing?: string };
  const spacing0 = anyCtx.letterSpacing;
  try { anyCtx.letterSpacing = '2px'; } catch { /* ignoré si non supporté */ }
  ctx.fillText('CARTE DE COUVERTURE SANTE', W / 2, 86);
  try { anyCtx.letterSpacing = spacing0 ?? 'normal'; } catch { /* idem */ }
  ctx.textAlign = 'left';

  // Photo (ou emplacement en pointillés).
  const px = 34, py = 108, pw = 120, ph = 150;
  const [photo, logo, qrImg] = await Promise.all([
    chargerImage(carte.photo && carte.photo.startsWith('data:image/') ? carte.photo : undefined),
    chargerImage(assetUrl('assets/logo-csu.png')),
    chargerImage(await genererQr(carte))
  ]);
  if (photo) {
    ctx.save();
    rondRect(ctx, px, py, pw, ph, 10);
    ctx.clip();
    const echelle = Math.max(pw / photo.width, ph / photo.height);
    const dw = photo.width * echelle, dh = photo.height * echelle;
    ctx.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    ctx.restore();
    rondRect(ctx, px, py, pw, ph, 10);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.stroke();
  } else {
    ctx.save();
    rondRect(ctx, px, py, pw, ph, 10);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Petite icône « image » + libellé.
    ctx.strokeStyle = MUTED; ctx.lineWidth = 2;
    const ix = px + pw / 2 - 16, iy = py + ph / 2 - 28, iw = 32, ih = 26;
    rondRect(ctx, ix, iy, iw, ih, 3); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix + 4, iy + ih - 5);
    ctx.lineTo(ix + 12, iy + ih - 14);
    ctx.lineTo(ix + 19, iy + ih - 7);
    ctx.lineTo(ix + 24, iy + ih - 12);
    ctx.lineTo(ix + iw - 4, iy + ih - 5);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.beginPath(); ctx.arc(ix + iw - 9, iy + 7, 3, 0, Math.PI * 2); ctx.fill();
    ctx.font = '400 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Photo', px + pw / 2, py + ph / 2 + 30);
    ctx.textAlign = 'left';
  }

  // Identité.
  const fx = 182, fMaxW = W - fx - 190; // on garde la colonne de droite pour le QR
  ligne(ctx, fx, 135, fMaxW, 'Nom', (carte.nom || '').toUpperCase());
  ligne(ctx, fx, 178, fMaxW, 'Prénom(s)', carte.prenom || '');
  ligne(ctx, fx, 221, fMaxW, 'N° Immatriculation', carte.codeImmatriculation || '');

  // QR code (vers la fiche officielle).
  if (qrImg) {
    const qs = 118, qx = W - 34 - qs, qy = 104;
    ctx.drawImage(qrImg, qx, qy, qs, qs);
  }

  // Logo de l'Agence, en bas à droite au-dessus du bandeau.
  const band = 22;
  const ly = H - band - 78;
  if (logo) {
    const ls = 58;
    const lx = W - 34 - 216;
    ctx.drawImage(logo, lx, ly, ls, ls);
    ctx.fillStyle = LOGO_GREEN;
    ctx.font = '700 9.5px Arial, sans-serif';
    const tx = lx + ls + 8, ty = ly + 18;
    ctx.fillText('AGENCE SENEGALAISE DE LA', tx, ty);
    ctx.fillText('COUVERTURE SANITAIRE', tx, ty + 14);
    ctx.fillText('UNIVERSELLE', tx, ty + 28);
  }

  // Bandeau aux couleurs nationales, étoile verte au centre.
  const bw = (W - 2 * m) / 3;
  ctx.fillStyle = FLAG_GREEN; ctx.fillRect(m, H - m - band, bw, band);
  ctx.fillStyle = FLAG_YELLOW; ctx.fillRect(m + bw, H - m - band, bw, band);
  ctx.fillStyle = FLAG_RED; ctx.fillRect(m + 2 * bw, H - m - band, bw, band);
  etoile(ctx, W / 2, H - m - band / 2, band * 0.42, FLAG_GREEN);

  ctx.restore();
  rondRect(ctx, m, m, W - 2 * m, H - 2 * m, 18);
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** QR vers la fiche officielle de la carte ; renvoie une data URL PNG (ou '' en cas d'échec). */
async function genererQr(carte: CarteCsu): Promise<string> {
  const code = (carte.codeImmatriculation || '').replace(/\s+/g, '');
  const url = `https://carte.sencsu.sn/?code=${encodeURIComponent(code)}`;
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 236, color: { dark: '#111111', light: '#FFFFFF' } });
  } catch {
    return '';
  }
}
