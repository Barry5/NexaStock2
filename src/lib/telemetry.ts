/**
 * Télémétrie centrale de la synchronisation (phase 4 — observabilité).
 *
 *  - `deviceStatus/{deviceId}` : état de chaque poste (file locale, connexion, dernier signe
 *    de vie), publié au plus toutes les 5 min ou à chaque changement significatif ;
 *  - `syncEvents/{id}` : événements d'erreur (file morte, refus des règles, quarantaine,
 *    actions manuelles), en ajout seul.
 *
 * Ces écritures passent directement par le SDK (pas par l'outbox) et leurs échecs sont
 * ignorés : la télémétrie ne doit jamais perturber l'application.
 */
import {
  collection,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase';
import { getDeviceId, newId } from './ids';
import { APP_VERSION } from './appVersion';
import { normalizeFirestoreValue, type SyncScope } from './firebaseSync';
import type { DeviceStatusDoc, SyncEventDoc, SyncEventType } from '../sync/monitoring';

export interface TelemetryActor {
  uid: string;
  userId: string | null;
  tenantId: string | null;
}

export async function publishDeviceStatus(
  actor: TelemetryActor,
  status: Omit<DeviceStatusDoc, 'id' | 'lastSeenAt' | 'tenantId' | 'userId' | 'appVersion'>,
): Promise<void> {
  try {
    // Un document par couple poste + compte (un même navigateur peut servir plusieurs utilisateurs).
    await setDoc(doc(db, 'deviceStatus', `${getDeviceId()}_${actor.uid}`), {
      ...status,
      deviceId: getDeviceId(),
      tenantId: actor.tenantId,
      userId: actor.userId,
      uid: actor.uid,
      appVersion: APP_VERSION,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      lastSeenAt: serverTimestamp(),
      clientSeenAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.debug('[TELEMETRIE] État du poste non publié :', (err as Error)?.message);
  }
}

export function recordSyncEvent(
  actor: TelemetryActor,
  event: { type: SyncEventType; table?: string; recordId?: string; operationId?: string; attempts?: number; error?: string; count?: number },
): void {
  const id = newId('evt');
  const payload: Record<string, unknown> = {
    ...event,
    error: event.error ? event.error.slice(0, 500) : undefined,
    tenantId: actor.tenantId,
    userId: actor.userId,
    uid: actor.uid,
    deviceId: getDeviceId(),
    appVersion: APP_VERSION,
    createdAt: serverTimestamp(),
    clientCreatedAt: new Date().toISOString(),
  };
  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
  // Non bloquant : hors ligne, l'écriture est conservée par le SDK et part au retour du réseau.
  setDoc(doc(db, 'syncEvents', id), payload).catch(err => {
    console.debug('[TELEMETRIE] Événement non enregistré :', (err as Error)?.message);
  });
}

/**
 * Écoute la télémétrie : tous les postes (super admin) ou ceux de la boutique (administrateur).
 */
export function subscribeTelemetry(
  scope: SyncScope,
  handlers: {
    onDevices: (devices: DeviceStatusDoc[]) => void;
    onEvents: (events: SyncEventDoc[]) => void;
    onError?: (err: { code?: string; message?: string }) => void;
  },
  eventWindowHours = 24,
): () => void {
  const tenantFilter: QueryConstraint[] = scope.isSuperAdmin ? [] : [where('tenantId', '==', scope.tenantId)];
  const since = Timestamp.fromMillis(Date.now() - eventWindowHours * 3_600_000);
  const onError = (err: { code?: string; message?: string }) => handlers.onError?.(err);

  const unsubDevices = onSnapshot(query(collection(db, 'deviceStatus'), ...tenantFilter), snap => {
    handlers.onDevices(snap.docs.map(d => ({ ...(normalizeFirestoreValue(d.data()) as Omit<DeviceStatusDoc, 'id'>), id: d.id })));
  }, onError);

  const unsubEvents = onSnapshot(
    query(collection(db, 'syncEvents'), ...tenantFilter, where('createdAt', '>=', since), orderBy('createdAt', 'desc'), limit(300)),
    snap => {
      handlers.onEvents(snap.docs.map(d => ({ ...(normalizeFirestoreValue(d.data()) as Omit<SyncEventDoc, 'id'>), id: d.id })));
    },
    onError,
  );

  return () => {
    unsubDevices();
    unsubEvents();
  };
}
