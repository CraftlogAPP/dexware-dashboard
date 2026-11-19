// Beweisfoto im Browser: Kamera oder Mediathek (Dateiauswahl), herunterskaliert auf höchstens 1280 px
// Breite als JPEG (Qualität 0,6) — gleiche Werte wie die App (mobile/src/lib/photo.ts), klein genug für
// Speicher, PDF und die 3-MB-Grenze des Foto-Speichers.

const MAX_WIDTH = 1280;
const QUALITY = 0.6;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  // createImageBitmap dreht nach den EXIF-Angaben (Hochformat bleibt Hochformat)
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      /* weiter mit <img> (z. B. HEIC, das nur Safari über <img> liest) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Bild nicht lesbar'));
      img.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Datei → verkleinertes JPEG als Daten-URI. Wirft, wenn das Bild nicht lesbar ist. */
export async function fileToPhoto(file: Blob): Promise<string> {
  const { src, w, h, done } = await decode(file);
  try {
    if (!w || !h) throw new Error('Bild nicht lesbar');
    const scale = Math.min(1, MAX_WIDTH / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Bild nicht verarbeitbar');
    // JPEG kennt keine Transparenz → weißer Grund statt schwarz
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL('image/jpeg', QUALITY);
    if (!dataUri.startsWith('data:image/jpeg')) throw new Error('Bild nicht verarbeitbar');
    return dataUri;
  } finally {
    done();
  }
}

export function dataUriToBlob(dataUri: string): Blob {
  const comma = dataUri.indexOf(',');
  const bin = atob(dataUri.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}
