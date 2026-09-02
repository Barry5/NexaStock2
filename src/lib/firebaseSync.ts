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
 * Charge l'état initial complet depuis Firestore ou pré-remplit les données par défaut
 */
export async function loadStateFromFirestore(tenantId?: string | null): Promise<DBState> {
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
      result.globalSaaSSettings = settingsDoc.data() as GlobalSaaSSettings;
    } else {
      result.globalSaaSSettings = DEFAULT_SAAS_SETTINGS;
      // Enregistrer par défaut
      await setDoc(doc(db, 'system', 'globalSaaSSettings'), {
        ...DEFAULT_SAAS_SETTINGS,
        updatedAt: new Date().toISOString()
      }).catch(console.warn);
    }

    // 2. Charger les forfaits
    const plansSnap = await getDocs(collection(db, 'pricingPlans'));
    if (!plansSnap.empty) {
      result.pricingPlans = plansSnap.docs.map(d => ({ id: d.id, ...d.data() } as PricingPlan));
    } else {
      result.pricingPlans = DEFAULT_PRICING_PLANS as PricingPlan[];
      // Initialiser les forfaits dans Firestore
      for (const plan of DEFAULT_PRICING_PLANS) {
        await setDoc(doc(db, 'pricingPlans', plan.id), plan).catch(console.warn);
      }
    }

    // 3. Charger les utilisateurs
    const usersSnap = await getDocs(collection(db, 'users'));
    if (!usersSnap.empty) {
      result.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
    } else {
      // Superadmin par défaut si vide
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
      // Boutique démo par défaut si vide
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

    await Promise.all(
      collectionsToFetch.map(async (key) => {
        try {
          const colRef = collection(db, key);
          const snap = await getDocs(colRef);
          if (!snap.empty) {
            (result as any)[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          }
        } catch (e) {
          console.warn(`[FIRESTORE] Erreur lecture collection ${key}:`, e);
        }
      })
    );

    return result as DBState;
  } catch (err: any) {
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
  const collectionName = table === 'global_saas_settings' ? 'system' : table;
  const docId = table === 'global_saas_settings' ? 'globalSaaSSettings' : recordId;
  const docRef = doc(db, collectionName, docId);

  if (operation === 'DELETE') {
    await deleteDoc(docRef);
  } else {
    // Nettoyer les objets imbriqués indésirables ou undefined
    const cleanData: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        cleanData[k] = v;
      }
    }
    cleanData.updatedAt = new Date().toISOString();
    await setDoc(docRef, cleanData, { merge: true });
  }
}

/**
 * Écriture en lot (Batch) vers Firestore pour synchroniser les deltas en attente
 */
export async function pushBatchToFirestore(
  changes: Array<{ table: string; recordId: string; operation: 'CREATE' | 'UPDATE' | 'DELETE'; data: Record<string, unknown> }>
): Promise<{ success: number; errors: string[] }> {
  if (changes.length === 0) return { success: 0, errors: [] };

  const batch = writeBatch(db);
  const errors: string[] = [];
  let count = 0;

  for (const c of changes) {
    try {
      const collectionName = c.table === 'global_saas_settings' ? 'system' : c.table;
      const docId = c.table === 'global_saas_settings' ? 'globalSaaSSettings' : c.recordId;
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
    return { success: count, errors };
  } catch (commitErr: any) {
    console.error('[FIRESTORE] Erreur commit batch:', commitErr);
    return { success: 0, errors: [commitErr?.message || 'Erreur inconnue de commit'] };
  }
}

/**
 * Abonne l'application aux changements Firestore en temps réel pour un tenant
 */
export function subscribeToFirestoreChanges(
  onUpdate: (updatedCollections: Partial<DBState>) => void
): () => void {
  const unsubscribers: (() => void)[] = [];

  const mainCollections: (keyof DBState)[] = [
    'tenants', 'users', 'products', 'sales', 'customers',
    'suppliers', 'expenses', 'loans', 'invoices', 'pricingPlans'
  ];

  mainCollections.forEach((colName) => {
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
