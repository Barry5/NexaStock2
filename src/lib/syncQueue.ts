/**
 * Outbox locale (IndexedDB / Dexie) — version 2.
 *
 * Corrige SYNC-03, SYNC-04, SYNC-10, SYNC-13, SYNC-15, SYNC-16 :
 *  - une opération envoyée (`sent`) mais non acquittée est remise en `pending` au démarrage ;
 *  - chaque opération part dans son propre lot : un document invalide ne bloque plus les autres ;
 *  - erreurs permanentes => file morte (`dead`) visible, au lieu d'un abandon silencieux ;
 *  - backoff exponentiel entre deux essais ;
 *  - ordre garanti par enregistrement : une opération n'est pas envoyée tant qu'une
 *    opération plus ancienne sur le même enregistrement attend un nouvel essai ;
 *  - purge des opérations acquittées après 24 h.
 *
 * Les anciennes entrées (version 1, table `pending`) sont converties à l'ouverture.
 */
import Dexie, { type Table } from 'dexie';
import type { RecordChange } from '../sync/changeEngine';
import { TABLE_TO_CLIENT_FIELD } from '../shared/syncMappings';
import { uuid } from './ids';

export type OutboxStatus = 'pending' | 'sent' | 'done' | 'dead';

export interface OutboxEntry {
  id?: number;
  /** Identifiant d'opération (clé d'idempotence côté serveur). */
  opId: string;
  /** Compte Auth propriétaire ; null pour les entrées héritées non encore réclamées. */
  ownerUid: string | null;
  recordKey: string;
  change: RecordChange;
  status: OutboxStatus;
  attempts: number;
  createdAt: string;
  nextAttemptAt: number;
  sentAt: string | null;
  ackAt: string | null;
  lastError: string | null;
  deviceId: string;
  userId: string | null;
}

/** Ancien format (version 1). */
interface LegacyPendingChange {
  id?: number;
  table: string;
  recordId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data: Record<string, unknown>;
  status: string;
  retryCount: number;
  createdAt: string;
}

export interface SyncMeta {
  key: string;
  value: string;
}

const DB_NAME = 'nexastock_sync';
const MAX_ATTEMPTS = 6;
const DONE_RETENTION_MS = 24 * 3600 * 1000;

export function recordKeyOf(change: Pick<RecordChange, 'table' | 'recordId'>): string {
  return `${change.table}/${change.recordId}`;
}

function legacyToChange(item: LegacyPendingChange): RecordChange | null {
  if (!item || !item.recordId) return null;
  const table = TABLE_TO_CLIENT_FIELD[item.table] || item.table;
  const tenantId = typeof item.data?.tenantId === 'string' ? (item.data.tenantId as string) : null;
  if (item.operation === 'DELETE') {
    return { table, recordId: item.recordId, operation: 'SOFT_DELETE', fields: { deletedAt: { kind: 'serverTimestamp' } }, tenantId };
  }
  const fields: RecordChange['fields'] = {};
  for (const [k, v] of Object.entries(item.data || {})) {
    if (v === undefined || k === 'password' || k === 'updatedAt' || k === 'version') continue;
    fields[k] = { kind: 'set', value: v };
  }
  return { table, recordId: item.recordId, operation: item.operation, fields, tenantId };
}

class NexaStockSyncDB extends Dexie {
  pending!: Table<LegacyPendingChange, number>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<SyncMeta, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      pending: '++id, table, operation, status, createdAt',
      meta: 'key',
    });
    this.version(2)
      .stores({
        pending: '++id, table, operation, status, createdAt',
        outbox: '++id, status, ownerUid, recordKey, createdAt, opId',
        meta: 'key',
      })
      .upgrade(async tx => {
        // Migration des opérations de l'ancienne file : rien de ce qui n'a pas été acquitté n'est perdu.
        const legacy = (await tx.table('pending').toArray()) as LegacyPendingChange[];
        const now = Date.now();
        const converted: OutboxEntry[] = [];
        for (const item of legacy) {
          if (item.status === 'completed') continue;
          const change = legacyToChange(item);
          if (!change) continue;
          converted.push({
            opId: uuid(),
            ownerUid: null,
            recordKey: recordKeyOf(change),
            change,
            status: 'pending',
            attempts: 0,
            createdAt: item.createdAt || new Date(now).toISOString(),
            nextAttemptAt: now,
            sentAt: null,
            ackAt: null,
            lastError: null,
            deviceId: 'legacy',
            userId: null,
          });
        }
        if (converted.length) await tx.table('outbox').bulkAdd(converted);
        await tx.table('pending').clear();
      });
  }
}

let db: NexaStockSyncDB | null = null;

function getDb(): NexaStockSyncDB {
  if (!db) db = new NexaStockSyncDB();
  return db;
}

export async function enqueueChanges(
  changes: RecordChange[],
  ctx: { ownerUid: string; deviceId: string; userId: string | null },
): Promise<OutboxEntry[]> {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const entries: OutboxEntry[] = changes.map(change => ({
    opId: uuid(),
    ownerUid: ctx.ownerUid,
    recordKey: recordKeyOf(change),
    change,
    status: 'pending',
    attempts: 0,
    createdAt: iso,
    nextAttemptAt: now,
    sentAt: null,
    ackAt: null,
    lastError: null,
    deviceId: ctx.deviceId,
    userId: ctx.userId,
  }));
  if (entries.length === 0) return entries;
  const ids = await getDb().outbox.bulkAdd(entries, { allKeys: true });
  entries.forEach((e, i) => { e.id = ids[i] as number; });
  return entries;
}

/**
 * Au démarrage : les opérations envoyées lors d'une session précédente sans accusé
 * de réception sont remises en attente (renvoi idempotent). Les entrées héritées sans
 * propriétaire sont rattachées au compte connecté.
 */
export async function recoverOutbox(ownerUid: string): Promise<number> {
  const table = getDb().outbox;
  let recovered = 0;
  await getDb().transaction('rw', table, async () => {
    const stale = await table.where('status').equals('sent').toArray();
    for (const e of stale) {
      if (e.ownerUid && e.ownerUid !== ownerUid) continue;
      await table.update(e.id!, { status: 'pending', nextAttemptAt: Date.now() });
      recovered++;
    }
    const orphans = await table.where('status').equals('pending').filter(e => e.ownerUid === null).toArray();
    for (const e of orphans) await table.update(e.id!, { ownerUid });
  });
  return recovered;
}

/** Opérations prêtes à partir, dans l'ordre de création, en respectant l'ordre par enregistrement. */
export async function takeReadyEntries(ownerUid: string, limit = 200): Promise<OutboxEntry[]> {
  const now = Date.now();
  const pending = await getDb().outbox
    .where('status').equals('pending')
    .filter(e => e.ownerUid === ownerUid)
    .sortBy('id');
  const blocked = new Set<string>();
  const ready: OutboxEntry[] = [];
  for (const e of pending) {
    if (blocked.has(e.recordKey)) continue;
    if (e.nextAttemptAt > now) {
      // Une opération plus ancienne sur cet enregistrement attend : on bloque les suivantes (SYNC-10).
      blocked.add(e.recordKey);
      continue;
    }
    ready.push(e);
    if (ready.length >= limit) break;
  }
  return ready;
}

export async function markSent(ids: number[]): Promise<void> {
  const iso = new Date().toISOString();
  await getDb().outbox.where('id').anyOf(ids).modify({ status: 'sent', sentAt: iso });
}

export async function markDone(id: number): Promise<void> {
  await getDb().outbox.update(id, { status: 'done', ackAt: new Date().toISOString(), lastError: null });
}

/** Erreur : nouvel essai avec backoff exponentiel, ou file morte si permanente / trop d'essais. */
export async function markFailed(id: number, error: string, permanent: boolean): Promise<OutboxStatus> {
  const entry = await getDb().outbox.get(id);
  if (!entry) return 'dead';
  const attempts = entry.attempts + 1;
  const dead = permanent || attempts >= MAX_ATTEMPTS;
  const delay = Math.min(5 * 60_000, 2000 * 2 ** (attempts - 1)) + Math.floor(Math.random() * 1000);
  await getDb().outbox.update(id, {
    status: dead ? 'dead' : 'pending',
    attempts,
    lastError: error,
    nextAttemptAt: Date.now() + delay,
  });
  return dead ? 'dead' : 'pending';
}

/** Rejoue une opération de la file morte (action manuelle depuis l'interface). */
export async function retryDead(id: number): Promise<void> {
  await getDb().outbox.update(id, { status: 'pending', attempts: 0, nextAttemptAt: Date.now() });
}

/** Abandon explicite d'une opération de la file morte (action manuelle, tracée). */
export async function discardDead(id: number): Promise<void> {
  await getDb().outbox.delete(id);
}

export async function purgeDone(): Promise<void> {
  const limit = new Date(Date.now() - DONE_RETENTION_MS).toISOString();
  await getDb().outbox.where('status').equals('done').filter(e => (e.ackAt || '') < limit).delete();
}

export interface OutboxStats {
  pending: number;
  sent: number;
  dead: number;
  oldestPendingAt: string | null;
  oldestSentAt: string | null;
  /** Phase 4 : dernier accusé de réception et délai moyen d'accusé (24 h). */
  lastAckAt: string | null;
  avgAckMs: number | null;
}

export async function getOutboxStats(ownerUid: string | null): Promise<OutboxStats> {
  const all = await getDb().outbox.where('status').anyOf(['pending', 'sent', 'dead']).toArray();
  const mine = all.filter(e => !ownerUid || e.ownerUid === ownerUid || e.ownerUid === null);
  const done = (await getDb().outbox.where('status').equals('done').toArray())
    .filter(e => (!ownerUid || e.ownerUid === ownerUid) && e.ackAt && e.sentAt);
  const latencies = done.map(e => Date.parse(e.ackAt!) - Date.parse(e.sentAt!)).filter(ms => Number.isFinite(ms) && ms >= 0);
  const lastAckAt = done.reduce<string | null>((acc, e) => (!acc || (e.ackAt || '') > acc ? e.ackAt : acc), null);
  const pending = mine.filter(e => e.status === 'pending');
  const sent = mine.filter(e => e.status === 'sent');
  const oldest = (list: OutboxEntry[]) => list.reduce<string | null>((acc, e) => (!acc || e.createdAt < acc ? e.createdAt : acc), null);
  return {
    pending: pending.length,
    sent: sent.length,
    dead: mine.filter(e => e.status === 'dead').length,
    oldestPendingAt: oldest(pending),
    oldestSentAt: sent.reduce<string | null>((acc, e) => (!acc || (e.sentAt || '') < acc ? e.sentAt : acc), null),
    lastAckAt,
    avgAckMs: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
  };
}

export async function getDeadEntries(ownerUid: string | null): Promise<OutboxEntry[]> {
  const dead = await getDb().outbox.where('status').equals('dead').toArray();
  return dead.filter(e => !ownerUid || e.ownerUid === ownerUid || e.ownerUid === null);
}

/** Nombre d'opérations non acquittées (pending + sent + dead), utilisé avant une déconnexion. */
export async function getUnsyncedCount(ownerUid: string | null): Promise<number> {
  const s = await getOutboxStats(ownerUid);
  return s.pending + s.sent + s.dead;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await getDb().meta.put({ key, value });
}

export async function getMeta(key: string): Promise<string | null> {
  const entry = await getDb().meta.get(key);
  return entry?.value ?? null;
}

export async function removeMeta(key: string): Promise<void> {
  await getDb().meta.delete(key);
}
