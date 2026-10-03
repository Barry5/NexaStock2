/**
 * Réduction des images avant stockage dans un document Firestore (SYNC-04).
 *
 * Un document Firestore est limité à 1 Mio : une image de 2 Mo encodée en base64
 * (≈ 2,7 Mo) était refusée par le serveur et faisait échouer tout son lot de synchronisation.
 * Les images sont redimensionnées (800 px max) et recompressées en JPEG ; au-delà de
 * MAX_DATA_URL_LENGTH après compression, l'image est refusée.
 *
 * Évolution prévue (phase 3) : stockage des images dans Cloud Storage, URL dans le document.
 */
export const MAX_DATA_URL_LENGTH = 350_000; // ≈ 260 Ko d'image, marge confortable sous 1 Mio

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

export async function compressImageFile(file: File, maxDimension = 800): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Le fichier sélectionné n\'est pas une image.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image trop volumineuse (10 Mo maximum avant compression).');
  const source = await readAsDataUrl(file);
  const img = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Compression d\'image indisponible sur ce navigateur.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.65, 0.5, 0.35]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl;
  }
  throw new Error('Image trop détaillée même après compression. Choisissez une image plus simple ou plus petite.');
}
