import firebaseConfig from '../../firebase-applet-config.json';
import { DBState } from '../types';

export interface DriveUserProfile {
  email: string;
  name: string;
  picture?: string;
}

export interface DriveBackupItem {
  id: string;
  name: string;
  createdAt: string;
  size: number;
  driveSize: number;
  version: string;
  strategy: 'full' | 'incremental' | 'differential';
  label: string;
  tenantId?: string;
  hash?: string;
  webViewLink?: string;
}

export interface BackupPayload {
  manifest: {
    id: string;
    createdAt: string;
    version: string;
    label: string;
    strategy: 'full' | 'incremental' | 'differential';
    tenantId: string;
    tenantName: string;
    hash: string;
    summary: Record<string, number>;
  };
  data: Partial<DBState>;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

// In-memory token cache
let cachedToken: string | null = null;
let cachedProfile: DriveUserProfile | null = null;
let tokenExpiresAt = 0;

const CLIENT_ID =
  firebaseConfig?.oAuthClientId ||
  '221432485487-51m14sctlnfco98r1ccvhcqq9a2sn486.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const BACKUP_FOLDER_NAME = 'NexaStock Backups';

/**
 * Assure que le script Google Identity Services est injecté et disponible
 */
export async function ensureGsiLoaded(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return;
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Impossible de charger Google Identity Services')));
      // S'il est déjà chargé mais pas encore initialisé
      setTimeout(() => {
        if (window.google?.accounts?.oauth2) resolve();
        else reject(new Error('Délai dépassé pour charger Google Identity Services'));
      }, 3000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erreur réseau lors du chargement de Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Récupère le jeton d'accès Google Drive avec le scope drive.file via GSI Popup
 */
export async function requestDriveAccessToken(): Promise<{ token: string; profile: DriveUserProfile }> {
  // Vérifier si le token en mémoire est encore valide (avec 60s de marge)
  if (cachedToken && cachedProfile && Date.now() < tokenExpiresAt - 60000) {
    return { token: cachedToken, profile: cachedProfile };
  }

  await ensureGsiLoaded();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services non disponible.');
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google!.accounts!.oauth2!.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: async (response) => {
          if (response.error) {
            reject(new Error(`Erreur d'autorisation Google: ${response.error}`));
            return;
          }
          if (!response.access_token) {
            reject(new Error("Aucun jeton d'accès reçu de Google."));
            return;
          }

          const token = response.access_token;
          cachedToken = token;
          // Les tokens GSI durent généralement 3600 secondes
          tokenExpiresAt = Date.now() + 3500 * 1000;

          try {
            // Récupération de l'identité de l'utilisateur Google
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (profileRes.ok) {
              const p = await profileRes.json();
              cachedProfile = {
                email: p.email || 'Utilisateur Google',
                name: p.name || p.email || 'Google User',
                picture: p.picture,
              };
            } else {
              cachedProfile = { email: 'compte-google@drive', name: 'Google Drive' };
            }

            resolve({ token, profile: cachedProfile });
          } catch {
            cachedProfile = { email: 'compte-google@drive', name: 'Google Drive' };
            resolve({ token, profile: cachedProfile });
          }
        },
        error_callback: (err) => {
          reject(new Error(err?.message || 'Connexion Google Drive annulée ou échouée.'));
        },
      });

      client.requestAccessToken();
    } catch (err: any) {
      reject(new Error(err?.message || 'Échec initialisation Google OAuth'));
    }
  });
}

/**
 * Retourne le token actif ou en redemande un
 */
export async function getActiveDriveToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }
  const { token } = await requestDriveAccessToken();
  return token;
}

/**
 * Révoque et nettoie le token en mémoire
 */
export function disconnectDrive(): void {
  if (cachedToken && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(cachedToken, () => {});
    } catch (e) {
      console.warn('Erreur lors de la révocation du jeton Google Drive:', e);
    }
  }
  cachedToken = null;
  cachedProfile = null;
  tokenExpiresAt = 0;
}

/**
 * Récupère l'état courant de connexion Google Drive en mémoire
 */
export function getDriveConnectionState(): { connected: boolean; email: string | null } {
  const isConnected = !!(cachedToken && Date.now() < tokenExpiresAt - 60000);
  return {
    connected: isConnected,
    email: isConnected && cachedProfile ? cachedProfile.email : null,
  };
}

/**
 * Trouve ou crée le dossier "NexaStock Backups" sur Google Drive
 */
export async function getOrCreateBackupFolder(token: string): Promise<string> {
  const q = `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Échec recherche dossier Google Drive: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Créer le dossier s'il n'existe pas
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Dossier officiel des sauvegardes sécurisées NexaStock ERP / POS',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Échec création dossier Google Drive: ${createRes.statusText}`);
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Calcule l'empreinte SHA-256 d'une chaîne
 */
export async function calculateSha256(text: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'sha256-unsupported';
  }
}

/**
 * Envoie un fichier de sauvegarde vers Google Drive (Requête Multipart)
 */
export async function uploadBackupToDrive(
  token: string,
  params: {
    db: DBState;
    tenantId: string;
    label: string;
    strategy: 'full' | 'incremental' | 'differential';
  }
): Promise<{ file: DriveBackupItem; manifest: any }> {
  const folderId = await getOrCreateBackupFolder(token);

  const targetTenant = params.db.tenants.find((t) => t.id === params.tenantId) || {
    id: params.tenantId || 'global',
    name: 'Toutes les boutiques',
  };

  const isGlobal = !params.tenantId || params.tenantId === 'all';

  // Filtrer les données par tenant (sauf pour les collections globales ou superadmin)
  const filterByTenant = <T extends { tenantId?: string }>(items: T[] | undefined): T[] => {
    if (!items) return [];
    if (isGlobal) return items;
    return items.filter((item) => !item.tenantId || item.tenantId === params.tenantId);
  };

  const dataToExport: Partial<DBState> = {
    tenants: isGlobal ? params.db.tenants : params.db.tenants.filter((t) => t.id === params.tenantId),
    products: filterByTenant(params.db.products),
    customers: filterByTenant(params.db.customers),
    sales: filterByTenant(params.db.sales),
    suppliers: filterByTenant(params.db.suppliers),
    expenses: filterByTenant(params.db.expenses),
    loans: filterByTenant(params.db.loans),
    warehouses: filterByTenant(params.db.warehouses),
    transfers: filterByTenant(params.db.transfers),
    invoices: filterByTenant(params.db.invoices),
    deliveryOrders: filterByTenant(params.db.deliveryOrders),
    payments: filterByTenant(params.db.payments),
    returns: filterByTenant(params.db.returns),
    affiliates: filterByTenant(params.db.affiliates),
    commissionRules: filterByTenant(params.db.commissionRules),
    commissionLedger: filterByTenant(params.db.commissionLedger),
    commissionPayments: filterByTenant(params.db.commissionPayments),
    auditLogs: filterByTenant(params.db.auditLogs),
  };

  const summary = {
    products: dataToExport.products?.length || 0,
    customers: dataToExport.customers?.length || 0,
    sales: dataToExport.sales?.length || 0,
    invoices: dataToExport.invoices?.length || 0,
    affiliates: dataToExport.affiliates?.length || 0,
    commissionLedger: dataToExport.commissionLedger?.length || 0,
    expenses: dataToExport.expenses?.length || 0,
  };

  const jsonStringWithoutHash = JSON.stringify(dataToExport);
  const hash = await calculateSha256(jsonStringWithoutHash);

  const manifestId = `backup_${Date.now()}`;
  const nowIso = new Date().toISOString();

  const manifest = {
    id: manifestId,
    createdAt: nowIso,
    version: '2.0',
    label: params.label.trim() || `Sauvegarde ${targetTenant.name}`,
    strategy: params.strategy,
    tenantId: params.tenantId,
    tenantName: targetTenant.name,
    hash,
    summary,
  };

  const fullPayload: BackupPayload = {
    manifest,
    data: dataToExport,
  };

  const payloadString = JSON.stringify(fullPayload, null, 2);
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sanitizedTenant = targetTenant.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `NexaStock_Backup_${sanitizedTenant}_${dateStr}.json`;

  const driveMetadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
    description: JSON.stringify({
      id: manifestId,
      version: '2.0',
      strategy: params.strategy,
      label: manifest.label,
      tenantId: params.tenantId,
      hash,
      summary,
    }),
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(driveMetadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    payloadString +
    closeDelimiter;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,description,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`Échec upload Google Drive (${uploadRes.status}): ${errBody}`);
  }

  const uploadedFile = await uploadRes.json();
  const driveSize = Number(uploadedFile.size || payloadString.length);

  const item: DriveBackupItem = {
    id: uploadedFile.id,
    name: uploadedFile.name || fileName,
    createdAt: uploadedFile.createdTime || nowIso,
    size: driveSize,
    driveSize,
    version: '2.0',
    strategy: params.strategy,
    label: manifest.label,
    tenantId: params.tenantId,
    hash,
    webViewLink: uploadedFile.webViewLink,
  };

  return { file: item, manifest };
}

/**
 * Récupère la liste des sauvegardes présentes sur Google Drive dans le dossier NexaStock
 */
export async function listDriveBackups(
  token: string,
  tenantFilter?: string
): Promise<DriveBackupItem[]> {
  const folderId = await getOrCreateBackupFolder(token);

  const q = `'${folderId}' in parents and trashed = false and mimeType = 'application/json'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=files(id,name,size,createdTime,description,webViewLink)&orderBy=createdTime desc&pageSize=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Impossible de lister les fichiers Google Drive: ${res.statusText}`);
  }

  const data = await res.json();
  const files = data.files || [];

  const items: DriveBackupItem[] = files.map((f: any) => {
    let parsedDesc: any = {};
    try {
      if (f.description) parsedDesc = JSON.parse(f.description);
    } catch {
      // Ignorer si description n'est pas du JSON
    }

    const size = Number(f.size || 0);

    return {
      id: f.id,
      name: f.name,
      createdAt: f.createdTime,
      size,
      driveSize: size,
      version: parsedDesc.version || '2.0',
      strategy: parsedDesc.strategy || 'full',
      label: parsedDesc.label || f.name.replace(/\.json$/, ''),
      tenantId: parsedDesc.tenantId,
      hash: parsedDesc.hash,
      webViewLink: f.webViewLink,
    };
  });

  if (tenantFilter && tenantFilter !== 'all') {
    return items.filter((item) => !item.tenantId || item.tenantId === tenantFilter);
  }

  return items;
}

/**
 * Télécharge et décode le contenu d'un fichier de sauvegarde depuis Google Drive
 */
export async function downloadDriveBackup(
  token: string,
  fileId: string
): Promise<BackupPayload> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Échec téléchargement Google Drive (${res.status}): ${res.statusText}`);
  }

  const payload: BackupPayload = await res.json();

  if (!payload.data) {
    throw new Error('Format de fichier de sauvegarde invalide (section "data" manquante).');
  }

  // Vérification de l'intégrité SHA-256 si disponible
  if (payload.manifest?.hash) {
    const rawDataString = JSON.stringify(payload.data);
    const calculatedHash = await calculateSha256(rawDataString);
    if (calculatedHash !== payload.manifest.hash) {
      console.warn(
        `[GDRIVE RESTORE] Discordance de hash SHA-256 (Calculé: ${calculatedHash}, Manifeste: ${payload.manifest.hash}). Les données sont tout de même lisibles.`
      );
    }
  }

  return payload;
}

/**
 * Fusionne les données restaurées dans l'état DBState local de l'application
 */
export function mergeRestoredDataIntoDb(
  currentDb: DBState,
  restoredData: Partial<DBState>,
  targetTenantId?: string
): DBState {
  const isGlobal = !targetTenantId || targetTenantId === 'all';

  if (isGlobal) {
    return {
      ...currentDb,
      ...restoredData,
      // Garder les settings s'ils ne sont pas fournis
      globalSaaSSettings: restoredData.globalSaaSSettings || currentDb.globalSaaSSettings,
      pricingPlans: restoredData.pricingPlans || currentDb.pricingPlans,
      users: restoredData.users || currentDb.users,
    };
  }

  // Restauration ciblée pour une boutique spécifique
  const mergeCollection = <T extends { id: string; tenantId?: string }>(
    currentList: T[] | undefined,
    restoredList: T[] | undefined
  ): T[] => {
    const list = currentList || [];
    if (!restoredList || restoredList.length === 0) return list;
    const kept = list.filter((item) => item.tenantId !== targetTenantId);
    return [...kept, ...restoredList];
  };

  return {
    ...currentDb,
    tenants: currentDb.tenants.map((t) => {
      const restoredTenant = restoredData.tenants?.find((rt) => rt.id === t.id);
      return restoredTenant || t;
    }),
    products: mergeCollection(currentDb.products, restoredData.products),
    customers: mergeCollection(currentDb.customers, restoredData.customers),
    sales: mergeCollection(currentDb.sales, restoredData.sales),
    suppliers: mergeCollection(currentDb.suppliers, restoredData.suppliers),
    expenses: mergeCollection(currentDb.expenses, restoredData.expenses),
    loans: mergeCollection(currentDb.loans, restoredData.loans),
    warehouses: mergeCollection(currentDb.warehouses, restoredData.warehouses),
    transfers: mergeCollection(currentDb.transfers, restoredData.transfers),
    invoices: mergeCollection(currentDb.invoices, restoredData.invoices),
    deliveryOrders: mergeCollection(currentDb.deliveryOrders, restoredData.deliveryOrders),
    payments: mergeCollection(currentDb.payments, restoredData.payments),
    returns: mergeCollection(currentDb.returns, restoredData.returns),
    affiliates: mergeCollection(currentDb.affiliates, restoredData.affiliates),
    commissionRules: mergeCollection(currentDb.commissionRules, restoredData.commissionRules),
    commissionLedger: mergeCollection(currentDb.commissionLedger, restoredData.commissionLedger),
    commissionPayments: mergeCollection(currentDb.commissionPayments, restoredData.commissionPayments),
    auditLogs: mergeCollection(currentDb.auditLogs, restoredData.auditLogs),
  };
}

