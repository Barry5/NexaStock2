/**
 * Accès Firestore : écouteurs bornés à la boutique et envoi des opérations de l'outbox.
 *
 * Phase 1 / 2 de l'audit :
 *  - plus aucun chargement de « toutes les collections de toutes les boutiques » (PERF-01) :
 *    un utilisateur de boutique n'écoute que ses documents (`where('tenantId', '==', …)`),
 *    ce qu'imposent aussi les règles Firestore (SEC-01) ;
 *  - plus de création de comptes / boutiques par défaut, ni d'identifiants codés en dur (SEC-03) ;
 *  - chaque opération est écrite dans son propre lot, champ par champ (`mergeFields`),
 *    avec `serverTimestamp()`, `version` incrémentée, auteur et poste (traçabilité) ;
 *  - les opérations contenant des incréments créent `operations/{opId}` dans le même lot :
 *    un renvoi est refusé par les règles, l'incrément n'est donc jamais appliqué deux fois ;
 *  - chaque variation de stock produit un mouvement `stockMovements/{opId}` (journal append-only).
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  Timestamp,
  FieldPath,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import type { GlobalSaaSSettings, PricingPlan } from '../types';
import { logSyncEvent } from './syncLogger';
import { CLIENT_ARRAY_FIELDS } from '../shared/syncMappings';
import { changeHasIncrement, type FieldOp, type RecordChange } from '../sync/changeEngine';
import type { OutboxEntry } from './syncQueue';

// Normalisation des noms de tables SQL/client vers les collections Firestore cibles
export function normalizeFirestoreCollection(table: string): { collectionName: string; docId?: string; isSystemDoc?: boolean } {
  if (table === 'global_saas_settings' || table === 'globalSaaSSettings' || table === 'saas_settings' || table === 'system') {
    return { collectionName: 'system', docId: 'globalSaaSSettings', isSystemDoc: true };
  }
  if (table === 'pricing_plans' || table === 'pricingPlans') return { collectionName: 'pricingPlans' };
  if (table === 'stock_transfers' || table === 'transfers') return { collectionName: 'transfers' };
  if (table === 'audit_logs' || table === 'auditLogs') return { collectionName: 'auditLogs' };
  if (table === 'subscription_invoices' || table === 'subscriptionInvoices') return { collectionName: 'subscriptionInvoices' };
  if (table === 'product_variants' || table === 'variants') return { collectionName: 'variants' };
  if (table === 'subscription_payments' || table === 'subscriptionPayments') return { collectionName: 'subscriptionPayments' };
  if (table === 'delivery_orders' || table === 'deliveryOrders') return { collectionName: 'deliveryOrders' };
  if (table === 'invoice_audit_log' || table === 'invoice_audit_logs' || table === 'invoiceAuditLogs') return { collectionName: 'invoiceAuditLogs' };
  if (table === 'delivery_note_audit' || table === 'deliveryNoteAudit') return { collectionName: 'deliveryNoteAudit' };
  if (table === 'commission_rules' || table === 'commissionRules') return { collectionName: 'commissionRules' };
  if (table === 'commission_ledger' || table === 'commissionLedger') return { collectionName: 'commissionLedger' };
  if (table === 'commission_payments' || table === 'commissionPayments') return { collectionName: 'commissionPayments' };
  if (table === 'commission_audit' || table === 'commissionAudit') return { collectionName: 'commissionAudit' };
  if (table === 'module_definitions' || table === 'moduleDefinitions') return { collectionName: 'moduleDefinitions' };
  if (table === 'plan_modules' || table === 'planModules') return { collectionName: 'planModules' };
  if (table === 'tenant_modules' || table === 'tenantModules') return { collectionName: 'tenantModules' };
  return { collectionName: table };
}

/** Champs du DBState synchronisés avec une collection Firestore du même nom. */
export const SYNCED_FIELDS: readonly string[] = CLIENT_ARRAY_FIELDS;

/** Collections lisibles par tout utilisateur connecté (catalogue SaaS). */
const GLOBAL_COLLECTIONS = new Set(['pricingPlans', 'moduleDefinitions', 'planModules']);

export interface SyncScope {
  uid: string;
  userId: string;
  tenantId: string | null;
  isSuperAdmin: boolean;
}

export interface FirestoreSyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

/** Convertit récursivement les Timestamp Firestore en chaînes ISO (état client sérialisable). */
export function normalizeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = normalizeFirestoreValue(v);
    return out;
  }
  return value;
}

function mapDoc(id: string, data: DocumentData): Record<string, unknown> {
  return { ...(normalizeFirestoreValue(data) as Record<string, unknown>), id };
}

export interface CollectionSnapshot {
  field: string;
  records: Record<string, unknown>[];
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface SubscriptionHandlers {
  onCollection: (snap: CollectionSnapshot) => void;
  onSettings: (settings: GlobalSaaSSettings & { saasCurrency?: string; currency?: string }) => void;
  onError: (field: string, error: { code?: string; message?: string }) => void;
}

/**
 * Abonne l'application aux collections de SA boutique (ou à tout, pour le super admin).
 * Le premier instantané vient du cache persistant (démarrage hors ligne), puis du serveur.
 */
export function subscribeScopedCollections(scope: SyncScope, handlers: SubscriptionHandlers): () => void {
  const unsubscribers: Unsubscribe[] = [];

  const emit = (field: string, docs: { id: string; data: () => DocumentData }[], fromCache: boolean, hasPendingWrites: boolean) => {
    const records = docs
      .map(d => mapDoc(d.id, d.data()))
      .filter(r => !r.deletedAt); // suppressions logiques : jamais affichées
    handlers.onCollection({ field, records, fromCache, hasPendingWrites });
  };

  const onErr = (field: string) => (err: { code?: string; message?: string }) => handlers.onError(field, err);

  // Paramètres SaaS globaux (lecture pour tout utilisateur connecté)
  unsubscribers.push(
    onSnapshot(doc(db, 'system', 'globalSaaSSettings'), snap => {
      if (snap.exists()) handlers.onSettings(normalizeFirestoreValue(snap.data()) as GlobalSaaSSettings);
    }, onErr('system'))
  );

  for (const field of SYNCED_FIELDS) {
    const colName = normalizeFirestoreCollection(field).collectionName;
    if (colName === 'system') continue;

    if (scope.isSuperAdmin || GLOBAL_COLLECTIONS.has(colName)) {
      unsubscribers.push(onSnapshot(collection(db, colName), { includeMetadataChanges: false }, snap => {
        emit(field, snap.docs, snap.metadata.fromCache, snap.metadata.hasPendingWrites);
      }, onErr(field)));
      continue;
    }

    if (!scope.tenantId) continue; // utilisateur sans boutique : rien d'autre à lire

    if (colName === 'tenants') {
      unsubscribers.push(onSnapshot(doc(db, 'tenants', scope.tenantId), snap => {
        const docs = snap.exists() ? [{ id: snap.id, data: () => snap.data() as DocumentData }] : [];
        emit(field, docs, snap.metadata.fromCache, snap.metadata.hasPendingWrites);
      }, onErr(field)));
      continue;
    }

    const q = query(collection(db, colName), where('tenantId', '==', scope.tenantId));
    unsubscribers.push(onSnapshot(q, snap => {
      emit(field, snap.docs, snap.metadata.fromCache, snap.metadata.hasPendingWrites);
    }, onErr(field)));
  }

  return () => {
    for (const unsub of unsubscribers) {
      try { unsub(); } catch { /* ignore */ }
    }
  };
}

function toFirestoreValue(op: FieldOp): unknown {
  switch (op.kind) {
    case 'set': return op.value === undefined ? null : op.value;
    case 'increment': return increment(op.by);
    case 'arrayUnion': return arrayUnion(...op.values);
    case 'serverTimestamp': return serverTimestamp();
  }
}

function targetRef(change: RecordChange) {
  const normalized = normalizeFirestoreCollection(change.table);
  if (normalized.isSystemDoc) return doc(db, 'system', 'globalSaaSSettings');
  return doc(db, normalized.collectionName, change.recordId);
}

/**
 * Écrit UNE opération de l'outbox dans son propre lot.
 * La promesse se résout à l'accusé de réception du serveur (elle reste en attente hors ligne,
 * l'écriture étant conservée par le SDK dans son cache persistant).
 */
export function commitOutboxEntry(entry: OutboxEntry, actor: { uid: string; userId: string | null }): Promise<void> {
  const change = entry.change;
  const ref = targetRef(change);
  const data: Record<string, unknown> = {};
  for (const [key, op] of Object.entries(change.fields)) data[key] = toFirestoreValue(op);

  const isGlobal = normalizeFirestoreCollection(change.table).isSystemDoc
    || ['pricingPlans', 'moduleDefinitions', 'planModules', 'tenants'].includes(normalizeFirestoreCollection(change.table).collectionName);
  if (!isGlobal && change.tenantId && data.tenantId === undefined) data.tenantId = change.tenantId;

  if (change.operation === 'SOFT_DELETE') data.deletedBy = actor.userId ?? actor.uid;
  data.version = change.operation === 'CREATE' ? 1 : increment(1);
  if (change.operation === 'CREATE') data.serverCreatedAt = serverTimestamp();
  data.updatedAt = serverTimestamp();
  data.updatedBy = actor.userId ?? actor.uid;
  data.deviceId = entry.deviceId;
  data.lastOperationId = entry.opId;

  const batch = writeBatch(db);
  batch.set(ref, data, { mergeFields: Object.keys(data).map(k => new FieldPath(k)) });

  if (changeHasIncrement(change)) {
    // Inbox côté serveur : les règles refusent la réécriture d'une opération existante.
    batch.set(doc(db, 'operations', entry.opId), {
      tenantId: change.tenantId ?? null,
      table: change.table,
      recordId: change.recordId,
      userId: actor.userId,
      uid: actor.uid,
      deviceId: entry.deviceId,
      createdAt: serverTimestamp(),
      clientCreatedAt: entry.createdAt,
    });
    const qty = change.fields.quantity;
    if (change.table === 'products' && qty && qty.kind === 'increment') {
      batch.set(doc(db, 'stockMovements', entry.opId), {
        tenantId: change.tenantId ?? null,
        productId: change.recordId,
        delta: qty.by,
        opId: entry.opId,
        userId: actor.userId,
        deviceId: entry.deviceId,
        createdAt: serverTimestamp(),
        clientCreatedAt: entry.createdAt,
      });
    }
  }
  return batch.commit();
}

/** Une opération à incrément a-t-elle déjà été appliquée (renvoi après coupure) ? */
export async function isOperationApplied(opId: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'operations', opId));
    return snap.exists();
  } catch {
    return false;
  }
}

export type ErrorClass = 'transient' | 'permanent' | 'duplicate-candidate';

/** Classement des erreurs Firestore pour décider : nouvel essai ou file morte. */
export function classifyFirestoreError(err: unknown): ErrorClass {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'invalid-argument':
    case 'out-of-range':
    case 'unimplemented':
    case 'data-loss':
    case 'not-found':
      return 'permanent';
    case 'permission-denied':
    case 'already-exists':
      return 'duplicate-candidate';
    default:
      return 'transient';
  }
}

/**
 * Sauvegarde directe des coordonnées de règlement & devises SaaS vers Firestore (super admin).
 */
export async function saveGlobalSaaSSettingsToFirestore(
  settings: Partial<GlobalSaaSSettings>,
  saasCurrency?: string
): Promise<void> {
  const start = Date.now();
  try {
    const effectiveCurrency = saasCurrency || settings.saasCurrency || (settings as { currency?: string }).currency || 'EUR';
    await setDoc(doc(db, 'system', 'globalSaaSSettings'), {
      ...settings,
      saasCurrency: effectiveCurrency,
      currency: effectiveCurrency,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Configuration SaaS Root',
      collection: 'system/globalSaaSSettings',
      operation: 'UPDATE',
      status: 'SUCCESS',
      recordsCount: 1,
      durationMs: Date.now() - start,
      details: 'Paramètres SaaS enregistrés',
      source: 'Firestore Cloud',
    });
  } catch (err: unknown) {
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Configuration SaaS Root',
      collection: 'system/globalSaaSSettings',
      operation: 'UPDATE',
      status: 'ERROR',
      recordsCount: 1,
      durationMs: Date.now() - start,
      errorMessage: (err as Error)?.message || 'Erreur inconnue lors de l\'enregistrement des paramètres SaaS',
      source: 'Firestore Cloud',
    });
    throw err;
  }
}

/**
 * Sauvegarde directe de la grille des forfaits tarifaires vers Firestore (super admin).
 */
export async function savePricingPlansToFirestore(plans: PricingPlan[]): Promise<void> {
  const start = Date.now();
  try {
    const batch = writeBatch(db);
    for (const plan of plans) {
      batch.set(doc(db, 'pricingPlans', plan.id), { ...plan, updatedAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Grille des Forfaits',
      collection: 'pricingPlans',
      operation: 'BATCH',
      status: 'SUCCESS',
      recordsCount: plans.length,
      durationMs: Date.now() - start,
      details: `${plans.length} forfaits enregistrés`,
      source: 'Firestore Cloud',
    });
  } catch (err: unknown) {
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Grille des Forfaits',
      collection: 'pricingPlans',
      operation: 'BATCH',
      status: 'ERROR',
      recordsCount: plans.length,
      durationMs: Date.now() - start,
      errorMessage: (err as Error)?.message || 'Erreur lors de l\'enregistrement des forfaits',
      source: 'Firestore Cloud',
    });
    throw err;
  }
}
