/**
 * État de la synchronisation (phase 4 — observabilité).
 *
 * Affiche des valeurs RÉELLES : file locale (en attente, envoyées sans accusé, file morte),
 * état de la connexion, dernier accusé du serveur, historique chargé, et — pour les
 * administrateurs — les alertes de la boutique calculées à partir de la télémétrie centrale.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, CloudOff, Activity, RotateCcw, Trash2, History } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { useDB, useApp, useAuth } from '../../context';
import { firestorePersistenceEnabled } from '../../lib/firebase';
import type { OutboxEntry } from '../../lib/syncQueue';
import { HISTORY_COLLECTIONS } from '../../sync/historyWindow';
import { subscribeTelemetry } from '../../lib/telemetry';
import { computeSyncAlerts, type DeviceStatusDoc, type SyncEventDoc, type SyncAlert } from '../../sync/monitoring';

interface SyncStatusPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const HISTORY_OPTIONS: Array<{ label: string; days: number | null }> = [
  { label: '90 jours', days: 90 },
  { label: '6 mois', days: 180 },
  { label: '1 an', days: 365 },
  { label: '2 ans', days: 730 },
  { label: 'Tout', days: null },
];

function formatAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < 60_000) return "à l'instant";
  if (ms < 3_600_000) return `il y a ${Math.round(ms / 60_000)} min`;
  if (ms < 172_800_000) return `il y a ${Math.round(ms / 3_600_000)} h`;
  return `il y a ${Math.round(ms / 86_400_000)} j`;
}

const SEVERITY_STYLE: Record<SyncAlert['severity'], string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

export function SyncStatusPanel({ isOpen, onClose }: SyncStatusPanelProps) {
  const {
    connectionState, outboxStats, isSyncing, handleSyncFromServer, addNotification,
    getDeadLetters, retryDeadLetter, discardDeadLetter, historyPreferences, historyWindows, setHistoryDays,
  } = useDB();
  const { activeUser } = useApp();
  const { scope } = useAuth();
  const [deadLetters, setDeadLetters] = useState<OutboxEntry[]>([]);
  const [devices, setDevices] = useState<DeviceStatusDoc[]>([]);
  const [events, setEvents] = useState<SyncEventDoc[]>([]);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  const isAdmin = activeUser?.role === 'superadmin' || activeUser?.role === 'owner' || activeUser?.role === 'admin';

  const reloadDead = useCallback(async () => {
    try { setDeadLetters(await getDeadLetters()); } catch { setDeadLetters([]); }
  }, [getDeadLetters]);

  useEffect(() => {
    if (isOpen) void reloadDead();
  }, [isOpen, reloadDead, outboxStats.dead]);

  // Télémétrie de la boutique (administrateurs uniquement : les règles l'imposent).
  useEffect(() => {
    if (!isOpen || !isAdmin || !scope) return;
    setTelemetryError(null);
    return subscribeTelemetry(scope, {
      onDevices: setDevices,
      onEvents: setEvents,
      onError: err => setTelemetryError(err.code === 'failed-precondition'
        ? 'Index Firestore manquant : déployez firestore.indexes.json.'
        : (err.message || 'Télémétrie indisponible.')),
    });
  }, [isOpen, isAdmin, scope]);

  const alerts = useMemo(() => computeSyncAlerts(
    scope?.isSuperAdmin ? devices : devices.filter(d => d.tenantId === scope?.tenantId),
    events,
  ), [devices, events, scope]);

  const handleSyncNow = async () => {
    const res = await handleSyncFromServer();
    if (res.dead > 0) addNotification(`${res.dead} opération(s) en file morte.`, 'error');
    else if (!res.acknowledged || res.pending > 0) addNotification(`${res.pending} opération(s) en attente du serveur.`, 'warning');
    else addNotification('Toutes les modifications sont confirmées par le serveur.', 'success');
    void reloadDead();
  };

  const handleRetry = async (entry: OutboxEntry) => {
    await retryDeadLetter(entry);
    addNotification('Opération remise en file.', 'info');
    void reloadDead();
  };

  const handleDiscard = async (entry: OutboxEntry) => {
    const ok = window.confirm(
      `Abandonner définitivement cette modification (${entry.change.table} / ${entry.change.recordId}) ? Elle ne sera jamais envoyée au serveur. L'abandon est tracé.`,
    );
    if (!ok) return;
    await discardDeadLetter(entry);
    addNotification('Opération abandonnée (tracée dans le journal de synchronisation).', 'warning');
    void reloadDead();
  };

  const stateInfo = {
    online: { label: 'Connecté', className: 'text-emerald-400', icon: <CheckCircle2 className="w-4 h-4" />, detail: 'Les modifications partent immédiatement vers le serveur.' },
    degraded: { label: 'Connexion dégradée', className: 'text-amber-400', icon: <Activity className="w-4 h-4" />, detail: "Le serveur n'a pas confirmé certaines modifications depuis plus d'une minute." },
    offline: { label: 'Hors ligne', className: 'text-amber-400', icon: <CloudOff className="w-4 h-4" />, detail: 'Les modifications sont conservées sur ce poste et partiront au retour du réseau.' },
  }[connectionState];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="État de la synchronisation" maxWidth="max-w-2xl">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1 text-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`flex items-center gap-1.5 font-bold text-sm ${stateInfo.className}`}>{stateInfo.icon} {stateInfo.label}</p>
            <p className="text-gray-400 mt-1">{stateInfo.detail}</p>
            {!firestorePersistenceEnabled && (
              <p className="text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Stockage hors ligne limité sur ce navigateur.</p>
            )}
          </div>
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} /> Synchroniser
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-500 font-mono uppercase text-[10px]">En attente</p>
            <p className="text-lg font-bold text-white">{outboxStats.pending}</p>
            <p className="text-gray-500">{outboxStats.oldestPendingAt ? `plus ancienne ${formatAge(outboxStats.oldestPendingAt)}` : 'aucune'}</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-500 font-mono uppercase text-[10px]">Sans accusé</p>
            <p className="text-lg font-bold text-white">{outboxStats.sent}</p>
            <p className="text-gray-500">{outboxStats.oldestSentAt ? `envoyée ${formatAge(outboxStats.oldestSentAt)}` : 'aucune'}</p>
          </div>
          <div className={`border rounded-xl p-3 ${outboxStats.dead > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-gray-950 border-gray-800'}`}>
            <p className="text-gray-500 font-mono uppercase text-[10px]">File morte</p>
            <p className={`text-lg font-bold ${outboxStats.dead > 0 ? 'text-red-400' : 'text-white'}`}>{outboxStats.dead}</p>
            <p className="text-gray-500">refusées par le serveur</p>
          </div>
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-3">
            <p className="text-gray-500 font-mono uppercase text-[10px]">Dernier accusé</p>
            <p className="text-sm font-bold text-white">{formatAge(outboxStats.lastAckAt)}</p>
            <p className="text-gray-500">{outboxStats.avgAckMs !== null ? `délai moyen ${(outboxStats.avgAckMs / 1000).toFixed(1)} s` : '—'}</p>
          </div>
        </div>

        {deadLetters.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-red-400 uppercase font-mono text-[11px]">Opérations en file morte</h4>
            {deadLetters.map(entry => (
              <div key={entry.id} className="bg-gray-950 border border-red-500/20 rounded-xl p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white font-semibold">{entry.change.operation} · {entry.change.table} / <span className="font-mono">{entry.change.recordId}</span></p>
                  <p className="text-gray-400 break-words">{entry.lastError || 'Erreur inconnue'}</p>
                  <p className="text-gray-500 font-mono text-[10px]">créée {formatAge(entry.createdAt)} · {entry.attempts} essai(s) · opération {entry.opId.slice(0, 8)}</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button onClick={() => handleRetry(entry)} title="Rejouer" className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200"><RotateCcw className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDiscard(entry)} title="Abandonner" className="p-2 rounded-lg bg-gray-800 hover:bg-red-500/20 text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="space-y-2">
            <h4 className="font-bold text-gray-300 uppercase font-mono text-[11px]">Alertes {scope?.isSuperAdmin ? 'de la plateforme' : 'de la boutique'} (24 h)</h4>
            {telemetryError && <p className="text-amber-400">{telemetryError}</p>}
            {!telemetryError && alerts.length === 0 && (
              <p className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Aucune alerte dans le périmètre analysé ({devices.length} poste(s) suivis).</p>
            )}
            {alerts.map(alert => (
              <div key={alert.id} className={`border rounded-xl p-3 ${SEVERITY_STYLE[alert.severity]}`}>
                <p className="font-bold">{alert.title}</p>
                <p className="opacity-90">{alert.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-bold text-gray-300 uppercase font-mono text-[11px] flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historique chargé sur ce poste</h4>
          <p className="text-gray-500">Les données plus anciennes restent sur le serveur ; elles se chargent à la demande (les rapports étendent automatiquement la période).</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(HISTORY_COLLECTIONS).map(([field, cfg]) => (
              <label key={field} className="flex items-center justify-between gap-2 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2">
                <span className="text-gray-300">{cfg.label}</span>
                <select
                  value={historyPreferences[field] === null ? 'all' : String(historyPreferences[field] ?? cfg.defaultDays)}
                  onChange={e => setHistoryDays(field, e.target.value === 'all' ? null : Number(e.target.value))}
                  className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-white"
                  title={historyWindows[field] ? `Depuis le ${historyWindows[field]!.slice(0, 10)}` : 'Historique complet'}
                >
                  {HISTORY_OPTIONS.map(o => (
                    <option key={o.label} value={o.days === null ? 'all' : String(o.days)}>{o.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default SyncStatusPanel;
