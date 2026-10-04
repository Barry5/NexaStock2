import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSyncAlerts,
  summarizeDevicesByTenant,
  shouldPublishDeviceStatus,
  type DeviceStatusDoc,
  type SyncEventDoc,
} from '../../src/sync/monitoring.ts';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const H = 3_600_000;

const device = (over: Partial<DeviceStatusDoc>): DeviceStatusDoc => ({
  id: 'dev-000000000001', tenantId: 't1', userId: 'u1', userName: 'Awa',
  lastSeenAt: iso(60_000), online: true, pending: 0, sent: 0, dead: 0, oldestPendingAt: null, persistence: true,
  ...over,
});

test('poste sain : aucune alerte', () => {
  assert.deepEqual(computeSyncAlerts([device({})], [], NOW), []);
});

test('file morte : alerte critique', () => {
  const [a] = computeSyncAlerts([device({ dead: 2 })], [], NOW);
  assert.equal(a.severity, 'critical');
  assert.match(a.title, /2 opération/);
});

test('poste muet 30 h avec ventes non synchronisées : critique', () => {
  const alerts = computeSyncAlerts([device({ lastSeenAt: iso(30 * H), pending: 5 })], [], NOW);
  assert.equal(alerts[0].severity, 'critical');
  assert.match(alerts[0].title, /30 h/);
});

test('poste muet sans données en attente : simple information', () => {
  const alerts = computeSyncAlerts([device({ lastSeenAt: iso(72 * H) })], [], NOW);
  assert.equal(alerts[0].severity, 'info');
});

test('synchronisation bloquée alors que le poste est en ligne : avertissement', () => {
  const alerts = computeSyncAlerts([device({ sent: 3, oldestSentAt: iso(2 * H) })], [], NOW);
  assert.equal(alerts[0].severity, 'warning');
  assert.match(alerts[0].title, /bloquée/);
});

test('refus des règles regroupés par boutique, événements anciens ignorés', () => {
  const ev = (id: string, msAgo: number): SyncEventDoc => ({ id, type: 'permission_denied', tenantId: 't1', deviceId: 'd', userId: 'u', table: 'products', createdAt: iso(msAgo) });
  const alerts = computeSyncAlerts([], [ev('a', H), ev('b', 2 * H), ev('c', 48 * H)], NOW);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /^2 refus/);
});

test('tri : critique avant avertissement avant information', () => {
  const alerts = computeSyncAlerts([
    device({ id: 'a', lastSeenAt: iso(72 * H) }),
    device({ id: 'b', persistence: false }),
    device({ id: 'c', dead: 1 }),
  ], [], NOW);
  assert.deepEqual(alerts.map(a => a.severity), ['critical', 'warning', 'info']);
});

test('synthèse par boutique', () => {
  const rows = summarizeDevicesByTenant([
    device({ id: 'a', pending: 2 }),
    device({ id: 'b', dead: 1, lastSeenAt: iso(50 * H) }),
    device({ id: 'c', tenantId: 't2' }),
  ], NOW);
  const t1 = rows.find(r => r.tenantId === 't1')!;
  assert.equal(t1.devices, 2);
  assert.equal(t1.active, 1);
  assert.equal(t1.dead, 1);
  assert.equal(rows[0].tenantId, 't1');
});

test('publication de l\'état du poste : changement significatif ou battement de cœur', () => {
  const base = { pending: 0, sent: 0, dead: 0, online: true };
  assert.equal(shouldPublishDeviceStatus(null, base, null, NOW), true);
  assert.equal(shouldPublishDeviceStatus(base, { ...base, pending: 1 }, NOW - 1000, NOW), true);
  assert.equal(shouldPublishDeviceStatus({ ...base, pending: 1 }, { ...base, pending: 2 }, NOW - 1000, NOW), false);
  assert.equal(shouldPublishDeviceStatus(base, base, NOW - 6 * 60_000, NOW), true);
});
