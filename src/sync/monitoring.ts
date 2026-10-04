/**
 * Observabilité de la synchronisation (phase 4) — calcul des alertes.
 *
 * Module PUR (aucune dépendance Firebase) : testable avec `node --test`.
 * Données d'entrée :
 *  - `deviceStatus/{deviceId}` : état publié périodiquement par chaque poste ;
 *  - `syncEvents/{id}` : événements d'erreur (file morte, refus des règles, conflits…).
 */

export interface DeviceStatusDoc {
  id: string; // `${deviceId}_${uid}`
  deviceId?: string;
  tenantId: string | null;
  tenantName?: string;
  userId: string | null;
  userName?: string;
  lastSeenAt: string | null; // ISO (serverTimestamp converti)
  online: boolean;
  connectionState?: 'online' | 'offline' | 'degraded';
  pending: number;
  sent: number;
  dead: number;
  oldestPendingAt: string | null;
  oldestSentAt?: string | null;
  lastAckAt?: string | null;
  avgAckMs?: number | null;
  persistence?: boolean;
  appVersion?: string;
}

export type SyncEventType =
  | 'dead_letter'
  | 'retry_scheduled'
  | 'permission_denied'
  | 'listener_error'
  | 'quarantine'
  | 'manual_discard'
  | 'manual_retry';

export interface SyncEventDoc {
  id: string;
  type: SyncEventType;
  tenantId: string | null;
  deviceId: string;
  userId: string | null;
  table?: string;
  recordId?: string;
  operationId?: string;
  attempts?: number;
  error?: string;
  createdAt: string | null; // ISO
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface SyncAlert {
  id: string;
  severity: AlertSeverity;
  tenantId: string | null;
  deviceId?: string;
  title: string;
  detail: string;
}

export interface AlertThresholds {
  /** Poste considéré hors ligne au-delà de ce délai sans signe de vie. */
  offlineHours: number;
  /** Opération en attente depuis trop longtemps alors que le poste est en ligne. */
  stalePendingMinutes: number;
  /** Fenêtre d'analyse des événements. */
  eventWindowHours: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  offlineHours: 24,
  stalePendingMinutes: 30,
  eventWindowHours: 24,
};

const HOUR = 3_600_000;
const MINUTE = 60_000;

function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? now - t : null;
}

function formatDuration(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < 48 * HOUR) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / (24 * HOUR))} j`;
}

function deviceLabel(d: DeviceStatusDoc): string {
  const who = d.userName || d.userId || 'utilisateur inconnu';
  return `${who} (poste ${(d.deviceId || d.id).replace(/_.*$/, '').slice(-6)})`;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Calcule les alertes à afficher, de la plus grave à la moins grave.
 */
export function computeSyncAlerts(
  devices: DeviceStatusDoc[],
  events: SyncEventDoc[],
  nowMs: number = Date.now(),
  thresholds: AlertThresholds = DEFAULT_THRESHOLDS,
): SyncAlert[] {
  const alerts: SyncAlert[] = [];

  for (const d of devices) {
    const silent = ageMs(d.lastSeenAt, nowMs);
    const unsynced = (d.pending || 0) + (d.sent || 0);

    if ((d.dead || 0) > 0) {
      alerts.push({
        id: `dead:${d.id}`,
        severity: 'critical',
        tenantId: d.tenantId,
        deviceId: d.id,
        title: `${d.dead} opération(s) en file morte`,
        detail: `${deviceLabel(d)} : des modifications ont été refusées et ne seront pas envoyées sans intervention (rejouer ou abandonner).`,
      });
    }

    if (silent !== null && silent > thresholds.offlineHours * HOUR) {
      alerts.push({
        id: `offline:${d.id}`,
        severity: unsynced > 0 ? 'critical' : 'info',
        tenantId: d.tenantId,
        deviceId: d.id,
        title: unsynced > 0
          ? `Poste muet depuis ${formatDuration(silent)} avec ${unsynced} opération(s) non synchronisée(s)`
          : `Poste muet depuis ${formatDuration(silent)}`,
        detail: unsynced > 0
          ? `${deviceLabel(d)} : des ventes ou modifications n'existent que sur ce poste. Le reconnecter dès que possible.`
          : `${deviceLabel(d)} : aucune donnée en attente lors du dernier signe de vie.`,
      });
      continue; // les autres contrôles supposent un poste actif
    }

    const pendingAge = ageMs(d.oldestPendingAt, nowMs);
    const sentAge = ageMs(d.oldestSentAt ?? null, nowMs);
    const oldest = Math.max(pendingAge ?? 0, sentAge ?? 0);
    if (d.online && unsynced > 0 && oldest > thresholds.stalePendingMinutes * MINUTE) {
      alerts.push({
        id: `stale:${d.id}`,
        severity: 'warning',
        tenantId: d.tenantId,
        deviceId: d.id,
        title: `Synchronisation bloquée depuis ${formatDuration(oldest)}`,
        detail: `${deviceLabel(d)} : ${unsynced} opération(s) en attente alors que le poste se déclare en ligne (serveur injoignable ou connexion dégradée).`,
      });
    }

    if (d.persistence === false) {
      alerts.push({
        id: `nopersist:${d.id}`,
        severity: 'warning',
        tenantId: d.tenantId,
        deviceId: d.id,
        title: 'Stockage hors ligne limité',
        detail: `${deviceLabel(d)} : le navigateur refuse le stockage persistant (navigation privée ?). Un rechargement hors ligne peut faire perdre des données.`,
      });
    }
  }

  // Refus des règles et erreurs d'écoute, regroupés par boutique sur la fenêtre d'analyse.
  const recent = events.filter(e => {
    const age = ageMs(e.createdAt, nowMs);
    return age !== null && age <= thresholds.eventWindowHours * HOUR;
  });
  const deniedByTenant = new Map<string, SyncEventDoc[]>();
  for (const e of recent) {
    if (e.type !== 'permission_denied' && e.type !== 'listener_error') continue;
    const key = e.tenantId ?? 'global';
    deniedByTenant.set(key, [...(deniedByTenant.get(key) || []), e]);
  }
  for (const [tenantKey, list] of deniedByTenant) {
    const tables = Array.from(new Set(list.map(e => e.table).filter(Boolean))).slice(0, 5).join(', ');
    alerts.push({
      id: `denied:${tenantKey}`,
      severity: 'warning',
      tenantId: tenantKey === 'global' ? null : tenantKey,
      title: `${list.length} refus des règles de sécurité en ${thresholds.eventWindowHours} h`,
      detail: `Collections concernées : ${tables || 'non précisé'}. Vérifier les rôles des utilisateurs ou les données sans tenantId.`,
    });
  }

  const quarantined = recent.filter(e => e.type === 'quarantine');
  if (quarantined.length > 0) {
    alerts.push({
      id: 'quarantine',
      severity: 'info',
      tenantId: quarantined[0].tenantId,
      title: `${quarantined.length} enregistrement(s) mis en quarantaine`,
      detail: 'Anciens enregistrements locaux absents du serveur : à examiner dans la collection syncQuarantine.',
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Synthèse par boutique pour la console super admin. */
export function summarizeDevicesByTenant(devices: DeviceStatusDoc[], nowMs: number = Date.now(), offlineHours = 24) {
  const byTenant = new Map<string, { tenantId: string | null; tenantName?: string; devices: number; active: number; pending: number; dead: number; lastSeenAt: string | null }>();
  for (const d of devices) {
    const key = d.tenantId ?? 'global';
    const entry = byTenant.get(key) || { tenantId: d.tenantId, tenantName: d.tenantName, devices: 0, active: 0, pending: 0, dead: 0, lastSeenAt: null };
    entry.devices += 1;
    const age = ageMs(d.lastSeenAt, nowMs);
    if (age !== null && age <= offlineHours * HOUR) entry.active += 1;
    entry.pending += (d.pending || 0) + (d.sent || 0);
    entry.dead += d.dead || 0;
    if (d.lastSeenAt && (!entry.lastSeenAt || d.lastSeenAt > entry.lastSeenAt)) entry.lastSeenAt = d.lastSeenAt;
    if (!entry.tenantName && d.tenantName) entry.tenantName = d.tenantName;
    byTenant.set(key, entry);
  }
  return Array.from(byTenant.values()).sort((a, b) => b.dead - a.dead || b.pending - a.pending);
}

/** Faut-il republier l'état du poste ? (changement significatif ou délai écoulé) */
export function shouldPublishDeviceStatus(
  previous: Pick<DeviceStatusDoc, 'pending' | 'sent' | 'dead' | 'online'> | null,
  next: Pick<DeviceStatusDoc, 'pending' | 'sent' | 'dead' | 'online'>,
  lastPublishedMs: number | null,
  nowMs: number,
  heartbeatMs = 5 * MINUTE,
): boolean {
  if (!previous || lastPublishedMs === null) return true;
  if (previous.dead !== next.dead || previous.online !== next.online) return true;
  const wasEmpty = previous.pending + previous.sent === 0;
  const isEmpty = next.pending + next.sent === 0;
  if (wasEmpty !== isEmpty) return true;
  return nowMs - lastPublishedMs >= heartbeatMs;
}
