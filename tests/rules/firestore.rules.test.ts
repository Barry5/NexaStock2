/**
 * Tests des règles Firestore (T-01 à T-03 du plan de tests, + idempotence des incréments).
 *
 * Prérequis (une fois) :
 *   npm install -D vitest @firebase/rules-unit-testing firebase-tools
 * Exécution (lance l'émulateur Firestore puis les tests) :
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch, increment } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'nexastock-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/tA'), { name: 'Boutique A', subscriptionStatus: 'ACTIVE', plan: 'Standard' });
    await setDoc(doc(db, 'tenants/tB'), { name: 'Boutique B', subscriptionStatus: 'ACTIVE', plan: 'Standard' });
    await setDoc(doc(db, 'users/uA-owner'), { tenantId: 'tA', role: 'owner', email: 'owner@a.test', active: true });
    await setDoc(doc(db, 'users/uA-vendeur'), { tenantId: 'tA', role: 'vendeur', email: 'vendeur@a.test', active: true });
    await setDoc(doc(db, 'users/uB-owner'), { tenantId: 'tB', role: 'owner', email: 'owner@b.test', active: true });
    await setDoc(doc(db, 'users/uRoot'), { tenantId: null, role: 'superadmin', email: 'root@test', active: true });
    await setDoc(doc(db, 'authLinks/authA'), { userId: 'uA-owner', tenantId: 'tA', email: 'owner@a.test' });
    await setDoc(doc(db, 'authLinks/authAv'), { userId: 'uA-vendeur', tenantId: 'tA', email: 'vendeur@a.test' });
    await setDoc(doc(db, 'authLinks/authB'), { userId: 'uB-owner', tenantId: 'tB', email: 'owner@b.test' });
    await setDoc(doc(db, 'authLinks/authRoot'), { userId: 'uRoot', tenantId: null, email: 'root@test' });
    await setDoc(doc(db, 'products/pA'), { tenantId: 'tA', name: 'Produit A', quantity: 10 });
    await setDoc(doc(db, 'products/pB'), { tenantId: 'tB', name: 'Produit B', quantity: 5 });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email }).firestore();

describe('T-01 : client non authentifié', () => {
  it('ne lit pas les utilisateurs', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/uA-owner')));
  });
  it('n\'écrit pas de vente', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'sales/s1'), { tenantId: 'tA', total: 1 }));
  });
  it('lit la grille tarifaire (page d\'inscription)', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'pricingPlans/plan-free')));
  });
});

describe('T-02 : isolation entre boutiques', () => {
  it('A lit ses produits via une requête filtrée', async () => {
    await assertSucceeds(getDocs(query(collection(as('authA', 'owner@a.test'), 'products'), where('tenantId', '==', 'tA'))));
  });
  it('A ne lit pas le produit de B', async () => {
    await assertFails(getDoc(doc(as('authA', 'owner@a.test'), 'products/pB')));
  });
  it('A ne liste pas toute la collection', async () => {
    await assertFails(getDocs(collection(as('authA', 'owner@a.test'), 'products')));
  });
  it('A ne crée pas de document chez B', async () => {
    await assertFails(setDoc(doc(as('authA', 'owner@a.test'), 'customers/c1'), { tenantId: 'tB', name: 'x' }));
  });
  it('A ne déplace pas un document vers B', async () => {
    await assertFails(updateDoc(doc(as('authA', 'owner@a.test'), 'products/pA'), { tenantId: 'tB' }));
  });
  it('le super admin lit tout', async () => {
    await assertSucceeds(getDocs(collection(as('authRoot', 'root@test'), 'products')));
  });
});

describe('T-03 : opérations sensibles', () => {
  it('aucune suppression physique par une boutique', async () => {
    await assertFails(deleteDoc(doc(as('authA', 'owner@a.test'), 'products/pA')));
  });
  it('un vendeur ne fait pas de suppression logique', async () => {
    await assertFails(updateDoc(doc(as('authAv', 'vendeur@a.test'), 'products/pA'), { deletedAt: new Date() }));
  });
  it('le propriétaire fait une suppression logique', async () => {
    await assertSucceeds(updateDoc(doc(as('authA', 'owner@a.test'), 'products/pA'), { deletedAt: new Date(), tenantId: 'tA' }));
  });
  it('une boutique ne réactive pas son abonnement', async () => {
    await assertFails(updateDoc(doc(as('authA', 'owner@a.test'), 'tenants/tA'), { subscriptionStatus: 'ACTIVE', plan: 'Premium' }));
  });
  it('une boutique déclare un paiement (statut PENDING)', async () => {
    await assertSucceeds(updateDoc(doc(as('authAv', 'vendeur@a.test'), 'tenants/tA'), { subscriptionStatus: 'PENDING' }));
  });
  it('un vendeur ne change pas son propre rôle', async () => {
    await assertFails(updateDoc(doc(as('authAv', 'vendeur@a.test'), 'users/uA-vendeur'), { role: 'owner' }));
  });
  it('aucun mot de passe dans une fiche utilisateur', async () => {
    await assertFails(updateDoc(doc(as('authA', 'owner@a.test'), 'users/uA-vendeur'), { password: 'x' }));
  });
  it('un administrateur de boutique ne crée pas de super admin', async () => {
    await assertFails(setDoc(doc(as('authA', 'owner@a.test'), 'users/u-new'), { tenantId: 'tA', role: 'superadmin', email: 'x@a.test' }));
  });
  it('le journal d\'audit est en ajout seul', async () => {
    const db = as('authA', 'owner@a.test');
    await assertSucceeds(setDoc(doc(db, 'auditLogs/a1'), { tenantId: 'tA', action: 'TEST' }));
    await assertFails(updateDoc(doc(db, 'auditLogs/a1'), { action: 'MODIFIE' }));
  });
});

describe('Idempotence des incréments (inbox operations/{opId})', () => {
  it('un renvoi de la même opération est refusé', async () => {
    const db = as('authA', 'owner@a.test');
    const send = () => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'products/pA'), { quantity: increment(-2), tenantId: 'tA' }, { merge: true });
      batch.set(doc(db, 'operations/op-1'), { tenantId: 'tA', table: 'products', recordId: 'pA' });
      return batch.commit();
    };
    await assertSucceeds(send());
    await assertFails(send());
  });
});

describe('Inscription d\'une nouvelle boutique', () => {
  it('compte neuf : boutique + fiche propriétaire + lien en un lot', async () => {
    const db = as('authNew', 'new@c.test');
    const batch = writeBatch(db);
    batch.set(doc(db, 'tenants/tC'), { name: 'C', subscriptionStatus: 'TRIAL', plan: 'Free' });
    batch.set(doc(db, 'users/uC'), { tenantId: 'tC', role: 'owner', email: 'new@c.test', active: true });
    batch.set(doc(db, 'authLinks/authNew'), { userId: 'uC', tenantId: 'tC', email: 'new@c.test' });
    await assertSucceeds(batch.commit());
  });
  it('impossible de se rattacher à une boutique existante', async () => {
    const db = as('authEvil', 'evil@x.test');
    const batch = writeBatch(db);
    batch.set(doc(db, 'users/uEvil'), { tenantId: 'tA', role: 'owner', email: 'evil@x.test', active: true });
    batch.set(doc(db, 'authLinks/authEvil'), { userId: 'uEvil', tenantId: 'tA', email: 'evil@x.test' });
    await assertFails(batch.commit());
  });
});

describe('Phase 4 : télémétrie', () => {
  it('un poste publie son état pour sa boutique', async () => {
    const db = as('authAv', 'vendeur@a.test');
    await assertSucceeds(setDoc(doc(db, 'deviceStatus/dev1_authAv'), { uid: 'authAv', tenantId: 'tA', pending: 0, sent: 0, dead: 0 }));
  });
  it('un poste ne publie pas pour une autre boutique ni pour un autre compte', async () => {
    const db = as('authAv', 'vendeur@a.test');
    await assertFails(setDoc(doc(db, 'deviceStatus/dev1_x'), { uid: 'authAv', tenantId: 'tB', pending: 0 }));
    await assertFails(setDoc(doc(db, 'deviceStatus/dev1_y'), { uid: 'autre', tenantId: 'tA', pending: 0 }));
  });
  it('un vendeur ne lit pas la télémétrie ; le propriétaire lit celle de sa boutique', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'deviceStatus/devA_authAv'), { uid: 'authAv', tenantId: 'tA', pending: 1 });
    });
    await assertFails(getDoc(doc(as('authAv', 'vendeur@a.test'), 'deviceStatus/devA_authAv')));
    await assertSucceeds(getDoc(doc(as('authA', 'owner@a.test'), 'deviceStatus/devA_authAv')));
    await assertFails(getDoc(doc(as('authB', 'owner@b.test'), 'deviceStatus/devA_authAv')));
  });
  it('les événements de synchronisation sont en ajout seul', async () => {
    const db = as('authAv', 'vendeur@a.test');
    await assertSucceeds(setDoc(doc(db, 'syncEvents/e1'), { uid: 'authAv', tenantId: 'tA', type: 'dead_letter' }));
    await assertFails(updateDoc(doc(as('authA', 'owner@a.test'), 'syncEvents/e1'), { type: 'x' }));
  });
});
