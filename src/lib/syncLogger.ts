/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SyncLogEntry {
  id: string;
  timestamp: string; // ISO string
  tenantId: string; // tenant ID or 'global_system'
  tenantName: string;
  collection: string; // e.g. 'pricingPlans', 'system/globalSaaSSettings', 'products', 'sales'
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'BATCH' | 'PULL' | 'PUSH' | 'REALTIME' | 'CONNECT';
  status: 'SUCCESS' | 'ERROR' | 'PENDING' | 'IN_PROGRESS';
  recordsCount: number;
  durationMs?: number;
  errorMessage?: string;
  details?: string;
  source: 'Firestore Cloud' | 'Dexie Cache';
  /** Traçabilité (OBS-01) : opération, poste, auteur, nombre d'essais. */
  operationId?: string;
  deviceId?: string;
  userId?: string;
  attempts?: number;
}

export interface TenantSyncStatus {
  tenantId: string;
  tenantName: string;
  connectionStatus: 'ONLINE' | 'SYNCING' | 'OFFLINE' | 'ERROR';
  lastSyncAt: string | null;
  syncedCollectionsCount: number;
  totalRecords: number;
  pendingCount: number;
  errorCount: number;
  lastErrorMessage?: string;
  firestoreListenerActive: boolean;
}

const STORAGE_KEY = 'nexastock_sync_logs';
const MAX_LOGS = 200;

// In-memory logs store
let logs: SyncLogEntry[] = [];
const subscribers = new Set<(logs: SyncLogEntry[]) => void>();

// Journal local réel uniquement : plus aucune entrée fabriquée au démarrage (OBS-01).
function initializeInitialLogs(): SyncLogEntry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Purge des entrées de démonstration créées par les anciennes versions.
        return parsed.filter((l: SyncLogEntry) => !/^log-\d+$/.test(l.id));
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return [];
}

logs = initializeInitialLogs();

function notifySubscribers() {
  subscribers.forEach(cb => {
    try { cb([...logs]); } catch { /* ignore */ }
  });
}

function persistLogs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
  } catch {
    // Storage quota or disabled
  }
}

/**
 * Enregistre un événement de synchronisation Firestore
 */
export function logSyncEvent(entry: Omit<SyncLogEntry, 'id' | 'timestamp'> & { timestamp?: string }): SyncLogEntry {
  const newLog: SyncLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: entry.timestamp || new Date().toISOString(),
    ...entry,
  };

  logs = [newLog, ...logs].slice(0, MAX_LOGS);
  persistLogs();
  notifySubscribers();
  return newLog;
}

/**
 * Récupère l'ensemble des logs
 */
export function getSyncLogs(): SyncLogEntry[] {
  return [...logs];
}

/**
 * Souscription en temps réel aux logs
 */
export function subscribeToSyncLogs(callback: (logs: SyncLogEntry[]) => void): () => void {
  subscribers.add(callback);
  callback([...logs]);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Purge les logs
 */
export function clearSyncLogs(): void {
  logs = [];
  persistLogs();
  notifySubscribers();
}

/**
 * Calcule l'état de synchronisation par tenant
 */
export function computeTenantSyncStatuses(
  tenants: Array<{ id: string; name: string }>,
  isOnline: boolean,
  isSyncing: boolean,
  dbRecordsPerTenant?: Record<string, number>
): TenantSyncStatus[] {
  return tenants.map(t => {
    const tenantLogs = logs.filter(l => l.tenantId === t.id);
    const hasError = tenantLogs.some(l => l.status === 'ERROR');
    const lastSuccessLog = tenantLogs.find(l => l.status === 'SUCCESS');
    const lastErrorLog = tenantLogs.find(l => l.status === 'ERROR');

    let connectionStatus: 'ONLINE' | 'SYNCING' | 'OFFLINE' | 'ERROR' = 'ONLINE';
    if (!isOnline) {
      connectionStatus = 'OFFLINE';
    } else if (isSyncing) {
      connectionStatus = 'SYNCING';
    } else if (hasError && lastErrorLog && (!lastSuccessLog || new Date(lastErrorLog.timestamp) > new Date(lastSuccessLog.timestamp))) {
      connectionStatus = 'ERROR';
    }

    return {
      tenantId: t.id,
      tenantName: t.name,
      connectionStatus,
      lastSyncAt: lastSuccessLog ? lastSuccessLog.timestamp : null,
      syncedCollectionsCount: 0,
      totalRecords: dbRecordsPerTenant ? (dbRecordsPerTenant[t.id] || 0) : 0,
      pendingCount: tenantLogs.filter(l => l.status === 'PENDING').length,
      errorCount: tenantLogs.filter(l => l.status === 'ERROR').length,
      lastErrorMessage: lastErrorLog?.errorMessage,
      firestoreListenerActive: isOnline
    };
  });
}
