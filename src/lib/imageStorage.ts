/**
 * Images dans Cloud Storage (phase 3 — PERF / SYNC-04).
 *
 * Une image compressée est envoyée dans Cloud Storage et seule son URL est enregistrée dans
 * le document Firestore (documents légers, synchronisation rapide, cache local réduit).
 * Hors ligne ou en cas d'échec, l'image compressée reste en data URL (< 350 Ko) : la saisie
 * n'est jamais bloquée.
 */
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { firebaseApp } from './firebase';
import { uuid } from './ids';

export type ImageKind = 'products' | 'logos';

const UPLOAD_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Délai d\'envoi de l\'image dépassé')), ms)),
  ]);
}

/**
 * Retourne l'URL Cloud Storage de l'image, ou la data URL d'origine si l'envoi est impossible.
 */
export async function persistImage(
  dataUrl: string,
  params: { tenantId: string | null | undefined; kind: ImageKind; entityId?: string },
): Promise<{ url: string; stored: boolean }> {
  if (!dataUrl || !dataUrl.startsWith('data:')) return { url: dataUrl, stored: false };
  if (!params.tenantId || (typeof navigator !== 'undefined' && !navigator.onLine)) return { url: dataUrl, stored: false };
  try {
    const storage = getStorage(firebaseApp);
    const path = `tenants/${params.tenantId}/${params.kind}/${params.entityId || 'draft'}/${uuid()}.jpg`;
    const target = ref(storage, path);
    await withTimeout(
      uploadString(target, dataUrl, 'data_url', { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' }),
      UPLOAD_TIMEOUT_MS,
    );
    const url = await withTimeout<string>(getDownloadURL(target), UPLOAD_TIMEOUT_MS);
    return { url, stored: true };
  } catch (err) {
    console.warn('[IMAGES] Envoi vers Cloud Storage impossible, image conservée dans le document :', err);
    return { url: dataUrl, stored: false };
  }
}
