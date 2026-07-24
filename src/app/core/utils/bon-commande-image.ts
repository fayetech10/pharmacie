/**
 * Génère « la photo du bon de commande » côté pharmacie : au lieu de photographier
 * le bon papier, on reconstitue une image (data URL) du bon à partir des données
 * trouvées (recherche par numéro) + des lignes de médicaments saisies.
 *
 * Reproduit le formulaire papier ASCSU (cf. .bc-paper de facture-form) : en-tête,
 * métadonnées bénéficiaire, tableau des médicaments (lignes remplies + vides) et
 * totaux (général, part patient, part tiers payant). Sans dépendance externe
 * (Canvas 2D), le résultat s'intègre au stockage base64 existant des pièces.
 */

export interface BonImageLigne {
  medicament: string;
  quantite: number;
  prixUnitaire: number;
}

export interface BonImageData {
  numero: string;
  patientPrenom: string;
  patientNom: string;
  regimeLabel: string;
  lettreGarantieNumero: string;
  /** Déjà formatée (ex. « 06/07/2026 »). */
  dateEmission: string;
  nombreLignes: number;
  total: number;
  montantPatient: number;
  montantTiersPayant: number;
}

const FR = new Intl.NumberFormat('fr-FR');
const money = (n: number) => `${FR.format(Math.round(n || 0))} F`;

interface Col { title: string; w: number; align: CanvasTextAlign; }

const COLS: Col[] = [
  { title: 'Désignation', w: 250, align: 'left' },
  { title: 'Qté', w: 60, align: 'center' },
  { title: 'P. Unit.', w: 110, align: 'right' },
  { title: 'Total', w: 118, align: 'right' },
  { title: 'PEC', w: 114, align: 'center' }
];

const INK = '#1F2937';
const MUTED = '#6B7280';
const LINE = '#CBD5E1';
const GREEN = '#047857';
const HEAD_BG = '#F1F5F4';

/** Tronque un texte pour qu'il tienne dans maxW (avec « … » si besoin). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

export function renderBonCommandeToDataUrl(data: BonImageData, lignes: BonImageLigne[]): string {
  const S = 1.5; // léger suréchantillonnage : net tout en gardant le base64 compact (~50 Ko)
  const W = 700;
  const P = 24;
  const contentW = W - P * 2;
  const rowH = 30;
  const nRows = Math.max(data.nombreLignes || 0, lignes.length, 1);

  // Hauteur totale (mêmes incréments que le tracé ci-dessous).
  const H =
    P + 30 + 24 + 22 + 16 +   // titre + n° + sous-titre
    4 * 22 + 16 +             // 4 lignes de métadonnées
    32 +                      // en-tête du tableau
    nRows * rowH +            // lignes
    3 * 26 + 14 +             // totaux
    22 + P;                   // note de bas

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);
  ctx.textBaseline = 'middle';

  // Fond + cadre
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  let y = P;

  // Titre
  ctx.fillStyle = GREEN;
  ctx.textAlign = 'center';
  ctx.font = '700 20px Arial, sans-serif';
  ctx.fillText('BON DE COMMANDE', W / 2, y + 14);
  y += 30;

  // Numéro
  ctx.fillStyle = INK;
  ctx.font = '700 15px Arial, sans-serif';
  ctx.fillText(`N° ${data.numero}`, W / 2, y + 12);
  y += 24;

  // Sous-titre
  ctx.fillStyle = MUTED;
  ctx.font = 'italic 12px Arial, sans-serif';
  ctx.fillText("Médicament du circuit d'officine (prise en charge 50%)", W / 2, y + 11);
  y += 22 + 16;

  // Métadonnées (label + valeur, alignées à gauche)
  ctx.textAlign = 'left';
  const meta: [string, string][] = [
    ["Date d'émission :", data.dateEmission || '—'],
    ['Nom du bénéficiaire :', `${data.patientPrenom} ${data.patientNom}`.trim() || '—'],
    ['Régime :', data.regimeLabel || '—'],
    ['Lettre de garantie :', data.lettreGarantieNumero || '—']
  ];
  for (const [label, value] of meta) {
    ctx.fillStyle = MUTED;
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(label, P, y + 11);
    ctx.fillStyle = INK;
    ctx.font = '700 12px Arial, sans-serif';
    ctx.fillText(fitText(ctx, value, contentW - 150), P + 150, y + 11);
    y += 22;
  }
  y += 16;

  // ---- Tableau ----
  const xCol: number[] = [];
  let cx = P;
  for (const c of COLS) { xCol.push(cx); cx += c.w; }
  const tableRight = P + contentW;

  const cellX = (i: number) => {
    const c = COLS[i];
    if (c.align === 'left') return xCol[i] + 8;
    if (c.align === 'right') return xCol[i] + c.w - 8;
    return xCol[i] + c.w / 2;
  };

  // En-tête du tableau
  ctx.fillStyle = HEAD_BG;
  ctx.fillRect(P, y, contentW, 32);
  ctx.fillStyle = INK;
  ctx.font = '700 12px Arial, sans-serif';
  COLS.forEach((c, i) => { ctx.textAlign = c.align; ctx.fillText(c.title, cellX(i), y + 16); });
  y += 32;

  // Lignes
  ctx.font = '12px Arial, sans-serif';
  for (let r = 0; r < nRows; r++) {
    const l = lignes[r];
    if (l) {
      const cells = [
        l.medicament || '',
        String(l.quantite ?? ''),
        money(l.prixUnitaire),
        money(l.quantite * l.prixUnitaire),
        '50%'
      ];
      ctx.fillStyle = INK;
      COLS.forEach((c, i) => {
        ctx.textAlign = c.align;
        const txt = i === 0 ? fitText(ctx, cells[i], c.w - 16) : cells[i];
        ctx.fillText(txt, cellX(i), y + rowH / 2);
      });
    }
    // Séparateur de ligne
    ctx.strokeStyle = '#E5E7EB';
    ctx.beginPath();
    ctx.moveTo(P, y + rowH);
    ctx.lineTo(tableRight, y + rowH);
    ctx.stroke();
    y += rowH;
  }

  // Bordure extérieure + séparateurs de colonnes du tableau
  const tableTop = y - nRows * rowH - 32;
  ctx.strokeStyle = LINE;
  ctx.strokeRect(P, tableTop, contentW, 32 + nRows * rowH);
  ctx.beginPath();
  for (let i = 1; i < COLS.length; i++) {
    ctx.moveTo(xCol[i], tableTop);
    ctx.lineTo(xCol[i], y);
  }
  ctx.stroke();

  // ---- Totaux ----
  y += 14;
  const totals: [string, number, boolean][] = [
    ['TOTAL GÉNÉRAL', data.total, true],
    ['Montant à payer par le patient', data.montantPatient, false],
    ['Montant à facturer au tiers payant', data.montantTiersPayant, false]
  ];
  for (const [label, value, strong] of totals) {
    ctx.textAlign = 'left';
    ctx.fillStyle = strong ? INK : MUTED;
    ctx.font = `${strong ? 700 : 400} 12px Arial, sans-serif`;
    ctx.fillText(label, P, y + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = strong ? GREEN : INK;
    ctx.font = '700 13px Arial, sans-serif';
    ctx.fillText(money(value), tableRight, y + 12);
    y += 26;
  }

  // Note de bas de page
  y += 6;
  ctx.textAlign = 'center';
  ctx.fillStyle = MUTED;
  ctx.font = 'italic 11px Arial, sans-serif';
  ctx.fillText('Document constitué automatiquement à partir du bon de commande enregistré.', W / 2, y + 10);

  // JPEG (fond blanc, pas de transparence) → data URL compacte pour le stockage.
  return canvas.toDataURL('image/jpeg', 0.78);
}
