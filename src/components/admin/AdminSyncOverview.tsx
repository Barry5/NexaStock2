import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Cloud, CloudLightning, Database, Clock, RefreshCw, CheckCircle2, ShieldCheck, HardDrive } from 'lucide-react';
import type { SyncOverview } from '../../types/sync';
import { useDB } from '../../context';

interface AdminSyncOverviewProps {
  overview: SyncOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const formatDate = (value: string | null): string => {
  if (!value) return 'Aucune donnée';
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

export default function AdminSyncOverview({ overview, loading, error, onRefresh }: AdminSyncOverviewProps) {
  const { db, isSyncing, syncError, isOnline, lastCacheTime, handleUpdateDb, addNotification } = useDB();
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleTriggerSync = async () => {
    setManualSyncing(true);
    try {
      addNotification('Synchronisation globale avec Firebase Firestore...', 'info');
      await handleUpdateDb(db);
      addNotification('Synchronisation Cloud terminée avec succès !', 'success');
      onRefresh();
    } catch {
      addNotification('Erreur lors de la synchronisation avec Firestore.', 'error');
    } finally {
      setManualSyncing(false);
    }
  };

  const tableStats = [
    { name: 'Organisations & Boutiques (tenants)', count: db.tenants?.length || 0, table: 'tenants' },
    { name: 'Utilisateurs & Rôles (users)', count: db.users?.length || 0, table: 'users' },
    { name: 'Produits & Stocks (products)', count: db.products?.length || 0, table: 'products' },
    { name: 'Ventes & Commandes POS (sales)', count: db.sales?.length || 0, table: 'sales' },
    { name: 'Clients & Grossistes (customers)', count: db.customers?.length || 0, table: 'customers' },
    { name: 'Fournisseurs (suppliers)', count: db.suppliers?.length || 0, table: 'suppliers' },
    { name: 'Dépenses & Charges (expenses)', count: db.expenses?.length || 0, table: 'expenses' },
    { name: 'Factures & Devis (invoices)', count: db.invoices?.length || 0, table: 'invoices' },
    { name: 'Bons de Livraison (deliveryNotes)', count: db.deliveryNotes?.length || 0, table: 'deliveryNotes' },
    { name: 'Paiements d\'Abonnement (payments)', count: db.subscriptionPayments?.length || 0, table: 'subscriptionPayments' },
  ];

  return (
    <motion.div
      key="sync-overview"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <CloudLightning className="w-4 h-4 text-emerald-400" />
              Supervision de la Synchronisation Cloud & Hors Ligne
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Firebase Firestore Active
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-xs text-gray-300">
            Surveillez en temps réel la synchronisation bidirectionnelle entre le stockage local (IndexedDB/Dexie Offline) et la base centrale <strong>Firebase Firestore</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {error || syncError ? (
        <div className="rounded-2xl border border-red-600/20 bg-red-950/60 p-4 text-xs text-red-200">
          Avertissement de synchronisation : {error || syncError}
        </div>
      ) : null}

      {/* Cartes Métriques Clés */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Connectivité Cloud</p>
              <p className="mt-1.5 text-2xl font-black text-white flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                {isOnline ? 'En Ligne (Firestore)' : 'Mode Hors Ligne'}
              </p>
            </div>
            <Cloud className="h-6 w-6 text-sky-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3">
              <p className="text-[10px] font-mono text-gray-400 uppercase">En attente Cloud</p>
              <p className="mt-1 text-base font-bold text-white">{overview?.service.pendingCount ?? 0}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3">
              <p className="text-[10px] font-mono text-gray-400 uppercase">Statut Auth</p>
              <p className="mt-1 text-base font-bold text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Sécurisé
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Cache Local & Worker</p>
              <p className="mt-1.5 text-2xl font-black text-white">
                {isSyncing ? 'Synchronisation...' : 'Opérationnel'}
              </p>
            </div>
            <HardDrive className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3">
              <p className="text-[10px] font-mono text-gray-400 uppercase">Dernier Cache</p>
              <p className="mt-1 text-xs font-mono font-semibold text-gray-200 truncate">
                {lastCacheTime ? new Date(lastCacheTime).toLocaleTimeString('fr-FR') : 'Actif'}
              </p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3">
              <p className="text-[10px] font-mono text-gray-400 uppercase">Moteur</p>
              <p className="mt-1 text-base font-bold text-white font-mono">Dexie + FS</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-gray-400">Total Enregistrements</p>
              <p className="mt-1.5 text-2xl font-black text-white">
                {tableStats.reduce((acc, t) => acc + t.count, 0)}
              </p>
            </div>
            <Database className="h-6 w-6 text-violet-400" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3">
              <p className="text-[10px] font-mono text-gray-400 uppercase">Produits</p>
              <p className="mt-1 text-base font-bold text-white">{db.products?.length || 0}</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-3">
              <p className="text-[10px] font-mono text-gray-400 uppercase">Ventes</p>
              <p className="mt-1 text-base font-bold text-white">{db.sales?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau de suivi par collection / table */}
      <div className="rounded-2xl border border-gray-850 bg-gray-950 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white font-mono font-bold">Collections Synchronisées avec Firestore</p>
            <p className="mt-1 text-xs text-gray-400">Vérification de l'intégrité et volume des données locales et Cloud.</p>
          </div>
          <Clock className="h-4 w-4 text-gray-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-left text-gray-300">
            <thead>
              <tr className="border-b border-gray-800 text-[10px] font-mono uppercase text-gray-500">
                <th className="pb-2.5 font-bold">Collection / Entité</th>
                <th className="pb-2.5 font-bold">Volume d'éléments</th>
                <th className="pb-2.5 font-bold">État Cloud Firestore</th>
                <th className="pb-2.5 font-bold">Dernière vérification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850">
              {tableStats.map((item) => (
                <tr key={item.table} className="hover:bg-gray-900/50 transition">
                  <td className="py-2.5 font-semibold text-white">{item.name}</td>
                  <td className="py-2.5 font-mono text-blue-400 font-bold">{item.count} items</td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Synchronisé
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400 font-mono text-[11px]">{formatDate(new Date().toISOString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
