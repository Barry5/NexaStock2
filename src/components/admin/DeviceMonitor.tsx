/**
 * Supervision des postes en temps réel (phase 4).
 * Source : `deviceStatus` et `syncEvents` (télémétrie centrale), aucune valeur simulée.
 */
import { useEffect, useMemo, useState } from 'react';
import { MonitorSmartphone, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context';
import { subscribeTelemetry } from '../../lib/telemetry';
import {
  computeSyncAlerts,
  summarizeDevicesByTenant,
  type DeviceStatusDoc,
  type SyncEventDoc,
} from '../../sync/monitoring';

function formatAge(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  if (ms < 60_000) return "à l'instant";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  if (ms < 172_800_000) return `${Math.round(ms / 3_600_000)} h`;
  return `${Math.round(ms / 86_400_000)} j`;
}

const SEVERITY_STYLE = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
} as const;

export default function DeviceMonitor() {
  const { scope } = useAuth();
  const [devices, setDevices] = useState<DeviceStatusDoc[]>([]);
  const [events, setEvents] = useState<SyncEventDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!scope) return;
    return subscribeTelemetry(scope, {
      onDevices: setDevices,
      onEvents: setEvents,
      onError: err => setError(err.code === 'failed-precondition'
        ? 'Index Firestore manquant : déployez firestore.indexes.json (firebase deploy --only firestore).'
        : (err.message || 'Télémétrie indisponible')),
    });
  }, [scope]);

  // Rafraîchit les âges (« il y a … ») chaque minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const alerts = useMemo(() => computeSyncAlerts(devices, events, now), [devices, events, now]);
  const byTenant = useMemo(() => summarizeDevicesByTenant(devices, now), [devices, now]);
  const sortedDevices = useMemo(
    () => [...devices].sort((a, b) => (b.dead - a.dead) || ((b.pending + b.sent) - (a.pending + a.sent)) || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))),
    [devices],
  );

  return (
    <div className="bg-gray-900 border border-gray-850 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <MonitorSmartphone className="w-4 h-4 text-blue-400" /> Postes et alertes (temps réel)
        </h3>
        <span className="text-[10px] font-mono text-gray-500">{devices.length} poste(s) · {events.length} événement(s) sur 24 h</span>
      </div>

      {error && <p className="text-xs text-amber-400">{error}</p>}

      <div className="space-y-2">
        {alerts.length === 0 && !error && (
          <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Aucune alerte dans le périmètre analysé.</p>
        )}
        {alerts.map(a => (
          <div key={a.id} className={`border rounded-xl p-3 text-xs ${SEVERITY_STYLE[a.severity]}`}>
            <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {a.title}{a.tenantId ? ` — boutique ${a.tenantId}` : ''}</p>
            <p className="opacity-90">{a.detail}</p>
          </div>
        ))}
      </div>

      {byTenant.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-mono uppercase text-gray-500 border-b border-gray-800">
                <th className="py-2 pr-3">Boutique</th>
                <th className="py-2 pr-3">Postes actifs (24 h)</th>
                <th className="py-2 pr-3">Non synchronisées</th>
                <th className="py-2 pr-3">File morte</th>
                <th className="py-2">Dernier signe de vie</th>
              </tr>
            </thead>
            <tbody>
              {byTenant.map(row => (
                <tr key={row.tenantId ?? 'global'} className="border-b border-gray-850 text-gray-300">
                  <td className="py-2 pr-3">{row.tenantName || row.tenantId || 'Super admin'}</td>
                  <td className="py-2 pr-3">{row.active} / {row.devices}</td>
                  <td className={`py-2 pr-3 ${row.pending > 0 ? 'text-amber-300' : ''}`}>{row.pending}</td>
                  <td className={`py-2 pr-3 ${row.dead > 0 ? 'text-red-400 font-bold' : ''}`}>{row.dead}</td>
                  <td className="py-2">{formatAge(row.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sortedDevices.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-white">Détail par poste</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full">
              <thead>
                <tr className="text-left text-[10px] font-mono uppercase text-gray-500 border-b border-gray-800">
                  <th className="py-2 pr-3">Utilisateur</th>
                  <th className="py-2 pr-3">Boutique</th>
                  <th className="py-2 pr-3">État</th>
                  <th className="py-2 pr-3">Attente / envoyées / mortes</th>
                  <th className="py-2 pr-3">Dernier accusé</th>
                  <th className="py-2 pr-3">Vu</th>
                  <th className="py-2">Version</th>
                </tr>
              </thead>
              <tbody>
                {sortedDevices.map(d => (
                  <tr key={d.id} className="border-b border-gray-850 text-gray-300">
                    <td className="py-2 pr-3">{d.userName || d.userId || '—'}</td>
                    <td className="py-2 pr-3">{d.tenantName || d.tenantId || '—'}</td>
                    <td className="py-2 pr-3">{d.connectionState || (d.online ? 'online' : 'offline')}{d.persistence === false ? ' · sans cache' : ''}</td>
                    <td className="py-2 pr-3 font-mono">{d.pending} / {d.sent} / <span className={d.dead > 0 ? 'text-red-400 font-bold' : ''}>{d.dead}</span></td>
                    <td className="py-2 pr-3">{formatAge(d.lastAckAt)}{d.avgAckMs ? ` (${(d.avgAckMs / 1000).toFixed(1)} s)` : ''}</td>
                    <td className="py-2 pr-3">{formatAge(d.lastSeenAt)}</td>
                    <td className="py-2 font-mono">{d.appVersion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {events.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 hover:text-white">Derniers événements de synchronisation</summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-gray-400">
            {events.slice(0, 50).map(e => (
              <li key={e.id}>
                {e.createdAt ? new Date(e.createdAt).toLocaleString('fr-FR') : '—'} · {e.type} · {e.table || ''}{e.recordId ? `/${e.recordId}` : ''} · {e.tenantId || 'global'}{e.error ? ` · ${e.error}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
