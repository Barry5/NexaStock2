import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  onSnapshot,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { DBState, Tenant, User, Product, Sale, Customer, Supplier, Expense, Loan, PricingPlan, GlobalSaaSSettings } from '../types';
import { DEFAULT_PRICING_PLANS, DEFAULT_SAAS_SETTINGS } from '../constants';
import { logSyncEvent } from './syncLogger';

// Normalisation des noms de tables SQL/client vers les collections Firestore cibles
export function normalizeFirestoreCollection(table: string): { collectionName: string; docId?: string; isSystemDoc?: boolean } {
  if (table === 'global_saas_settings' || table === 'globalSaaSSettings' || table === 'saas_settings') {
    return { collectionName: 'system', docId: 'globalSaaSSettings', isSystemDoc: true };
  }
  if (table === 'pricing_plans' || table === 'pricingPlans') {
    return { collectionName: 'pricingPlans' };
  }
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

// Liste de toutes les collections Firestore synchronisées
export const FIRESTORE_COLLECTIONS = [
  'tenants', 'users', 'products', 'sales', 'customers',
  'suppliers', 'expenses', 'loans', 'warehouses', 'transfers',
  'auditLogs', 'subscriptionInvoices', 'variants', 'pricingPlans',
  'subscriptionPayments', 'globalSaaSSettings', 'invoices',
  'deliveryOrders', 'payments', 'returns', 'invoiceAuditLogs',
  'deliveryNoteAudit', 'affiliates', 'commissionRules',
  'commissionLedger', 'commissionPayments', 'commissionAudit',
  'moduleDefinitions', 'planModules', 'tenantModules'
] as const;

export interface FirestoreSyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

/**
 * Sauvegarde directe des coordonnées de règlement & devises SaaS vers Firestore
 */
export async function saveGlobalSaaSSettingsToFirestore(
  settings: GlobalSaaSSettings,
  saasCurrency?: string
): Promise<void> {
  const start = Date.now();
  try {
    const payload = {
      ...settings,
      saasCurrency: saasCurrency || (settings as any).saasCurrency || 'EUR',
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'system', 'globalSaaSSettings'), payload, { merge: true });
    
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Configuration SaaS Root',
      collection: 'system/globalSaaSSettings',
      operation: 'UPDATE',
      status: 'SUCCESS',
      recordsCount: 1,
      durationMs: Date.now() - start,
      details: `Coordonnées bancaires, Orange Money (${settings.orangeMoneyNumber || 'N/A'}) et Forfaits synchronisés avec succès`,
      source: 'Firestore Cloud'
    });
  } catch (err: any) {
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Configuration SaaS Root',
      collection: 'system/globalSaaSSettings',
      operation: 'UPDATE',
      status: 'ERROR',
      recordsCount: 1,
      durationMs: Date.now() - start,
      errorMessage: err?.message || 'Erreur inconnue lors de l\'enregistrement des paramètres SaaS',
      details: 'Échec de synchronisation Firestore de system/globalSaaSSettings',
      source: 'Firestore Cloud'
    });
    throw err;
  }
}

/**
 * Sauvegarde directe de la grille des forfaits tarifaires vers Firestore
 */
export async function savePricingPlansToFirestore(plans: PricingPlan[]): Promise<void> {
  const start = Date.now();
  try {
    const batch = writeBatch(db);
    for (const plan of plans) {
      const planRef = doc(db, 'pricingPlans', plan.id);
      batch.set(planRef, {
        ...plan,
        updatedAt: new Date().toISOString()
      }, { merge: true });
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
      details: `${plans.length} forfaits synchronisés (${plans.map(p => p.name).join(', ')})`,
      source: 'Firestore Cloud'
    });
  } catch (err: any) {
    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Grille des Forfaits',
      collection: 'pricingPlans',
      operation: 'BATCH',
      status: 'ERROR',
      recordsCount: plans.length,
      durationMs: Date.now() - start,
      errorMessage: err?.message || 'Erreur lors de la synchronisation des forfaits dans Firestore',
      source: 'Firestore Cloud'
    });
    throw err;
  }
}

/**
 * Charge l'état initial complet depuis Firestore ou pré-remplit les données par défaut
 */
export async function loadStateFromFirestore(tenantId?: string | null): Promise<DBState> {
  const start = Date.now();
  const result: Partial<DBState> = {
    tenants: [],
    users: [],
    products: [],
    sales: [],
    customers: [],
    suppliers: [],
    expenses: [],
    loans: [],
    warehouses: [],
    transfers: [],
    auditLogs: [],
    subscriptionInvoices: [],
    variants: [],
    pricingPlans: [],
    subscriptionPayments: [],
    invoices: [],
    deliveryOrders: [],
    payments: [],
    returns: [],
    invoiceAuditLogs: [],
    deliveryNoteAudit: [],
    affiliates: [],
    commissionRules: [],
    commissionLedger: [],
    commissionPayments: [],
    commissionAudit: [],
    moduleDefinitions: [],
    planModules: [],
    tenantModules: [],
  };

  try {
    // 1. Charger les settings globaux
    const settingsDoc = await getDoc(doc(db, 'system', 'globalSaaSSettings'));
    if (settingsDoc.exists()) {
      const sData = settingsDoc.data() as GlobalSaaSSettings & { saasCurrency?: string };
      result.globalSaaSSettings = sData;
      result.saasCurrency = sData.saasCurrency || 'EUR';
    } else {
      result.globalSaaSSettings = DEFAULT_SAAS_SETTINGS;
      result.saasCurrency = 'EUR';
      await setDoc(doc(db, 'system', 'globalSaaSSettings'), {
        ...DEFAULT_SAAS_SETTINGS,
        saasCurrency: 'EUR',
        updatedAt: new Date().toISOString()
      }).catch(console.warn);
    }

    // 2. Charger les forfaits
    const plansSnap = await getDocs(collection(db, 'pricingPlans'));
    if (!plansSnap.empty) {
      result.pricingPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as PricingPlan));
    } else {
      result.pricingPlans = DEFAULT_PRICING_PLANS as PricingPlan[];
      for (const plan of DEFAULT_PRICING_PLANS) {
        await setDoc(doc(db, 'pricingPlans', plan.id), plan).catch(console.warn);
      }
    }

    // 3. Charger les utilisateurs
    const usersSnap = await getDocs(collection(db, 'users'));
    if (!usersSnap.empty) {
      result.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
    } else {
      const defaultSuperAdmin: User = {
        id: 'u-1',
        name: 'Barry Hassim',
        email: 'barry.hassim@gmail.com',
        role: 'superadmin',
        tenantId: null,
        active: true,
        password: 'Nexa2026!'
      };
      result.users = [defaultSuperAdmin];
      await setDoc(doc(db, 'users', 'u-1'), defaultSuperAdmin).catch(console.warn);
    }

    // 4. Charger les tenants
    const tenantsSnap = await getDocs(collection(db, 'tenants'));
    if (!tenantsSnap.empty) {
      result.tenants = tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Tenant));
    } else {
      const defaultTenant: Tenant = {
        id: 'tenant-demo',
        name: 'Boutique Principale',
        description: 'Boutique pilote NexaStock',
        plan: 'Standard',
        logo: '',
        address: 'Centre-ville, Conakry',
        phone: '+224 620 00 00 00',
        currency: 'GNF',
        createdAt: new Date().toISOString(),
        subscriptionStatus: 'ACTIVE'
      };
      result.tenants = [defaultTenant];
      await setDoc(doc(db, 'tenants', 'tenant-demo'), defaultTenant).catch(console.warn);
    }

    // 5. Charger les autres collections métiers
    const collectionsToFetch: (keyof DBState)[] = [
      'products', 'sales', 'customers', 'suppliers', 'expenses', 'loans',
      'warehouses', 'transfers', 'auditLogs', 'subscriptionInvoices', 'variants',
      'subscriptionPayments', 'invoices', 'deliveryOrders', 'payments', 'returns',
      'invoiceAuditLogs', 'deliveryNoteAudit', 'affiliates', 'commissionRules',
      'commissionLedger', 'commissionPayments', 'commissionAudit',
      'moduleDefinitions', 'planModules', 'tenantModules'
    ];

    let totalLoadedCount = 0;
    await Promise.all(
      collectionsToFetch.map(async (key) => {
        try {
          const colRef = collection(db, key);
          const snap = await getDocs(colRef);
          if (!snap.empty) {
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            (result as any)[key] = items;
            totalLoadedCount += items.length;
          }
        } catch (e: any) {
          console.warn(`[FIRESTORE] Erreur lecture collection ${key}:`, e);
        }
      })
    );

    logSyncEvent({
      tenantId: tenantId || 'global_system',
      tenantName: tenantId ? `Tenant ${tenantId}` : 'Système SaaS Root',
      collection: 'ALL_COLLECTIONS',
      operation: 'PULL',
      status: 'SUCCESS',
      recordsCount: totalLoadedCount,
      durationMs: Date.now() - start,
      details: `Chargement complet Firestore : ${result.tenants?.length} tenants, ${result.pricingPlans?.length} forfaits, ${totalLoadedCount} données synchronisées`,
      source: 'Firestore Cloud'
    });

    return result as DBState;
  } catch (err: any) {
    logSyncEvent({
      tenantId: tenantId || 'global_system',
      tenantName: 'Système SaaS Root',
      collection: 'ALL_COLLECTIONS',
      operation: 'PULL',
      status: 'ERROR',
      recordsCount: 0,
      durationMs: Date.now() - start,
      errorMessage: err?.message || 'Erreur fatale lors du chargement Firestore',
      source: 'Firestore Cloud'
    });
    console.error('[FIRESTORE] Erreur chargement initial:', err);
    throw err;
  }
}

/**
 * Sauvegarde un changement unitaire (CREATE, UPDATE, DELETE) vers Firestore
 */
export async function pushChangeToFirestore(
  table: string,
  recordId: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  data: Record<string, unknown>
): Promise<void> {
  const start = Date.now();
  const normalized = normalizeFirestoreCollection(table);
  const collectionName = normalized.collectionName;
  const docId = normalized.docId || recordId;
  const docRef = doc(db, collectionName, docId);

  const tenantId = (data?.tenantId as string) || 'global_system';

  try {
    if (operation === 'DELETE') {
      await deleteDoc(docRef);
    } else {
      const cleanData: Record<string, any> = {};
      for (const [k, v] of Object.entries(data || {})) {
        if (v !== undefined) {
          cleanData[k] = v;
        }
      }
      cleanData.updatedAt = new Date().toISOString();
      await setDoc(docRef, cleanData, { merge: true });
    }

    logSyncEvent({
      tenantId,
      tenantName: tenantId === 'global_system' ? 'Système SaaS' : `Tenant ${tenantId}`,
      collection: collectionName,
      operation: operation === 'DELETE' ? 'DELETE' : operation === 'CREATE' ? 'CREATE' : 'UPDATE',
      status: 'SUCCESS',
      recordsCount: 1,
      durationMs: Date.now() - start,
      details: `${operation} sur ${collectionName}/${docId}`,
      source: 'Firestore Cloud'
    });
  } catch (err: any) {
    logSyncEvent({
      tenantId,
      tenantName: tenantId === 'global_system' ? 'Système SaaS' : `Tenant ${tenantId}`,
      collection: collectionName,
      operation: 'PUSH',
      status: 'ERROR',
      recordsCount: 1,
      durationMs: Date.now() - start,
      errorMessage: err?.message || 'Erreur Firestore pushChangeToFirestore',
      details: `Échec ${operation} sur ${collectionName}/${docId}`,
      source: 'Firestore Cloud'
    });
    throw err;
  }
}

/**
 * Écriture en lot (Batch) vers Firestore pour synchroniser les deltas en attente
 */
export async function pushBatchToFirestore(
  changes: Array<{ table: string; recordId: string; operation: 'CREATE' | 'UPDATE' | 'DELETE'; data: Record<string, unknown> }>
): Promise<{ success: number; errors: string[] }> {
  if (changes.length === 0) return { success: 0, errors: [] };

  const start = Date.now();
  const batch = writeBatch(db);
  const errors: string[] = [];
  let count = 0;

  for (const c of changes) {
    try {
      const normalized = normalizeFirestoreCollection(c.table);
      const collectionName = normalized.collectionName;
      const docId = normalized.docId || c.recordId;
      const docRef = doc(db, collectionName, docId);

      if (c.operation === 'DELETE') {
        batch.delete(docRef);
      } else {
        const cleanData: Record<string, any> = {};
        for (const [k, v] of Object.entries(c.data || {})) {
          if (v !== undefined) cleanData[k] = v;
        }
        cleanData.updatedAt = new Date().toISOString();
        batch.set(docRef, cleanData, { merge: true });
      }
      count++;
    } catch (e: any) {
      errors.push(`${c.table}/${c.recordId}: ${e?.message || e}`);
    }
  }

  try {
    await batch.commit();

    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Synchronisation par Lot',
      collection: 'BATCH_COLLECTIONS',
      operation: 'BATCH',
      status: errors.length > 0 ? 'ERROR' : 'SUCCESS',
      recordsCount: count,
      durationMs: Date.now() - start,
      details: `Batch de ${count} modification(s) commitées dans Firestore.`,
      errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
      source: 'Firestore Cloud'
    });

    return { success: count, errors };
  } catch (commitErr: any) {
    const errorMsg = commitErr?.message || 'Erreur inconnue de commit Firestore batch';
    console.error('[FIRESTORE] Erreur commit batch:', commitErr);

    logSyncEvent({
      tenantId: 'global_system',
      tenantName: 'Synchronisation par Lot',
      collection: 'BATCH_COLLECTIONS',
      operation: 'BATCH',
      status: 'ERROR',
      recordsCount: count,
      durationMs: Date.now() - start,
      errorMessage: errorMsg,
      source: 'Firestore Cloud'
    });

    return { success: 0, errors: [errorMsg] };
  }
}

/**
 * Abonne l'application aux changements Firestore en temps réel
 */
export function subscribeToFirestoreChanges(
  onUpdate: (updatedCollections: Partial<DBState>) => void
): () => void {
  const unsubscribers: (() => void)[] = [];

  // Écouteur sur les paramètres globaux (system/globalSaaSSettings)
  try {
    const settingsDocRef = doc(db, 'system', 'globalSaaSSettings');
    const unsubSettings = onSnapshot(settingsDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as GlobalSaaSSettings & { saasCurrency?: string };
        onUpdate({
          globalSaaSSettings: data,
          saasCurrency: data.saasCurrency || 'EUR'
        });
      }
    }, (err) => {
      console.warn('[FIRESTORE] Listener globalSaaSSettings error:', err);
    });
    unsubscribers.push(unsubSettings);
  } catch (e) {
    console.warn('[FIRESTORE] Erreur abonnement system/globalSaaSSettings:', e);
  }

  const collectionsToListen: (keyof DBState)[] = [
    'tenants', 'users', 'products', 'sales', 'customers',
    'suppliers', 'expenses', 'loans', 'invoices', 'pricingPlans',
    'subscriptionPayments', 'planModules', 'tenantModules'
  ];

  collectionsToListen.forEach((colName) => {
    try {
      const q = collection(db, colName);
      const unsub = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          onUpdate({ [colName]: items });
        }
      }, (err) => {
        console.warn(`[FIRESTORE] Listener ${colName} error:`, err);
      });
      unsubscribers.push(unsub);
    } catch (e) {
      console.warn(`[FIRESTORE] Erreur souscription ${colName}:`, e);
    }
  });

  return () => {
    unsubscribers.forEach(unsub => {
      try { unsub(); } catch { /* ignore */ }
    });
  };
}

