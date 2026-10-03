import type { AdminBackupRecord, CoherenceReport, CoherenceQuickStatus, RestoreReport } from '../types/backup';

// Client API de la Console Super Admin (Sauvegardes & Restauration, Cohérence).
//
// OPS-01 : l'ancien « mode autonome » fabriquait des sauvegardes « vérifiées » avec une empreinte
// aléatoire et renvoyait « restauration réussie » sans rien restaurer. Ces simulations sont
// supprimées : sans serveur de sauvegarde, chaque action échoue avec un message explicite.
// Sauvegardes réelles disponibles : export Google Drive (Paramètres) et exports Firestore
// planifiés côté projet Firebase (voir docs/PHASE1-2.md).

export function authHeader(): Record<string, string> {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('nexastock_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Réponse non-JSON reçue (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Requête échouée (${res.status})`);
  return data as T;
}

const LEGACY_FAKE_BACKUPS_KEY = 'nexastock_managed_backups';

export const BACKUP_SERVICE_UNAVAILABLE =
  "Service de sauvegarde serveur indisponible : aucune sauvegarde n'a été créée ni restaurée. Utilisez l'export Google Drive ou les exports Firestore planifiés.";

export class BackupServiceUnavailableError extends Error {
  constructor() {
    super(BACKUP_SERVICE_UNAVAILABLE);
    this.name = 'BackupServiceUnavailableError';
  }
}

// Purge des sauvegardes fictives enregistrées par les anciennes versions.
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_FAKE_BACKUPS_KEY);
} catch { /* ignore */ }

export async function listManagedBackups(): Promise<AdminBackupRecord[]> {
  try {
    const res = await fetch('/api/admin/backups/managed', { headers: authHeader() });
    const data = await handle<{ success: boolean; backups: AdminBackupRecord[] }>(res);
    if (Array.isArray(data?.backups)) return data.backups;
  } catch {
    // Aucun serveur : aucune sauvegarde gérée à afficher.
  }
  return [];
}

async function postBackup(path: string, label: string): Promise<AdminBackupRecord> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ label }),
    });
    const data = await handle<{ success: boolean; backup: AdminBackupRecord }>(res);
    if (data?.backup) return data.backup;
  } catch {
    // voir ci-dessous
  }
  throw new BackupServiceUnavailableError();
}

export async function createSqliteBackup(label = 'Sauvegarde SQLite manuelle'): Promise<AdminBackupRecord> {
  return postBackup('/api/admin/backups/sqlite', label);
}

export async function createSupabaseBackup(label = 'Sauvegarde Supabase manuelle'): Promise<AdminBackupRecord> {
  return postBackup('/api/admin/backups/supabase', label);
}

export async function verifyManagedBackup(id: string): Promise<{ ok: boolean; checksumMatch: boolean; integrity: string | null; message: string }> {
  try {
    const res = await fetch(`/api/admin/backups/managed/${id}/verify`, { method: 'POST', headers: authHeader() });
    return await handle<{ ok: boolean; checksumMatch: boolean; integrity: string | null; message: string }>(res);
  } catch {
    throw new BackupServiceUnavailableError();
  }
}

export async function deleteManagedBackup(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/admin/backups/managed/${id}`, { method: 'DELETE', headers: authHeader() });
    await handle(res);
  } catch {
    throw new BackupServiceUnavailableError();
  }
}

export function downloadBackupUrl(id: string): string {
  return `/api/admin/backups/managed/${id}/download`;
}

async function postRestore(path: string): Promise<RestoreReport> {
  try {
    const res = await fetch(path, { method: 'POST', headers: authHeader() });
    const data = await handle<{ success: boolean; report: RestoreReport }>(res);
    if (data?.report) return data.report;
  } catch {
    // voir ci-dessous
  }
  throw new BackupServiceUnavailableError();
}

export async function restoreSqlite(id: string): Promise<RestoreReport> {
  return postRestore(`/api/admin/restore/sqlite/${id}`);
}

export async function restoreSupabase(id: string): Promise<RestoreReport> {
  return postRestore(`/api/admin/restore/supabase/${id}`);
}

export async function runCoherenceCheck(deep = true): Promise<CoherenceReport> {
  try {
    const res = await fetch('/api/admin/coherence/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ deep }),
    });
    const data = await handle<{ success: boolean; report: CoherenceReport }>(res);
    if (data?.report) return data.report;
  } catch {
    // voir ci-dessous
  }
  throw new Error("Contrôle de cohérence indisponible : aucun serveur de contrôle n'est configuré. Aucun résultat n'est affiché plutôt qu'un résultat fictif.");
}

export async function coherenceQuickStatus(): Promise<CoherenceQuickStatus> {
  try {
    const res = await fetch('/api/admin/coherence/status', { headers: authHeader() });
    const data = await handle<{ success: boolean; status: CoherenceQuickStatus }>(res);
    if (data?.status) return data.status;
  } catch {
    // Aucun serveur : état inconnu (et non « tout est cohérent »).
  }
  return {
    generatedAt: new Date().toISOString(),
    supabaseReachable: false,
    checked: 0,
    coherent: 0,
    pending: 0,
    incoherent: 0,
    unknown: 0,
    pendingTotal: { changelog: 0, deletions: 0, deadLetters: 0, queueFailed: 0 },
    lastBackupSqlite: null,
    lastBackupSupabase: null,
  };
}
