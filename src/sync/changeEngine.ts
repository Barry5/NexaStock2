/**
 * Moteur de détection des changements (phases 1 et 2 de l'audit).
 *
 * Module PUR (aucune dépendance Firebase / React) : testable avec `node --test`.
 *
 * Différences avec l'ancien `extractChanges` (api/sync.ts) :
 *  - SYNC-05 : aucune suppression n'est déduite d'une absence dans le nouvel état.
 *    Les suppressions sont explicites (`buildSoftDelete`) et logiques (`deletedAt`).
 *  - SYNC-02 : les champs « compteurs » (stock, dette, points) sont envoyés sous forme
 *    d'incréments (delta) et non de valeurs absolues : deux caisses qui vendent le même
 *    article s'additionnent au lieu de s'écraser.
 *  - Les tableaux qui ne font que s'allonger (paiements, retours, remboursements) sont
 *    envoyés en `arrayUnion` : deux encaissements concurrents sont tous deux conservés.
 *  - Seuls les champs modifiés sont envoyés (et non le document entier).
 *  - Les champs gérés par le serveur et le champ `password` ne sont jamais envoyés.
 */

export type FieldOp =
  | { kind: 'set'; value: unknown }
  | { kind: 'increment'; by: number }
  | { kind: 'arrayUnion'; values: unknown[] }
  | { kind: 'serverTimestamp' };

export type ChangeOperation = 'CREATE' | 'UPDATE' | 'SOFT_DELETE';

export interface RecordChange {
  /** Champ du DBState client (ex. `products`, `transfers`). */
  table: string;
  recordId: string;
  operation: ChangeOperation;
  fields: Record<string, FieldOp>;
  /** Boutique propriétaire (null pour les données globales / super admin). */
  tenantId: string | null;
}

/** Champs numériques additifs : synchronisés par incrément. */
export const COUNTER_FIELDS: Record<string, readonly string[]> = {
  products: ['quantity'],
  variants: ['quantity', 'stock'],
  customers: ['outstandingDebt', 'loyaltyPoints'],
};

/** Champs jamais envoyés par le client (gérés par le serveur ou sensibles). */
export const SERVER_MANAGED_FIELDS = new Set([
  'updatedAt', 'updatedBy', 'version', 'deviceId', 'deletedAt', 'deletedBy', 'serverCreatedAt', 'lastOperationId',
]);
export const FORBIDDEN_FIELDS = new Set(['password']);

/** Collections dont les données ne sont pas rattachées à une boutique. */
export const GLOBAL_TABLES = new Set(['pricingPlans', 'moduleDefinitions', 'planModules', 'tenants', 'system']);

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || typeof a !== 'object') {
    // NaN === NaN
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter(k => ao[k] !== undefined);
  const bk = Object.keys(bo).filter(k => bo[k] !== undefined);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

function isAppendOnly(prev: unknown[], next: unknown[]): boolean {
  if (next.length <= prev.length) return false;
  for (let i = 0; i < prev.length; i++) if (!deepEqual(prev[i], next[i])) return false;
  return true;
}

function isSyncableField(key: string): boolean {
  return !SERVER_MANAGED_FIELDS.has(key) && !FORBIDDEN_FIELDS.has(key);
}

function resolveTenantId(table: string, record: Record<string, unknown>, fallbackTenantId: string | null): string | null {
  if (GLOBAL_TABLES.has(table)) return table === 'tenants' ? String(record.id ?? '') || null : null;
  const own = record.tenantId;
  if (typeof own === 'string' && own.length > 0) return own;
  return fallbackTenantId;
}

/**
 * Compare deux versions d'un enregistrement. Retourne null si rien n'a changé.
 * `prev` absent => CREATE (tous les champs en `set`).
 */
export function diffRecord(
  table: string,
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
  fallbackTenantId: string | null,
): RecordChange | null {
  const recordId = String(next.id ?? '');
  if (!recordId) return null;
  const tenantId = resolveTenantId(table, next, fallbackTenantId);

  if (!prev) {
    const fields: Record<string, FieldOp> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || !isSyncableField(k)) continue;
      fields[k] = { kind: 'set', value: v };
    }
    if (!GLOBAL_TABLES.has(table) && tenantId && fields.tenantId === undefined) {
      fields.tenantId = { kind: 'set', value: tenantId };
    }
    return { table, recordId, operation: 'CREATE', fields, tenantId };
  }

  const counters = COUNTER_FIELDS[table] || [];
  const fields: Record<string, FieldOp> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (!isSyncableField(key)) continue;
    const before = prev[key];
    const after = next[key];
    if (deepEqual(before, after)) continue;

    if (counters.includes(key) && typeof before === 'number' && typeof after === 'number') {
      const by = after - before;
      if (by !== 0) fields[key] = { kind: 'increment', by };
      continue;
    }
    if (Array.isArray(before) && Array.isArray(after) && before.length > 0 && isAppendOnly(before, after)) {
      fields[key] = { kind: 'arrayUnion', values: after.slice(before.length) };
      continue;
    }
    // Champ supprimé côté client : on le met à null (Firestore n'accepte pas undefined).
    fields[key] = { kind: 'set', value: after === undefined ? null : after };
  }
  if (Object.keys(fields).length === 0) return null;
  // Toujours porter la boutique : les règles exigent tenantId == boutique de l'utilisateur.
  if (!GLOBAL_TABLES.has(table) && tenantId && !fields.tenantId) {
    fields.tenantId = { kind: 'set', value: tenantId };
  }
  return { table, recordId, operation: 'UPDATE', fields, tenantId };
}

type AnyState = Record<string, unknown>;

/**
 * Détecte créations et modifications entre l'état affiché (`prevState`) et l'état
 * proposé par un écran (`nextState`). Les enregistrements absents de `nextState`
 * sont ignorés : ils ne sont JAMAIS interprétés comme supprimés (SYNC-05).
 */
export function extractRecordChanges(
  prevState: AnyState,
  nextState: AnyState,
  tables: readonly string[],
  fallbackTenantId: string | null,
  /**
   * Retourne vrai pour un objet qui a déjà figuré, tel quel, dans un état antérieur.
   * Un tel objet n'a pas été modifié par l'écran : on ne le compare pas à la version
   * courante (sinon un état construit sur un instantané périmé réécrirait des valeurs
   * reçues d'autres postes entre-temps).
   */
  isKnownRecord: (record: object) => boolean = () => false,
): RecordChange[] {
  const changes: RecordChange[] = [];
  for (const table of tables) {
    const prevList = prevState[table];
    const nextList = nextState[table];
    if (!Array.isArray(nextList) || nextList === prevList) continue;
    const prevMap = new Map<string, Record<string, unknown>>();
    if (Array.isArray(prevList)) {
      for (const r of prevList as Record<string, unknown>[]) {
        if (r && r.id != null) prevMap.set(String(r.id), r);
      }
    }
    for (const rec of nextList as Record<string, unknown>[]) {
      if (!rec || rec.id == null) continue;
      const before = prevMap.get(String(rec.id));
      if (before === rec) continue; // même objet : inchangé
      // Objet d'un état antérieur, non modifié par l'écran (y compris un enregistrement supprimé
      // depuis) : jamais renvoyé, ce qui évite de réécrire ou de recréer des données périmées.
      if (isKnownRecord(rec)) continue;
      const change = diffRecord(table, before, rec, fallbackTenantId);
      if (change) changes.push(change);
    }
  }
  return changes;
}

/** Suppression logique explicite (SYNC-01 / SYNC-11). */
export function buildSoftDelete(table: string, recordId: string, tenantId: string | null): RecordChange {
  return {
    table,
    recordId,
    operation: 'SOFT_DELETE',
    fields: { deletedAt: { kind: 'serverTimestamp' } },
    tenantId,
  };
}

export function changeHasIncrement(change: RecordChange): boolean {
  return Object.values(change.fields).some(op => op.kind === 'increment');
}

/** Applique un changement à un enregistrement local (mise à jour optimiste). */
export function applyFieldOps(record: Record<string, unknown> | undefined, change: RecordChange, nowIso: string): Record<string, unknown> {
  const base: Record<string, unknown> = record ? { ...record } : { id: change.recordId };
  for (const [key, op] of Object.entries(change.fields)) {
    switch (op.kind) {
      case 'set':
        base[key] = op.value;
        break;
      case 'increment': {
        const current = typeof base[key] === 'number' ? (base[key] as number) : 0;
        base[key] = current + op.by;
        break;
      }
      case 'arrayUnion': {
        const current = Array.isArray(base[key]) ? (base[key] as unknown[]) : [];
        const additions = op.values.filter(v => !current.some(c => deepEqual(c, v)));
        base[key] = [...current, ...additions];
        break;
      }
      case 'serverTimestamp':
        base[key] = nowIso;
        break;
    }
  }
  return base;
}

/**
 * Applique une liste de changements à l'état courant SANS remplacer l'état entier :
 * les mises à jour reçues d'autres postes entre-temps sont conservées (SYNC-05 / SYNC-06).
 */
export function applyChangesToState<S extends object>(state: S, changes: RecordChange[], nowIso: string): S {
  if (changes.length === 0) return state;
  const next: AnyState = { ...(state as AnyState) };
  const touched = new Map<string, Record<string, unknown>[]>();
  for (const change of changes) {
    let list = touched.get(change.table);
    if (!list) {
      list = Array.isArray(next[change.table]) ? [...(next[change.table] as Record<string, unknown>[])] : [];
      touched.set(change.table, list);
    }
    const idx = list.findIndex(r => r && String(r.id) === change.recordId);
    if (change.operation === 'SOFT_DELETE') {
      if (idx >= 0) list.splice(idx, 1);
      continue;
    }
    const updated = applyFieldOps(idx >= 0 ? list[idx] : undefined, change, nowIso);
    if (idx >= 0) list[idx] = updated;
    else list.push(updated);
  }
  for (const [table, list] of touched) next[table] = list;
  return next as S;
}

/**
 * Sérialisation JSON sûre pour la file locale (IndexedDB).
 */
export function serializeChange(change: RecordChange): string {
  return JSON.stringify(change);
}

export function deserializeChange(raw: string): RecordChange {
  return JSON.parse(raw) as RecordChange;
}
