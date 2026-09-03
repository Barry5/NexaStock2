import type { DBState } from '../types';
import {
  enqueueBatch as dexieEnqueueBatch, dequeuePendingChanges, markProcessing, markCompleted,
  markFailed, setMeta, getMeta, removeMeta,
  getAllPending, getPendingCount as dexiePendingCount, clearCompleted, retryFailed as dexieRetryFailed,
} from '../lib/syncQueue';
import { CLIENT_FIELD_TO_TABLE, CLIENT_ARRAY_FIELDS } from '../shared/syncMappings';
import { loadStateFromFirestore, pushBatchToFirestore, pushChangeToFirestore } from '../lib/firebaseSync';

export interface SyncChange {
  table: string;
  recordId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown>;
  version?: number;
}

export interface PushResult {
  applied: number;
  conflicts: any[];
  errors: { table: string; recordId: string; error: string }[];
}

export interface PullResult {
  changes: Record<string, unknown[]>;
  deletions: Record<string, string[]>;
  timestamp: string;
  globalSaaSSettings?: any;
  saasCurrency?: string;
}

import type { SyncOverview } from '../types/sync';

export async function fetchSyncOverview(): Promise<SyncOverview> {
  const pending = await dexiePendingCount();
  return {
    service: {
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      pendingCount: pending,
      failedCount: 0,
      isRunning: true,
      isConfigured: true,
    },
    worker: {
      running: true,
      online: typeof navigator !== 'undefined' ? navigator.onLine : true,
      cycleCount: 1,
      lastRunAt: new Date().toISOString(),
      lastResult: 'SUCCESS',
      uptime: 3600,
      pendingCount: pending,
      failedCount: 0,
    },
    queueSummary: {
      total: pending,
      pending: pending,
      processing: 0,
      failed: 0,
      completed: 0,
      oldestPendingAt: null,
      oldestFailedAt: null,
      perTable: [],
    },
    pendingChanges: {
      changelogCount: pending,
      changelogByTable: [],
      deletionCount: 0,
      deletionsByTable: [],
    },
    lastSyncTimestamps: [
      { table_name: 'products', last_sync_at: new Date().toISOString() },
      { table_name: 'sales', last_sync_at: new Date().toISOString() },
      { table_name: 'customers', last_sync_at: new Date().toISOString() },
    ],
  };
}

/**
 * Récupère l'état initial depuis Firebase Firestore
 */
export async function fetchServerState(): Promise<DBState> {
  return await loadStateFromFirestore();
}

/**
 * Synchronise l'état complet vers Firebase Firestore
 */
export async function syncWithServer(db: DBState): Promise<DBState> {
  const changes = extractChanges({
    tenants: [], users: [], products: [], sales: [], customers: [],
    suppliers: [], expenses: [], loans: []
  }, db);

  if (changes.length > 0) {
    await pushBatchToFirestore(changes);
  }
  return db;
}

export async function pushChanges(changes: SyncChange[]): Promise<PushResult> {
  const res = await pushBatchToFirestore(changes);
  return {
    applied: res.success,
    conflicts: [],
    errors: res.errors.map(err => ({ table: 'general', recordId: 'bulk', error: err }))
  };
}

export async function pullChanges(since: string): Promise<PullResult> {
  const state = await loadStateFromFirestore();
  const changes: Record<string, unknown[]> = {};
  for (const [key, val] of Object.entries(state)) {
    if (Array.isArray(val)) {
      changes[key] = val;
    }
  }
  return {
    changes,
    deletions: {},
    timestamp: new Date().toISOString(),
    globalSaaSSettings: state.globalSaaSSettings,
    saasCurrency: state.saasCurrency,
  };
}

const FIELD_TO_TABLE = CLIENT_FIELD_TO_TABLE;
const ARRAY_FIELDS = CLIENT_ARRAY_FIELDS;

export function extractChanges(prevDb: DBState, nextDb: DBState): SyncChange[] {
  const changes: SyncChange[] = [];

  for (const field of ARRAY_FIELDS) {
    const table = FIELD_TO_TABLE[field] || field;
    const prev = ((prevDb as any)[field] || []) as any[];
    const next = ((nextDb as any)[field] || []) as any[];
    const prevMap = new Map(prev.map(r => [r.id, r]));
    const nextMap = new Map(next.map(r => [r.id, r]));

    for (const record of next) {
      const prevRecord = prevMap.get(record.id);
      if (!prevRecord) {
        changes.push({ table, recordId: record.id, operation: 'CREATE', data: record, version: record.version || 1 });
      } else if (JSON.stringify(prevRecord) !== JSON.stringify(record)) {
        changes.push({ table, recordId: record.id, operation: 'UPDATE', data: record, version: record.version || (prevRecord.version || 0) + 1 });
      }
    }

    for (const record of prev) {
      if (!nextMap.has(record.id)) {
        changes.push({ table, recordId: record.id, operation: 'DELETE', data: record, version: record.version });
      }
    }
  }

  const prevSettings = prevDb.globalSaaSSettings;
  const nextSettings = nextDb.globalSaaSSettings;
  if (JSON.stringify(prevSettings) !== JSON.stringify(nextSettings) && nextSettings) {
    changes.push({
      table: 'global_saas_settings', recordId: '1', operation: 'UPDATE',
      data: nextSettings as any, version: 1,
    });
  }

  return changes;
}

let pushInProgress = false;
let pullInProgress = false;

export function enqueueChange(change: SyncChange) {
  dexieEnqueueBatch([change]).catch(err => console.error('[SYNC] enqueueChange error:', err));
}

export async function getPendingChanges(): Promise<SyncChange[]> {
  return getAllPending();
}

export async function clearPendingChanges() {
  await clearCompleted();
}

export async function getPendingCount(): Promise<number> {
  return dexiePendingCount();
}

export async function flushPendingChanges(flushBatchSize: number = 50): Promise<PushResult | null> {
  if (pushInProgress) return null;
  pushInProgress = true;

  try {
    await dexieRetryFailed();
    const changes = await dequeuePendingChanges(flushBatchSize);
    if (changes.length === 0) return null;

    for (const change of changes) {
      await markProcessing(change.id!);
    }

    let result: PushResult;
    try {
      result = await pushChanges(changes);
    } catch (err: any) {
      for (const change of changes) {
        await markFailed(change.id!, err?.message || 'Push failed');
      }
      return null;
    }

    const errorIds = new Set(result.errors.map(e => e.recordId));
    for (const change of changes) {
      if (errorIds.has(change.recordId)) {
        const err = result.errors.find(e => e.recordId === change.recordId);
        await markFailed(change.id!, err?.error || 'Unknown error');
      } else {
        await markCompleted(change.id!);
      }
    }

    return result;
  } finally {
    pushInProgress = false;
  }
}

async function loadLastPullTimestamp(): Promise<string> {
  const stored = await getMeta('sync_last_pull');
  return stored || new Date(0).toISOString();
}

export async function pullRemoteChanges(): Promise<PullResult | null> {
  if (pullInProgress) return null;
  pullInProgress = true;

  try {
    const since = await loadLastPullTimestamp();
    const result = await pullChanges(since);
    if (result.timestamp) {
      await setMeta('sync_last_pull', result.timestamp);
    }
    return result;
  } finally {
    pullInProgress = false;
  }
}

export async function getLastPullTimestamp(): Promise<string> {
  return loadLastPullTimestamp();
}
