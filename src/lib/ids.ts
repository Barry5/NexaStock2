/**
 * Génération d'identifiants uniques (SYNC-09).
 *
 * Remplace les identifiants `${prefix}-${Date.now()}` et les suffixes aléatoires courts,
 * qui pouvaient entrer en collision entre deux postes (même milliseconde) ou entre
 * boutiques (espace d'identifiants global). Un UUID v4 offre 122 bits d'aléa.
 */

function fallbackUuid(): string {
  // Repli si crypto.randomUUID est indisponible (contexte non sécurisé) : getRandomValues reste requis.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return fallbackUuid();
}

/** Identifiant préfixé lisible, ex. `sa-3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90`. */
export function newId(prefix: string): string {
  return `${prefix}-${uuid()}`;
}

const DEVICE_KEY = 'nexastock_device_id';

/** Identifiant stable du poste (navigateur), utilisé pour la traçabilité des opérations. */
export function getDeviceId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = newId('dev');
    globalThis.localStorage?.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return 'dev-unknown';
  }
}

/** Mot de passe provisoire robuste (au moins 12 caractères), pour les comptes créés par un administrateur. */
export function generateTemporaryPassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}
