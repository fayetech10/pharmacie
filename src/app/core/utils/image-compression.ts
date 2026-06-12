/**
 * Compression d'image côté client avant envoi au serveur.
 *
 * Redimensionne l'image puis réduit progressivement la qualité JPEG jusqu'à
 * passer sous `maxBytes`, et renvoie une data URL (base64) prête à être envoyée.
 * Si la cible ne peut pas être atteinte (image extrême), renvoie le meilleur
 * résultat obtenu (le plus petit).
 */
export function compressImageToDataUrl(file: File, maxBytes = 50 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        try {
          resolve(shrinkToTarget(img, maxBytes));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Taille réelle (en octets) du contenu encodé d'une data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function shrinkToTarget(img: HTMLImageElement, maxBytes: number): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas non supporté');
  }

  let maxDim = 1280;            // dimension max de départ (px)
  let best = '';
  let bestBytes = Number.MAX_SAFE_INTEGER;

  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    // Fond blanc : évite le noir si l'image source (PNG) est transparente.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Qualité dégressive à cette dimension.
    for (let q = 0.8; q >= 0.4; q -= 0.1) {
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      const bytes = dataUrlBytes(dataUrl);
      if (bytes < bestBytes) {
        best = dataUrl;
        bestBytes = bytes;
      }
      if (bytes <= maxBytes) {
        return dataUrl;
      }
    }

    // Toujours trop volumineux : on réduit la dimension et on recommence.
    maxDim = Math.round(maxDim * 0.75);
  }

  return best; // meilleur effort
}
