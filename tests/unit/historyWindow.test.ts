import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinceIsoFor, resolveWindows, mergeById, HISTORY_COLLECTIONS } from '../../src/sync/historyWindow.ts';

const NOW = new Date('2026-10-04T15:30:00.000Z');

test('fenêtre calée sur minuit UTC (stable sur la journée)', () => {
  assert.equal(sinceIsoFor(90, NOW), '2026-07-06T00:00:00.000Z');
  assert.equal(sinceIsoFor(90, new Date('2026-10-04T23:59:00.000Z')), '2026-07-06T00:00:00.000Z');
});

test('null ou 0 = historique complet', () => {
  assert.equal(sinceIsoFor(null, NOW), null);
  assert.equal(sinceIsoFor(0, NOW), null);
});

test('préférences : valeurs par défaut et historique complet par collection', () => {
  const w = resolveWindows({ sales: null }, NOW);
  assert.equal(w.sales, null);
  assert.equal(w.auditLogs, sinceIsoFor(HISTORY_COLLECTIONS.auditLogs.defaultDays, NOW));
});

test('fusion fenêtre + crédits ouverts sans doublon', () => {
  const merged = mergeById([
    [{ id: 's1', v: 1 }, { id: 's2', v: 1 }],
    [{ id: 's2', v: 2 }, { id: 's0', v: 2 }],
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(s => s.id === 's2')?.v, 2);
});

test('les dates ISO se comparent correctement en chaîne', () => {
  const since = sinceIsoFor(365, NOW)!;
  assert.ok('2026-01-15T10:00:00.000Z' >= since);
  assert.ok('2025-09-01T10:00:00.000Z' < since);
});
