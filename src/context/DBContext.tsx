/**
 * État des données de l'application et synchronisation (phases 1 et 2 de l'audit).
 *
 * Principes :
 *  - les données affichées viennent des écouteurs Firestore BORNÉS à la boutique de
 *    l'utilisateur connecté (cache persistant : fonctionnement hors ligne) ;
 *  - un écran propose un nouvel état (`handleUpdateDb`) : seules les créations et
 *    modifications sont déduites, champ par champ, puis écrites dans l'outbox locale
 *    (IndexedDB) AVANT d'être confiées à Firestore ;
 *  - les suppressions sont explicites et logiques (`handleDeleteRecords`) ;
 *  - aucune donnée n'est jamais renvoyée au serveur à partir du cache local
 *    (suppression du mécanisme de « résurrection », SYNC-01).
 */
import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { collection, getDocs, query, where, deleteDoc, waitForPendingWrites } from 'firebase/firestore';
import type { DBState, NotificationItem, NotificationType, Product, Sale, Customer, Supplier, Expense, Loan } from '../types';
import { LOCAL_CACHE_KEY } from '../constants';
import { setItem as cacheSet, getItem as cacheGet, removeItem as cacheRemove } from '../lib/storage';
import {
  subscribeScopedCollections,
  saveGlobalSaaSSettingsToFirestore,
  SYNCED_FIELDS,
  type SyncScope,
} from '../lib/firebaseSync';
import { db as firestore, firestorePersistenceEnabled } from '../lib/firebase';
import { flushOutbox } from '../api/sync';
import {
  enqueueChanges,
  recoverOutbox,
  getOutboxStats,
  getUnsyncedCount,
  getDeadEntries,
  retryDead,
  discardDead,
  type OutboxStats,
  type OutboxEntry,
} from '../lib/syncQueue';
import { publishDeviceStatus, recordSyncEvent } from '../lib/telemetry';
import { shouldPublishDeviceStatus } from '../sync/monitoring';
import {
  extractRecordChanges,
  applyChangesToState,
  buildSoftDelete,
  deepEqual,
  GLOBAL_TABLES,
  type RecordChange,
} from '../sync/changeEngine';
import { getDeviceId, newId } from '../lib/ids';
import { useAuth } from './AuthContext';
import { logSyncEvent } from '../lib/syncLogger';
import { finalizeInvoiceNumber, invoicePrefixOf } from '../lib/invoiceNumbering';
import {
  HISTORY_COLLECTIONS,
  loadHistoryPreferences,
  saveHistoryPreferences,
  resolveWindows,
  type HistoryPreferences,
} from '../sync/historyWindow';

export type ConnectionState = 'online' | 'offline' | 'degraded';

export interface SyncResult {
  issued: number;
  acknowledged: boolean;
  pending: number;
  dead: number;
}

interface DBContextValue {
  db: DBState;
  isSyncing: boolean;
  syncError: boolean;
  isOnline: boolean;
  connectionState: ConnectionState;
  outboxStats: OutboxStats;
  dataReady: boolean;
  lastCacheTime: string;
  notifications: NotificationItem[];
  addNotification: (text: string, type?: NotificationType) => void;
  handleUpdateDb: (nextDb: DBState) => Promise<void>;
  handleDeleteRecords: (field: keyof DBState, ids: string[]) => Promise<void>;
  handleProductsUpdate: (nextProducts: Product[]) => void;
  handleAddSale: (newSale: Sale, nextProducts: Product[], nextCustomers: Customer[]) => void;
  handleUpdateExpenses: (nextExpenses: Expense[]) => void;
  handleUpdateLoans: (nextLoans: Loan[]) => void;
  handleUpdateCustomers: (nextCustomers: Customer[]) => void;
  handleUpdateSuppliers: (nextSuppliers: Supplier[]) => void;
  /** Envoie la file locale et attend l'accusé du serveur (15 s max). Résultat réel. */
  handleSyncFromServer: () => Promise<SyncResult>;
  /** Purge le cache d'affichage de l'utilisateur (déconnexion). */
  clearLocalData: () => Promise<void>;
  getUnsyncedOperationsCount: () => Promise<number>;
  /** Phase 3 : profondeur d'historique chargée par collection (jours, null = tout). */
  historyPreferences: HistoryPreferences;
  historyWindows: Record<string, string | null>;
  /** `persist = false` : extension temporaire (session), non mémorisée. */
  setHistoryDays: (field: string, days: number | null, persist?: boolean) => void;
  /** Étend la fenêtre d'une collection pour couvrir au moins la date donnée (rapports). */
  ensureHistorySince: (field: string, sinceIso: string) => void;
  /** Phase 4 : file morte locale et actions manuelles (tracées dans syncEvents). */
  getDeadLetters: () => Promise<OutboxEntry[]>;
  retryDeadLetter: (entry: OutboxEntry) => Promise<void>;
  discardDeadLetter: (entry: OutboxEntry) => Promise<void>;
}

const DBContext = createContext<DBContextValue | null>(null);

export const EMPTY_DB_STATE: DBState = {
  tenants: [], users: [], products: [], sales: [],
  customers: [], suppliers: [], expenses: [], loans: [],
  warehouses: [], transfers: [], auditLogs: [],
  subscriptionInvoices: [], variants: [],
};

const EMPTY_STATS: OutboxStats = { pending: 0, sent: 0, dead: 0, oldestPendingAt: null, oldestSentAt: null, lastAckAt: null, avgAckMs: null };
const LEGACY_CACHE_KEY = LOCAL_CACHE_KEY; // ancien instantané global, toutes boutiques confondues
const userCacheKey = (uid: string) => `${LOCAL_CACHE_KEY}:${uid}`;

function recordsInScope(list: unknown, scope: SyncScope): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return (list as Record<string, unknown>[]).filter(r => r && r.id != null && (scope.isSuperAdmin || r.tenantId === scope.tenantId));
}

export function DBProvider({ children }: { children: ReactNode }) {
  const { scope } = useAuth();
  const [db, setDb] = useState<DBState>(EMPTY_DB_STATE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [outboxStats, setOutboxStats] = useState<OutboxStats>(EMPTY_STATS);
  const [dataReady, setDataReady] = useState(false);
  const [lastCacheTime, setLastCacheTime] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notifCounterRef = useRef(0);
  const dbRef = useRef(db);
  dbRef.current = db;
  const scopeRef = useRef<SyncScope | null>(scope);
  scopeRef.current = scope;
  // Objets déjà présents dans un état affiché : non modifiés par l'écran qui les renvoie.
  const knownRecordsRef = useRef(new WeakSet<object>());
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registeredArraysRef = useRef(new WeakSet<object>());
  const [historyPreferences, setHistoryPreferences] = useState<HistoryPreferences>(() => loadHistoryPreferences(null));

  const scopeUid = scope?.uid ?? null;
  const scopeTenant = scope?.tenantId ?? null;
  const scopeSuper = scope?.isSuperAdmin ?? false;
  const scopeUserId = scope?.userId ?? null;

  const addNotification = useCallback((text: string, type?: NotificationType) => {
    const id = `notif-${Date.now()}-${++notifCounterRef.current}`;
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    setNotifications(prev => [{ id, text, time, type: type || 'info' }, ...prev].slice(0, 10));
  }, []);

  // Enregistre les objets de l'état courant comme « connus » (voir extractRecordChanges).
  // Phase 3 : seuls les tableaux nouveaux (identité changée) sont parcourus.
  useEffect(() => {
    const known = knownRecordsRef.current;
    const registered = registeredArraysRef.current;
    for (const value of Object.values(db)) {
      if (!Array.isArray(value) || registered.has(value)) continue;
      registered.add(value);
      for (const r of value) if (r && typeof r === 'object') known.add(r);
    }
  }, [db]);

  // Cache d'affichage par utilisateur (IndexedDB), écrit au plus toutes les 5 s.
  // Il sert uniquement à afficher les données avant le premier instantané ; il n'est
  // JAMAIS utilisé pour renvoyer des données au serveur.
  // PERF-02 : inutile (et coûteux) quand le cache Firestore persistant est actif.
  useEffect(() => {
    if (!scopeUid || !dataReady || firestorePersistenceEnabled) return;
    if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
    cacheTimerRef.current = setTimeout(() => {
      try {
        void cacheSet(userCacheKey(scopeUid), JSON.stringify(dbRef.current));
        setLastCacheTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } catch { /* cache facultatif */ }
    }, 5000);
    return () => { if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current); };
  }, [db, scopeUid, dataReady]);

  const refreshStats = useCallback(async () => {
    try {
      setOutboxStats(await getOutboxStats(scopeRef.current?.uid ?? null));
    } catch { /* ignore */ }
  }, []);

  const flush = useCallback(async () => {
    const s = scopeRef.current;
    if (!s) return { issued: 0 };
    try {
      const res = await flushOutbox({ uid: s.uid, userId: s.userId, tenantId: s.tenantId });
      return res;
    } catch (err) {
      console.error('[SYNC] Échec de l\'envoi de la file locale :', err);
      setSyncError(true);
      return { issued: 0 };
    } finally {
      void refreshStats();
    }
  }, [refreshStats]);

  // Préférences d'historique propres à l'utilisateur.
  useEffect(() => {
    setHistoryPreferences(loadHistoryPreferences(scopeUid));
  }, [scopeUid]);

  const historyWindows = useMemo(() => resolveWindows(historyPreferences), [historyPreferences]);
  const windowsKey = JSON.stringify(historyWindows);

  const setHistoryDays = useCallback((field: string, days: number | null, persist = true) => {
    setHistoryPreferences(prev => {
      const next = { ...prev, [field]: days };
      if (persist) saveHistoryPreferences(scopeRef.current?.uid ?? null, next);
      return next;
    });
  }, []);

  const ensureHistorySince = useCallback((field: string, sinceIso: string) => {
    const cfg = HISTORY_COLLECTIONS[field];
    if (!cfg) return;
    const current = historyWindowsRef.current[field];
    if (current === null || (current && current <= sinceIso)) return;
    const days = Math.ceil((Date.now() - Date.parse(sinceIso)) / 86_400_000) + 1;
    setHistoryDays(field, Math.max(days, 1), false);
  }, [setHistoryDays]);
  const historyWindowsRef = useRef(historyWindows);
  historyWindowsRef.current = historyWindows;

  // Abonnement aux données de la boutique de l'utilisateur connecté.
  useEffect(() => {
    if (!scopeUid) {
      setDb(EMPTY_DB_STATE);
      setDataReady(false);
      return;
    }
    const scopeNow: SyncScope = { uid: scopeUid, userId: scopeUserId || '', tenantId: scopeTenant, isSuperAdmin: scopeSuper };
    let cancelled = false;
    let receivedSnapshot = false;
    const serverLoaded = new Set<string>();
    setDb(EMPTY_DB_STATE);
    setDataReady(false);

    // 1. Affichage immédiat depuis le cache d'affichage de CET utilisateur.
    cacheGet(userCacheKey(scopeUid)).then(raw => {
      if (cancelled || receivedSnapshot || !raw) return;
      try {
        const parsed = JSON.parse(raw) as DBState;
        setDb(prev => ({ ...prev, ...parsed }));
      } catch { /* cache illisible : ignoré */ }
    }).catch(() => undefined);

    // 2. Reprise de la file locale : opérations envoyées sans accusé => renvoyées (idempotent).
    recoverOutbox(scopeUid)
      .then(recovered => {
        if (recovered > 0) console.info(`[SYNC] ${recovered} opération(s) non acquittée(s) remise(s) en file.`);
        return flush();
      })
      .catch(err => console.warn('[SYNC] Reprise de la file locale impossible :', err));

    // 3. Écouteurs bornés à la boutique.
    let legacyChecked = false;
    const reportedListenerErrors = new Set<string>();
    const windowsNow = JSON.parse(windowsKey) as Record<string, string | null>;
    const unsubscribe = subscribeScopedCollections(scopeNow, {
      onCollection: ({ field, records, fromCache }) => {
        receivedSnapshot = true;
        setDb(prev => ({ ...prev, [field]: records } as DBState));
        setDataReady(true);
        if (!fromCache) serverLoaded.add(field);
        if (!legacyChecked && serverLoaded.size >= SYNCED_FIELDS.length - 2) {
          legacyChecked = true;
          void quarantineLegacyCache(scopeNow);
        }
      },
      onSettings: settings => {
        setDb(prev => ({
          ...prev,
          globalSaaSSettings: settings,
          saasCurrency: settings.saasCurrency || settings.currency || prev.saasCurrency,
        }));
      },
      onError: (field, error) => {
        console.warn(`[FIRESTORE] Écouteur ${field} :`, error);
        if (!reportedListenerErrors.has(field)) {
          reportedListenerErrors.add(field);
          recordSyncEvent(
            { uid: scopeNow.uid, userId: scopeNow.userId, tenantId: scopeNow.tenantId },
            { type: error.code === 'permission-denied' ? 'permission_denied' : 'listener_error', table: field, error: `${error.code || ''} ${error.message || ''}`.trim() },
          );
        }
        if (error.code === 'permission-denied') {
          setSyncError(true);
          logSyncEvent({
            tenantId: scopeNow.tenantId || 'global_system',
            tenantName: scopeNow.tenantId ? `Boutique ${scopeNow.tenantId}` : 'Système SaaS',
            collection: field,
            operation: 'REALTIME',
            status: 'ERROR',
            recordsCount: 0,
            errorMessage: `Lecture refusée par les règles (${error.message || error.code})`,
            source: 'Firestore Cloud',
          });
        }
      },
    }, windowsNow);

    // Si l'utilisateur n'a aucune donnée, considérer l'état prêt après un court délai.
    const readyTimer = setTimeout(() => { if (!cancelled) setDataReady(true); }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeUid, scopeTenant, scopeSuper, scopeUserId, windowsKey]);

  /**
   * Migration depuis l'ancienne version : l'ancien instantané global pouvait contenir des
   * enregistrements jamais envoyés. Au lieu de les recréer (SYNC-01), on les place en
   * quarantaine (`syncQuarantine`) pour examen par un administrateur, puis on supprime
   * l'ancien cache (qui contenait les données de toutes les boutiques, SEC-06).
   */
  const quarantineLegacyCache = useCallback(async (s: SyncScope) => {
    try {
      const raw = await cacheGet(LEGACY_CACHE_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw) as Record<string, unknown>;
      const current = dbRef.current as unknown as Record<string, unknown>;
      const deviceId = getDeviceId();
      const changes: RecordChange[] = [];
      for (const field of SYNCED_FIELDS) {
        if (field === 'users') continue; // ne jamais recopier de fiches utilisateur (mots de passe)
        const serverIds = new Set(recordsInScope(current[field], s).map(r => String(r.id)));
        const history = HISTORY_COLLECTIONS[field];
        const since = history ? historyWindowsRef.current[field] : null;
        for (const rec of recordsInScope(legacy[field], s)) {
          if (serverIds.has(String(rec.id))) continue;
          // Hors de la fenêtre chargée : absent de l'état mais pas forcément du serveur.
          if (since && history && typeof rec[history.dateField] === 'string' && (rec[history.dateField] as string) < since) continue;
          const { password: _pw, ...clean } = rec as Record<string, unknown> & { password?: unknown };
          let payload = JSON.stringify(clean);
          if (payload.length > 200_000) payload = payload.slice(0, 200_000);
          const id = newId('q');
          changes.push({
            table: 'syncQuarantine',
            recordId: id,
            operation: 'CREATE',
            tenantId: (rec.tenantId as string) || s.tenantId,
            fields: {
              id: { kind: 'set', value: id },
              tenantId: { kind: 'set', value: (rec.tenantId as string) || s.tenantId },
              collection: { kind: 'set', value: field },
              recordId: { kind: 'set', value: String(rec.id) },
              data: { kind: 'set', value: payload },
              detectedAt: { kind: 'set', value: new Date().toISOString() },
              deviceId: { kind: 'set', value: deviceId },
              status: { kind: 'set', value: 'to_review' },
            },
          });
        }
      }
      if (changes.length > 0) {
        await enqueueChanges(changes, { ownerUid: s.uid, deviceId, userId: s.userId });
        void flush();
        addNotification(`${changes.length} enregistrement(s) local(aux) absent(s) du serveur placé(s) en quarantaine pour vérification.`, 'warning');
        recordSyncEvent({ uid: s.uid, userId: s.userId, tenantId: s.tenantId }, { type: 'quarantine', count: changes.length });
      }
      await cacheRemove(LEGACY_CACHE_KEY);
    } catch (err) {
      console.warn('[MIGRATION] Analyse de l\'ancien cache impossible :', err);
    }
  }, [addNotification, flush]);

  /**
   * Point d'entrée des écrans : créations et modifications déduites champ par champ.
   */
  const handleUpdateDb = useCallback(async (nextDb: DBState) => {
    const s = scopeRef.current;
    if (!s) {
      addNotification('Session expirée : reconnectez-vous pour enregistrer.', 'error');
      return;
    }
    const prev = dbRef.current;
    const known = knownRecordsRef.current;
    let changes = extractRecordChanges(
      prev as unknown as Record<string, unknown>,
      nextDb as unknown as Record<string, unknown>,
      SYNCED_FIELDS,
      s.tenantId,
      r => known.has(r),
    );

    // Garde-fou de périmètre : un utilisateur de boutique ne peut écrire que chez lui.
    if (!s.isSuperAdmin) {
      const rejected = changes.filter(c => !GLOBAL_TABLES.has(c.table) && c.tenantId !== s.tenantId);
      if (rejected.length > 0) {
        console.warn('[SYNC] Modifications hors de la boutique ignorées :', rejected.map(c => `${c.table}/${c.recordId}`));
      }
      changes = changes.filter(c => GLOBAL_TABLES.has(c.table) ? (c.table === 'tenants' && c.recordId === s.tenantId) : c.tenantId === s.tenantId);
    }

    // Paramètres SaaS globaux (super admin uniquement)
    const settingsChanged = Boolean(nextDb.globalSaaSSettings) && !deepEqual(nextDb.globalSaaSSettings, prev.globalSaaSSettings);
    const currencyChanged = Boolean(nextDb.saasCurrency) && nextDb.saasCurrency !== prev.saasCurrency;
    if ((settingsChanged || currencyChanged) && s.isSuperAdmin) {
      const effectiveCurrency = nextDb.saasCurrency || nextDb.globalSaaSSettings?.saasCurrency || 'EUR';
      saveGlobalSaaSSettingsToFirestore({ ...(nextDb.globalSaaSSettings || {}), saasCurrency: effectiveCurrency }, effectiveCurrency)
        .catch(err => {
          console.error('[SYNC] Échec sauvegarde paramètres SaaS :', err);
          addNotification('Échec de l\'enregistrement des paramètres SaaS.', 'error');
        });
    }

    const nowIso = new Date().toISOString();
    setDb(current => {
      let next = applyChangesToState(current, changes, nowIso);
      if ((settingsChanged || currencyChanged) && s.isSuperAdmin) {
        next = { ...next, globalSaaSSettings: nextDb.globalSaaSSettings, saasCurrency: nextDb.saasCurrency };
      }
      return next;
    });

    if (changes.length === 0) return;
    setIsSyncing(true);
    try {
      await enqueueChanges(changes, { ownerUid: s.uid, deviceId: getDeviceId(), userId: s.userId });
      setSyncError(false);
      await flush();
    } catch (err) {
      console.error('[SYNC] Enregistrement local impossible :', err);
      setSyncError(true);
      addNotification('Enregistrement local impossible (stockage du navigateur indisponible). La modification risque d\'être perdue.', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [addNotification, flush]);

  /** Suppression explicite et logique (deletedAt). */
  const handleDeleteRecords = useCallback(async (field: keyof DBState, ids: string[]) => {
    const s = scopeRef.current;
    if (!s || ids.length === 0) return;
    const list = (dbRef.current[field] as unknown as Record<string, unknown>[] | undefined) || [];
    const changes: RecordChange[] = [];
    for (const id of ids) {
      const rec = list.find(r => String(r.id) === id);
      const tenantId = (rec?.tenantId as string | undefined) ?? (field === 'tenants' ? id : s.tenantId);
      if (!s.isSuperAdmin && tenantId !== s.tenantId) continue;
      const del = buildSoftDelete(String(field), id, tenantId ?? null);
      if (field === 'users') del.fields.active = { kind: 'set', value: false };
      changes.push(del);
    }
    if (changes.length === 0) return;
    const nowIso = new Date().toISOString();
    setDb(current => applyChangesToState(current, changes, nowIso));
    try {
      await enqueueChanges(changes, { ownerUid: s.uid, deviceId: getDeviceId(), userId: s.userId });
      await flush();
    } catch (err) {
      console.error('[SYNC] Suppression non enregistrée :', err);
      addNotification('La suppression n\'a pas pu être enregistrée localement.', 'error');
      return;
    }
    if (field === 'users') {
      // Révocation de l'accès : suppression des liens Auth -> fiche utilisateur (en ligne).
      for (const id of ids) {
        try {
          const constraints = s.isSuperAdmin
            ? [where('userId', '==', id)]
            : [where('userId', '==', id), where('tenantId', '==', s.tenantId)];
          const links = await getDocs(query(collection(firestore, 'authLinks'), ...constraints));
          await Promise.all(links.docs.map(d => deleteDoc(d.ref)));
        } catch (err) {
          console.warn('[AUTH] Révocation du lien impossible (sera à refaire en ligne) :', err);
          addNotification('Compte désactivé localement ; la révocation de l\'accès nécessite une connexion Internet.', 'warning');
        }
      }
    }
  }, [addNotification, flush]);

  const handleSyncFromServer = useCallback(async (): Promise<SyncResult> => {
    setIsSyncing(true);
    try {
      const { issued } = await flush();
      let acknowledged = false;
      try {
        await Promise.race([
          waitForPendingWrites(firestore).then(() => { acknowledged = true; }),
          new Promise(resolve => setTimeout(resolve, 15_000)),
        ]);
      } catch { /* ignore */ }
      const stats = await getOutboxStats(scopeRef.current?.uid ?? null);
      setOutboxStats(stats);
      return { issued, acknowledged, pending: stats.pending + stats.sent, dead: stats.dead };
    } finally {
      setIsSyncing(false);
    }
  }, [flush]);

  const clearLocalData = useCallback(async () => {
    const uid = scopeRef.current?.uid;
    if (uid) await cacheRemove(userCacheKey(uid));
    await cacheRemove(LEGACY_CACHE_KEY);
    setDb(EMPTY_DB_STATE);
  }, []);

  const getUnsyncedOperationsCount = useCallback(
    () => getUnsyncedCount(scopeRef.current?.uid ?? null),
    [],
  );

  // Réseau : envoi immédiat au retour de la connexion ; nouvel essai périodique (backoff géré par la file).
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setSyncError(false); void flush(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(() => { void flush(); }, 15_000);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [flush]);

  // Numérotation définitive des ventes encaissées avec un numéro provisoire (SYNC-08).
  useEffect(() => {
    if (!scopeUid || !scopeTenant) return;
    const tick = async () => {
      if (!navigator.onLine) return;
      const provisional = (dbRef.current.sales || []).filter(
        sale => (sale as Sale & { numberStatus?: string }).numberStatus === 'provisional' && sale.tenantId === scopeTenant,
      );
      for (const sale of provisional.slice(0, 20)) {
        try {
          await finalizeInvoiceNumber({ tenantId: scopeTenant, saleId: sale.id, prefix: invoicePrefixOf(sale.invoiceNumber) });
        } catch (err) {
          // Vente pas encore reçue par le serveur, ou hors ligne : nouvel essai au prochain cycle.
          console.debug('[NUMEROTATION] Report :', sale.id, (err as Error)?.message);
          break;
        }
      }
    };
    const interval = setInterval(() => { void tick(); }, 60_000);
    const first = setTimeout(() => { void tick(); }, 10_000);
    return () => { clearInterval(interval); clearTimeout(first); };
  }, [scopeUid, scopeTenant]);

  const getDeadLetters = useCallback(() => getDeadEntries(scopeRef.current?.uid ?? null), []);

  const retryDeadLetter = useCallback(async (entry: OutboxEntry) => {
    const s = scopeRef.current;
    if (!entry.id || !s) return;
    await retryDead(entry.id);
    recordSyncEvent({ uid: s.uid, userId: s.userId, tenantId: s.tenantId }, {
      type: 'manual_retry', table: entry.change.table, recordId: entry.change.recordId, operationId: entry.opId,
    });
    await flush();
  }, [flush]);

  const discardDeadLetter = useCallback(async (entry: OutboxEntry) => {
    const s = scopeRef.current;
    if (!entry.id || !s) return;
    await discardDead(entry.id);
    recordSyncEvent({ uid: s.uid, userId: s.userId, tenantId: s.tenantId }, {
      type: 'manual_discard', table: entry.change.table, recordId: entry.change.recordId, operationId: entry.opId,
      error: entry.lastError ?? undefined,
    });
    void refreshStats();
  }, [refreshStats]);

  // Alerte locale quand de nouvelles opérations passent en file morte.
  const lastDeadRef = useRef(0);
  useEffect(() => {
    if (outboxStats.dead > lastDeadRef.current) {
      addNotification(`${outboxStats.dead} opération(s) refusée(s) par le serveur : ouvrez l'état de synchronisation pour les rejouer ou les abandonner.`, 'error');
    }
    lastDeadRef.current = outboxStats.dead;
  }, [outboxStats.dead, addNotification]);

  // Phase 4 : publication de l'état du poste (battement de cœur 5 min ou changement significatif).
  const lastPublishedRef = useRef<{ at: number; snapshot: { pending: number; sent: number; dead: number; online: boolean } } | null>(null);
  useEffect(() => {
    if (!scopeUid) return;
    const publish = () => {
      const s = scopeRef.current;
      if (!s) return;
      const snapshot = { pending: outboxStatsRef.current.pending, sent: outboxStatsRef.current.sent, dead: outboxStatsRef.current.dead, online: navigator.onLine };
      const prev = lastPublishedRef.current;
      if (!shouldPublishDeviceStatus(prev?.snapshot ?? null, snapshot, prev?.at ?? null, Date.now())) return;
      lastPublishedRef.current = { at: Date.now(), snapshot };
      const me = dbRef.current.users.find(u => u.id === s.userId);
      const tenant = dbRef.current.tenants.find(t => t.id === s.tenantId);
      const stats = outboxStatsRef.current;
      void publishDeviceStatus({ uid: s.uid, userId: s.userId, tenantId: s.tenantId }, {
        ...snapshot,
        userName: me?.name,
        tenantName: tenant?.name,
        connectionState: connectionStateRef.current,
        oldestPendingAt: stats.oldestPendingAt,
        oldestSentAt: stats.oldestSentAt,
        lastAckAt: stats.lastAckAt,
        avgAckMs: stats.avgAckMs,
        persistence: firestorePersistenceEnabled,
      });
    };
    publish();
    const interval = setInterval(publish, 60_000);
    return () => clearInterval(interval);
  }, [scopeUid, outboxStats, isOnline]);

  const connectionState: ConnectionState = !isOnline
    ? 'offline'
    : outboxStats.oldestSentAt && Date.now() - Date.parse(outboxStats.oldestSentAt) > 60_000
      ? 'degraded'
      : 'online';

  const outboxStatsRef = useRef(outboxStats);
  outboxStatsRef.current = outboxStats;
  const connectionStateRef = useRef<ConnectionState>(connectionState);
  connectionStateRef.current = connectionState;

  useEffect(() => {
    if (!firestorePersistenceEnabled && scopeUid) {
      addNotification('Mode hors ligne limité : le stockage persistant du navigateur est indisponible.', 'warning');
    }
  }, [scopeUid, addNotification]);

  const handleProductsUpdate = useCallback((nextProducts: Product[]) => {
    void handleUpdateDb({ ...dbRef.current, products: nextProducts });
  }, [handleUpdateDb]);

  const handleAddSale = useCallback((newSale: Sale, nextProducts: Product[], nextCustomers: Customer[]) => {
    const current = dbRef.current;
    void handleUpdateDb({ ...current, sales: [...current.sales, newSale], products: nextProducts, customers: nextCustomers });
    addNotification(`Nouvelle vente enregistrée : ${newSale.invoiceNumber} (${newSale.customerName})`);
  }, [handleUpdateDb, addNotification]);

  const handleUpdateExpenses = useCallback((nextExpenses: Expense[]) => {
    void handleUpdateDb({ ...dbRef.current, expenses: nextExpenses });
    addNotification('Registre des dépenses mis à jour.');
  }, [handleUpdateDb, addNotification]);

  const handleUpdateLoans = useCallback((nextLoans: Loan[]) => {
    void handleUpdateDb({ ...dbRef.current, loans: nextLoans });
    addNotification('Tableau des financements mis à jour.');
  }, [handleUpdateDb, addNotification]);

  const handleUpdateCustomers = useCallback((nextCustomers: Customer[]) => {
    void handleUpdateDb({ ...dbRef.current, customers: nextCustomers });
  }, [handleUpdateDb]);

  const handleUpdateSuppliers = useCallback((nextSuppliers: Supplier[]) => {
    void handleUpdateDb({ ...dbRef.current, suppliers: nextSuppliers });
  }, [handleUpdateDb]);

  return (
    <DBContext.Provider value={{
      db, isSyncing, syncError, isOnline, connectionState, outboxStats, dataReady, lastCacheTime, notifications,
      addNotification, handleUpdateDb, handleDeleteRecords, handleProductsUpdate, handleAddSale,
      handleUpdateExpenses, handleUpdateLoans, handleUpdateCustomers, handleUpdateSuppliers,
      handleSyncFromServer, clearLocalData, getUnsyncedOperationsCount,
      historyPreferences, historyWindows, setHistoryDays, ensureHistorySince,
      getDeadLetters, retryDeadLetter, discardDeadLetter,
    }}>
      {children}
    </DBContext.Provider>
  );
}

export function useDB() {
  const ctx = useContext(DBContext);
  if (!ctx) throw new Error('useDB must be used within DBProvider');
  return ctx;
}
