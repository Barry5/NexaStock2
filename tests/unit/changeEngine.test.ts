/**
 * Tests du moteur de changements (aucune dépendance : `node --experimental-strip-types --test`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRecordChanges,
  applyChangesToState,
  buildSoftDelete,
  diffRecord,
} from '../../src/sync/changeEngine.ts';

const NOW = '2026-10-03T10:00:00.000Z';

test('création : tous les champs, tenantId ajouté, mot de passe jamais envoyé', () => {
  const prev = { users: [] };
  const next = { users: [{ id: 'u1', name: 'A', password: 'secret', tenantId: 't1' }] };
  const [c] = extractRecordChanges(prev, next, ['users'], 't1');
  assert.equal(c.operation, 'CREATE');
  assert.equal(c.fields.password, undefined);
  assert.deepEqual(c.fields.name, { kind: 'set', value: 'A' });
});

test('SYNC-05 : un enregistrement absent du nouvel état n\'est jamais supprimé', () => {
  const p1 = { id: 'p1', tenantId: 't1', quantity: 5 };
  const p2 = { id: 'p2', tenantId: 't1', quantity: 3 };
  const changes = extractRecordChanges({ products: [p1, p2] }, { products: [p1] }, ['products'], 't1');
  assert.equal(changes.length, 0);
});

test('SYNC-02 : le stock est envoyé en incrément', () => {
  const before = { id: 'p1', tenantId: 't1', quantity: 10, price: 5 };
  const after = { ...before, quantity: 8 };
  const c = diffRecord('products', before, after, 't1')!;
  assert.deepEqual(c.fields.quantity, { kind: 'increment', by: -2 });
  assert.equal(c.fields.price, undefined, 'seuls les champs modifiés sont envoyés');
  assert.deepEqual(c.fields.tenantId, { kind: 'set', value: 't1' });
});

test('SYNC-02 : deux ventes concurrentes s\'additionnent', () => {
  const server = { products: [{ id: 'p1', tenantId: 't1', quantity: 10 }] };
  const base = server.products[0];
  const caisseA = diffRecord('products', base, { ...base, quantity: 8 }, 't1')!;
  const caisseB = diffRecord('products', base, { ...base, quantity: 9 }, 't1')!;
  const final = applyChangesToState(applyChangesToState(server, [caisseA], NOW), [caisseB], NOW);
  assert.equal((final.products[0] as { quantity: number }).quantity, 7);
});

test('paiements ajoutés en arrayUnion : deux encaissements concurrents conservés', () => {
  const sale = { id: 's1', tenantId: 't1', payments: [{ id: 'pay1', amount: 10 }] };
  const a = diffRecord('sales', sale, { ...sale, payments: [...sale.payments, { id: 'pay2', amount: 5 }] }, 't1')!;
  const b = diffRecord('sales', sale, { ...sale, payments: [...sale.payments, { id: 'pay3', amount: 7 }] }, 't1')!;
  assert.equal(a.fields.payments.kind, 'arrayUnion');
  const final = applyChangesToState({ sales: [sale] }, [a, b], NOW);
  assert.equal((final.sales[0] as { payments: unknown[] }).payments.length, 3);
});

test('objet d\'un état antérieur non modifié : ignoré (pas de retour arrière)', () => {
  const old = { id: 'p1', tenantId: 't1', quantity: 10 };
  const current = { id: 'p1', tenantId: 't1', quantity: 7 }; // reçu d'un autre poste
  const known = new WeakSet<object>([old, current]);
  const changes = extractRecordChanges(
    { products: [current] },
    { products: [old] },
    ['products'],
    't1',
    r => known.has(r),
  );
  assert.equal(changes.length, 0);
});

test('applyChangesToState conserve les mises à jour concurrentes d\'autres enregistrements', () => {
  const state = { products: [{ id: 'p1', quantity: 1 }, { id: 'p2', quantity: 2 }] };
  const change = diffRecord('products', state.products[0], { ...state.products[0], quantity: 0 }, 't1')!;
  const remoteUpdated = { products: [state.products[0], { id: 'p2', quantity: 50 }] };
  const result = applyChangesToState(remoteUpdated, [change], NOW);
  assert.equal((result.products[1] as { quantity: number }).quantity, 50);
  assert.equal((result.products[0] as { quantity: number }).quantity, 0);
});

test('suppression logique explicite', () => {
  const del = buildSoftDelete('customers', 'c1', 't1');
  assert.equal(del.operation, 'SOFT_DELETE');
  const res = applyChangesToState({ customers: [{ id: 'c1' }, { id: 'c2' }] }, [del], NOW);
  assert.deepEqual(res.customers, [{ id: 'c2' }]);
});

test('objet connu d\'un enregistrement supprimé depuis : jamais recréé', () => {
  const deletedMeanwhile = { id: 'c1', tenantId: 't1', name: 'X' };
  const known = new WeakSet<object>([deletedMeanwhile]);
  const changes = extractRecordChanges({ customers: [] }, { customers: [deletedMeanwhile] }, ['customers'], 't1', r => known.has(r));
  assert.equal(changes.length, 0);
});
