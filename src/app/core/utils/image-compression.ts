/**
 * Compression d'image côté client avant envoi au serveur.
 *
 * Redimensionne l'image puis réduit progressivement la qualité JPEG jusqu'à
 * passer sous `maxBytes`, et renvoie une data URL (base64) prête à être envoyée.
 * Si la cible ne peut pas être atteinte (image extrême), renvoie le meilleur
 * résultat obtenu (le plus petit).
 */
export async function compressImageToDataUrl(file: Blob, maxBytes = 50 * 1024): Promise<string> {
  const img = await decoderImage(file);
  try {
    return shrinkToTarget(img, img.naturalWidth, img.naturalHeight, maxBytes);
  } finally {
    img.src = '';
  }
}

/**
 * Décode une photo une seule fois et la ramène à `maxDim` pixels au plus sur son grand
 * côté, dans un canvas de travail dont on tire ensuite tout le reste (contrôle de qualité,
 * compression, OCR).
 *
 * Passe par une URL d'objet et non par une data URL : la photo d'un téléphone (4 à 8 Mo)
 * n'est jamais recopiée en base64 dans la mémoire de la page. Le dessin dans le canvas
 * applique l'orientation EXIF. Libérer le canvas avec `libererCanvas` après usage.
 */
export async function chargerImageReduite(fichier: Blob, maxDim = 2400): Promise<HTMLCanvasElement> {
  const img = await decoderImage(fichier);
  try {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non supporté');
    // Fond blanc : évite le noir si l'image source (PNG) est transparente.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    img.src = ''; // rend tout de suite la mémoire de l'image décodée en pleine résolution
  }
}

/** Compression d'un canvas de travail (voir `chargerImageReduite`) sous `maxBytes`. */
export function compresserCanvas(canvas: HTMLCanvasElement, maxBytes: number): string {
  return shrinkToTarget(canvas, canvas.width, canvas.height, maxBytes);
}

export function canvasVersBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Encodage de l\'image impossible')), type, quality);
  });
}

/** Rend immédiatement la mémoire d'un canvas (sur mobile, le ramasse-miettes tarde). */
export function libererCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function decoderImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image invalide'));
    };
    img.src = url;
  });
}

/** Taille réelle (en octets) du contenu encodé d'une data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function shrinkToTarget(img: CanvasImageSource, largeur: number, hauteur: number, maxBytes: number): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas non supporté');
  }

  let maxDim = 1280;            // dimension max de départ (px)
  let best = '';
  let bestBytes = Number.MAX_SAFE_INTEGER;

  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, maxDim / Math.max(largeur, hauteur));
      const w = Math.max(1, Math.round(largeur * scale));
      const h = Math.max(1, Math.round(hauteur * scale));

      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      // Fond blanc : évite le noir si l'image source (PNG) est transparente.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
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
  } finally {
    libererCanvas(canvas);
  }
}
