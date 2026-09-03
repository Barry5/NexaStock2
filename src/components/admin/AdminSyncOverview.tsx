import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cloud,
  CloudLightning,
  Database,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HardDrive,
  Building2,
  Trash2,
  Search,
  Filter,
  Activity,
  Layers,
  Check,
  Radio
} from 'lucide-react';
import type { SyncOverview } from '../../types/sync';
import { useDB } from '../../context';
import {
  SyncLogEntry,
  TenantSyncStatus,
  subscribeToSyncLogs,
  clearSyncLogs,
  computeTenantSyncStatuses,
  logSyncEvent
} from '../../lib/syncLogger';

interface AdminSyncOverviewProps {
  overview: SyncOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const formatDate = (value: string | null): string => {
  if (!value) return 'Aucune donnée';
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatTime = (value: string | null): string => {
  if (!value) return '--:--:--';
  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export default function AdminSyncOverview({ overview, loading, error, onRefresh }: AdminSyncOverviewProps) {
  const { db, isSyncing, syncError, isOnline, lastCacheTime, handleUpdateDb, addNotification } = useDB();
  const [manualSyncing, setManualSyncing] = useState(false);
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // S'abonner aux logs Firestore en temps réel
  useEffect(() => {
    const unsubscribe = subscribeToSyncLogs((newLogs) => {
      setLogs(newLogs);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Déclencher une synchronisation manuelle
  const handleTriggerSync = async () => {
    setManualSyncing(true);
    const start = Date.now();
    try {
      addNotification('Synchronisation globale avec Firebase Firestore...', 'info');
      await handleUpdateDb(db);
      logSyncEvent({
        tenantId: 'global_system',
        tenantName: 'Console Super Admin',
        collection: 'ALL_COLLECTIONS',
        operation: 'BATCH',
        status: 'SUCCESS',
        recordsCount: (db.tenants?.length || 0) + (db.products?.length || 0) + (db.sales?.length || 0),
        durationMs: Date.now() - start,
        details: 'Synchronisation manuelle déclenchée depuis la console de monitoring',
        source: 'Firestore Cloud'
      });
      addNotification('Synchronisation Cloud terminée avec succès !', 'success');
      onRefresh();
    } catch (err: any) {
      logSyncEvent({
        tenantId: 'global_system',
        tenantName: 'Console Super Admin',
        collection: 'ALL_COLLECTIONS',
        operation: 'BATCH',
        status: 'ERROR',
        recordsCount: 0,
        durationMs: Date.now() - start,
        errorMessage: err?.message || 'Erreur lors du déclenchement manuel',
        source: 'Firestore Cloud'
      });
      addNotification('Erreur lors de la synchronisation avec Firestore.', 'error');
    } finally {
      setManualSyncing(false);
    }
  };

  // Calcul du volume par tenant
  const tenantStats = useMemo(() => {
    const recordCounts: Record<string, number> = {};
    (db.tenants || []).forEach(t => {
      const prodCount = (db.products || []).filter(p => p.tenantId === t.id).length;
      const saleCount = (db.sales || []).filter(s => s.tenantId === t.id).length;
      const custCount = (db.customers || []).filter(c => c.tenantId === t.id).length;
      const userCount = (db.users || []).filter(u => u.tenantId === t.id).length;
      recordCounts[t.id] = prodCount + saleCount + custCount + userCount;
    });

    return computeTenantSyncStatuses(db.tenants || [], isOnline, isSyncing, recordCounts);
  }, [db.tenants, db.products, db.sales, db.customers, db.users, isOnline, isSyncing, logs]);

  // Filtrage des logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      if (selectedTenantFilter !== 'ALL') {
        if (selectedTenantFilter === 'global_system' && l.tenantId !== 'global_system') return false;
        if (selectedTenantFilter !== 'global_system' && l.tenantId !== selectedTenantFilter) return false;
      }
      if (selectedStatusFilter !== 'ALL' && l.status !== selectedStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesCollection = l.collection.toLowerCase().includes(q);
        const matchesTenant = (l.tenantName || '').toLowerCase().includes(q);
        const matchesDetails = (l.details || '').toLowerCase().includes(q);
        const matchesError = (l.errorMessage || '').toLowerCase().includes(q);
        if (!matchesCollection && !matchesTenant && !matchesDetails && !matchesError) return false;
      }
      return true;
    });
  }, [logs, selectedTenantFilter, selectedStatusFilter, searchQuery]);

  const errorLogsCount = logs.filter(l => l.status === 'ERROR').length;
  const successLogsCount = logs.filter(l => l.status === 'SUCCESS').length;

  return (
    <motion.div
      key="sync-overview"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-6"
    >
      {/* 1. Header & Live Indicator */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 p-5 rounded-2xl border border-gray-800">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <CloudLightning className="w-4 h-4 text-emerald-400" />
              Monitoring en Temps Réel Firestore
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Écouteurs Snapshots Actifs
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
              Isolation Multi-Tenant Strict
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-xs text-gray-300 leading-relaxed">
            Surveillance centralisée des flux Firestore bidirectionnels : traçabilité des horodatages, détection proactive des erreurs, état de connexion de chaque entreprise cliente et synchronisation immédiate des Forfaits & Coordonnées de règlement.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleTriggerSync}
            disabled={manualSyncing || isSyncing}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${manualSyncing || isSyncing ? 'animate-spin' : ''}`} />
            {manualSyncing || isSyncing ? 'Synchronisation...' : 'Forcer la Synchronisation'}
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-950 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-300 hover:text-white transition hover:border-gray-600 disabled:opacity-50"
          >
            {loading ? 'Actualisation...' : 'Actualiser'}
          </button>
        </div>
      </div>

      {/* Alerte globale en cas d'erreur de synchronisation */}
      {(error || syncError) && (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/60 p-4 text-xs text-red-200 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="font-bold">Avertissement de synchronisation Firestore :</p>
            <p className="text-[11px] text-red-300 mt-0.5">{error || syncError}</p>
          </div>
        </div>
      )}

      {/* 2. Cartes Métriques Clés */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {/* Statut Connectivité Firestore */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Canal Cloud Firestore</p>
              <p className="mt-1.5 text-lg font-black text-white flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {isOnline ? 'Connecté (Temps Réel)' : 'Hors Ligne (IndexedDB)'}
              </p>
            </div>
            <Cloud className="h-6 w-6 text-sky-400 flex-shrink-0" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
            <span>En attente Push :</span>
            <span className="font-mono font-bold text-white bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
              {overview?.service.pendingCount ?? 0}
            </span>
          </div>
        </div>

        {/* Paramètres & Forfaits SaaS */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Forfaits & Règlements</p>
              <p className="mt-1.5 text-lg font-black text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Synchronisés
              </p>
            </div>
            <Layers className="h-6 w-6 text-indigo-400 flex-shrink-0" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
            <span>Grille forfaits :</span>
            <span className="font-mono font-bold text-indigo-300">
              {db.pricingPlans?.length || 3} plans ({db.saasCurrency || 'EUR'})
            </span>
          </div>
        </div>

        {/* Entreprises / Tenants surveillés */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Tenants Monitorés</p>
              <p className="mt-1.5 text-lg font-black text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-400" />
                {db.tenants?.length || 0} Entreprises
              </p>
            </div>
            <Activity className="h-6 w-6 text-emerald-400 flex-shrink-0" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
            <span>Règle d'accès :</span>
            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              Utilisateur lié strictly
            </span>
          </div>
        </div>

        {/* Cache local & Latence */}
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Résilience Hors Ligne</p>
              <p className="mt-1.5 text-lg font-black text-white">
                {isSyncing ? 'Mise à jour...' : 'Dexie DB Prêt'}
              </p>
            </div>
            <HardDrive className="h-6 w-6 text-amber-400 flex-shrink-0" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-400">
            <span>Horodatage cache :</span>
            <span className="font-mono text-gray-300 text-[11px]">
              {lastCacheTime || 'Instantané'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Section État des Connexions & Synchronisation Firestore par Tenant */}
      <div className="rounded-2xl border border-gray-850 bg-gray-950 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-850 pb-4">
          <div>
            <h4 className="text-xs uppercase tracking-wider text-white font-mono font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              État des Connexions & Synchronisation Firestore par Entreprise (Tenant)
            </h4>
            <p className="text-xs text-gray-400 mt-0.5">
              Chaque entreprise cliente dispose d'une cloison Firestore hermétique. Les utilisateurs standard ne peuvent pas basculer d'entreprise.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Écoute bidirectionnelle active</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tenantStats.map((t) => (
            <div
              key={t.tenantId}
              className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 space-y-3 hover:border-gray-700 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h5 className="font-bold text-white text-sm leading-snug">{t.tenantName}</h5>
                  <p className="text-[10px] font-mono text-gray-400">ID: {t.tenantId}</p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    t.connectionStatus === 'ONLINE'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : t.connectionStatus === 'SYNCING'
                      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                      : t.connectionStatus === 'ERROR'
                      ? 'bg-red-500/15 text-red-300 border-red-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      t.connectionStatus === 'ONLINE'
                        ? 'bg-emerald-400'
                        : t.connectionStatus === 'SYNCING'
                        ? 'bg-blue-400 animate-spin'
                        : t.connectionStatus === 'ERROR'
                        ? 'bg-red-400'
                        : 'bg-amber-400'
                    }`}
                  />
                  {t.connectionStatus === 'ONLINE'
                    ? 'Connecté'
                    : t.connectionStatus === 'SYNCING'
                    ? 'Synchronisation'
                    : t.connectionStatus === 'ERROR'
                    ? 'Erreur'
                    : 'Hors Ligne'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-gray-800/80">
                <div>
                  <span className="text-gray-500 text-[10px] font-mono uppercase block">Dernier Sync</span>
                  <span className="text-gray-300 font-mono">{formatTime(t.lastSyncAt)}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-[10px] font-mono uppercase block">Données rattachées</span>
                  <span className="text-blue-400 font-mono font-bold">{t.totalRecords} records</span>
                </div>
              </div>

              {t.errorCount > 0 && t.lastErrorMessage && (
                <div className="rounded-lg bg-red-950/50 border border-red-500/20 p-2 text-[10px] text-red-300 font-mono leading-tight">
                  ⚠️ {t.lastErrorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Panneau de Monitoring & Logs Firestore en Temps Réel */}
      <div className="rounded-2xl border border-gray-850 bg-gray-950 p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-850 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs uppercase tracking-wider text-white font-mono font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                Journal d'Événements & Logs Firestore en Temps Réel
              </h4>
              <span className="bg-gray-900 border border-gray-800 text-gray-300 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                {filteredLogs.length} événements
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Traçabilité immédiate de chaque requête Firestore (INSERT, UPDATE, DELETE, BATCH) avec horodatage précis et détails d'exécution.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearSyncLogs();
                addNotification('Journal des logs réinitialisé.', 'info');
              }}
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 bg-gray-900 hover:bg-red-500/10 border border-gray-800 hover:border-red-500/30 px-3 py-1.5 rounded-xl transition font-mono"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Purger les logs</span>
            </button>
          </div>
        </div>

        {/* Filtres & Recherche */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Recherche */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Filtrer par collection, détails ou erreur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/60"
            />
          </div>

          {/* Filtre par Tenant */}
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] text-gray-400">Tenant:</span>
            <select
              value={selectedTenantFilter}
              onChange={(e) => setSelectedTenantFilter(e.target.value)}
              className="bg-transparent text-xs text-white outline-none w-full cursor-pointer"
            >
              <option value="ALL" className="bg-gray-900">Tous les tenants</option>
              <option value="global_system" className="bg-gray-900">Configuration SaaS Root</option>
              {(db.tenants || []).map(t => (
                <option key={t.id} value={t.id} className="bg-gray-900">{t.name}</option>
              ))}
            </select>
          </div>

          {/* Filtre par Statut */}
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-3 py-1.5">
            <Activity className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] text-gray-400">Statut:</span>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-white outline-none w-full cursor-pointer"
            >
              <option value="ALL" className="bg-gray-900">Tous les statuts</option>
              <option value="SUCCESS" className="bg-gray-900">Succès uniquement ({successLogsCount})</option>
              <option value="ERROR" className="bg-gray-900">Erreurs uniquement ({errorLogsCount})</option>
            </select>
          </div>
        </div>

        {/* Table interactive des logs en direct */}
        <div className="overflow-x-auto rounded-xl border border-gray-850">
          <table className="min-w-full text-xs text-left text-gray-300">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/80 text-[10px] font-mono uppercase text-gray-400">
                <th className="py-3 px-3 font-bold">Horodatage</th>
                <th className="py-3 px-3 font-bold">Entreprise / Tenant</th>
                <th className="py-3 px-3 font-bold">Collection Cible</th>
                <th className="py-3 px-3 font-bold">Opération</th>
                <th className="py-3 px-3 font-bold">Statut</th>
                <th className="py-3 px-3 font-bold">Latence</th>
                <th className="py-3 px-3 font-bold">Détails & Diagnostic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850 font-sans">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-gray-500 font-mono">
                    Aucun log de synchronisation correspondant aux critères de filtre.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-900/60 transition group">
                    {/* Horodatage */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-400 whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>

                    {/* Tenant */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-xs">{log.tenantName}</span>
                        <span className="text-[9.5px] font-mono text-gray-500">{log.tenantId}</span>
                      </div>
                    </td>

                    {/* Collection */}
                    <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                      <span className="bg-gray-900 border border-gray-800 text-blue-300 px-2 py-0.5 rounded">
                        {log.collection}
                      </span>
                    </td>

                    {/* Opération */}
                    <td className="py-2.5 px-3 font-mono text-[10px] whitespace-nowrap font-bold">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          log.operation === 'CREATE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : log.operation === 'UPDATE'
                            ? 'bg-blue-500/20 text-blue-300'
                            : log.operation === 'DELETE'
                            ? 'bg-red-500/20 text-red-300'
                            : log.operation === 'BATCH'
                            ? 'bg-purple-500/20 text-purple-300'
                            : log.operation === 'REALTIME'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {log.operation}
                      </span>
                    </td>

                    {/* Statut */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {log.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                          <CheckCircle2 className="w-3 h-3" /> SUCCÈS
                        </span>
                      ) : log.status === 'ERROR' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-red-400 bg-red-500/15 px-2 py-0.5 rounded border border-red-500/30 font-bold">
                          <XCircle className="w-3 h-3" /> ERREUR
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 font-bold">
                          <Clock className="w-3 h-3" /> EN ATTENTE
                        </span>
                      )}
                    </td>

                    {/* Latence */}
                    <td className="py-2.5 px-3 font-mono text-[11px] text-gray-400 whitespace-nowrap">
                      {log.durationMs !== undefined ? `${log.durationMs}ms` : '--'}
                    </td>

                    {/* Diagnostic */}
                    <td className="py-2.5 px-3 text-xs">
                      {log.status === 'ERROR' ? (
                        <span className="text-red-400 font-mono text-[11px] font-bold block">
                          {log.errorMessage || log.details || 'Erreur inconnue'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-[11px] block truncate max-w-md" title={log.details}>
                          {log.details || `${log.recordsCount} enregistrement(s)`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
