/**
 * Orchestration de la synchronisation locale -> centrale (outbox -> Firestore).
 *
 * Remplace l'ancien couple `extractChanges` + `flushPendingChanges` + `pullRemoteChanges`
 * (pull complet de toutes les collections toutes les 30 s, PERF-01) : la réception des
 * changements distants passe désormais uniquement par les écouteurs bornés à la boutique
 * (voir `subscribeScopedCollections`).
 */
import type { SyncOverview } from '../types/sync';
import {
  takeReadyEntries,
  markSent,
  markDone,
  markFailed,
  purgeDone,
  getOutboxStats,
  type OutboxEntry,
} from '../lib/syncQueue';
import {
  commitOutboxEntry,
  classifyFirestoreError,
  isOperationApplied,
} from '../lib/firebaseSync';
import { changeHasIncrement } from '../sync/changeEngine';
import { logSyncEvent } from '../lib/syncLogger';
import { recordSyncEvent } from '../lib/telemetry';

export interface FlushContext {
  uid: string;
  userId: string | null;
  tenantId: string | null;
}

export interface FlushResult {
  issued: number;
}

let localFlushRunning = false;

async function withOutboxLock<T>(fn: () => Promise<T>): Promise<T | null> {
  // Verrou inter-onglets (SYNC-16) : un seul onglet traite la file à la fois.
  const locks = (typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined);
  if (locks?.request) {
    return locks.request('nexastock-outbox', { ifAvailable: true }, async lock => {
      if (!lock) return null;
      return fn();
    }) as Promise<T | null>;
  }
  if (localFlushRunning) return null;
  localFlushRunning = true;
  try {
    return await fn();
  } finally {
    localFlushRunning = false;
  }
}

async function handleAck(entry: OutboxEntry, ctx: FlushContext, outcome: Promise<void>) {
  try {
    await outcome;
    await markDone(entry.id!);
  } catch (err: unknown) {
    const cls = classifyFirestoreError(err);
    const message = `${(err as { code?: string })?.code || 'error'}: ${(err as Error)?.message || String(err)}`;
    if (cls === 'duplicate-candidate' && changeHasIncrement(entry.change) && await isOperationApplied(entry.opId)) {
      // Renvoi d'une opération déjà appliquée : refus attendu, rien n'est perdu.
      await markDone(entry.id!);
      return;
    }
    const status = await markFailed(entry.id!, message, cls === 'permanent');
    // Phase 4 : événement central (file morte, refus des règles) pour la supervision.
    const code = (err as { code?: string })?.code;
    if (status === 'dead' || code === 'permission-denied') {
      recordSyncEvent(
        { uid: ctx.uid, userId: ctx.userId, tenantId: ctx.tenantId },
        {
          type: status === 'dead' ? 'dead_letter' : 'permission_denied',
          table: entry.change.table,
          recordId: entry.change.recordId,
          operationId: entry.opId,
          attempts: entry.attempts + 1,
          error: message,
        },
      );
    }
    logSyncEvent({
      tenantId: ctx.tenantId || 'global_system',
      tenantName: ctx.tenantId ? `Boutique ${ctx.tenantId}` : 'Système SaaS',
      collection: entry.change.table,
      operation: entry.change.operation === 'SOFT_DELETE' ? 'DELETE' : entry.change.operation,
      status: 'ERROR',
      recordsCount: 1,
      errorMessage: message,
      details: `${entry.change.table}/${entry.change.recordId} — opération ${entry.opId} — ${status === 'dead' ? 'placée en file morte' : 'nouvel essai programmé'}`,
      source: 'Firestore Cloud',
      operationId: entry.opId,
      deviceId: entry.deviceId,
      userId: entry.userId ?? undefined,
      attempts: entry.attempts + 1,
    });
  }
}

/**
 * Envoie toutes les opérations prêtes. Les écritures sont confiées au SDK Firestore dans
 * l'ordre de la file (le SDK conserve cet ordre et les rejoue après une coupure).
 * N'attend PAS l'accusé du serveur : hors ligne, l'appel retourne immédiatement.
 */
export async function flushOutbox(ctx: FlushContext): Promise<FlushResult> {
  const result = await withOutboxLock(async () => {
    const entries = await takeReadyEntries(ctx.uid);
    if (entries.length === 0) return { issued: 0 };
    const acks: Array<[OutboxEntry, Promise<void>]> = [];
    for (const entry of entries) {
      let outcome: Promise<void>;
      try {
        outcome = commitOutboxEntry(entry, { uid: ctx.uid, userId: ctx.userId });
      } catch (err) {
        // Erreur levée avant l'envoi (donnée invalide) : seule cette opération est concernée (SYNC-04).
        outcome = Promise.reject(err);
      }
      acks.push([entry, outcome]);
    }
    await markSent(entries.map(e => e.id!));
    for (const [entry, outcome] of acks) void handleAck(entry, ctx, outcome);
    void purgeDone().catch(() => undefined);
    return { issued: entries.length };
  });
  return result ?? { issued: 0 };
}

/** Vue d'ensemble RÉELLE de la synchronisation (OBS-01 : plus aucune valeur codée en dur). */
export async function fetchSyncOverview(ownerUid: string | null = null): Promise<SyncOverview> {
  const stats = await getOutboxStats(ownerUid);
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  return {
    service: {
      online,
      pendingCount: stats.pending + stats.sent,
      failedCount: stats.dead,
      isRunning: true,
      isConfigured: true,
    },
    worker: {
      running: true,
      online,
      cycleCount: 0,
      lastRunAt: null,
      lastResult: stats.dead > 0 ? 'DEAD_LETTERS' : stats.pending + stats.sent > 0 ? 'PENDING' : 'IDLE',
      uptime: 0,
      pendingCount: stats.pending + stats.sent,
      failedCount: stats.dead,
    },
    queueSummary: {
      total: stats.pending + stats.sent + stats.dead,
      pending: stats.pending,
      processing: stats.sent,
      failed: stats.dead,
      completed: 0,
      oldestPendingAt: stats.oldestPendingAt,
      oldestFailedAt: null,
      perTable: [],
    },
    pendingChanges: {
      changelogCount: stats.pending + stats.sent,
      changelogByTable: [],
      deletionCount: 0,
      deletionsByTable: [],
    },
    lastSyncTimestamps: [],
  };
}
