#!/usr/bin/env node
/**
 * Migration phase 1 — comptes Firebase Auth, liens `authLinks`, nettoyage des données.
 *
 * À exécuter UNE fois, depuis un poste d'administration, AVANT de déployer les nouvelles
 * règles Firestore. Nécessite une clé de compte de service du projet Firebase
 * (Console Firebase > Paramètres du projet > Comptes de service > Générer une clé).
 *
 *   npm install --no-save firebase-admin
 *   node scripts/migrate-auth.mjs --credentials ./service-account.json            # simulation
 *   node scripts/migrate-auth.mjs --credentials ./service-account.json --apply    # écriture
 *
 * Ce que fait le script :
 *  1. pour chaque document `users` : crée (ou retrouve) le compte Firebase Auth de l'e-mail,
 *     avec un mot de passe ALÉATOIRE (les anciens mots de passe étaient lisibles publiquement
 *     à cause des règles ouvertes : ils sont considérés comme compromis) ;
 *  2. crée `authLinks/{uid}` = { userId, tenantId, email } ;
 *  3. supprime le champ `password` des fiches `users`, pose `authUid` et `firstLoginReset` ;
 *  4. génère un lien de réinitialisation par utilisateur dans migration-output/ (fichier
 *     SENSIBLE, ignoré par git) à transmettre à chaque utilisateur ;
 *  5. ajoute `tenantId` aux variantes (depuis le produit) et aux journaux de facture
 *     (depuis la facture) ;
 *  6. liste les documents métier sans `tenantId` (invisibles après migration, sauf super admin).
 *
 * Idempotent : peut être relancé sans dupliquer de compte ni de lien.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes('--apply');
const credentialsPath = arg('--credentials');
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const databaseId = arg('--database') || appConfig.firestoreDatabaseId || '(default)';

if (!credentialsPath) {
  console.error('Usage : node scripts/migrate-auth.mjs --credentials <service-account.json> [--apply] [--database <id>]');
  process.exit(1);
}

let admin;
try {
  admin = await import('firebase-admin');
} catch {
  console.error('Le paquet firebase-admin est requis : npm install --no-save firebase-admin');
  process.exit(1);
}
const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(credentialsPath), 'utf8'));
const app = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id || appConfig.projectId });
const auth = getAuth(app);
const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);

const BUSINESS_COLLECTIONS = [
  'products', 'sales', 'customers', 'suppliers', 'expenses', 'loans', 'warehouses', 'transfers',
  'variants', 'invoices', 'deliveryOrders', 'payments', 'returns', 'affiliates', 'commissionRules',
  'commissionLedger', 'commissionPayments', 'auditLogs', 'invoiceAuditLogs', 'deliveryNoteAudit',
  'commissionAudit', 'subscriptionPayments', 'subscriptionInvoices', 'tenantModules',
];

const randomPassword = () => crypto.randomBytes(18).toString('base64url');
const outDir = path.resolve(process.cwd(), 'migration-output');
const report = { mode: APPLY ? 'apply' : 'dry-run', databaseId, users: [], fixes: {}, orphans: {} };

console.log(`\n=== Migration NexaStock phase 1 (${APPLY ? 'ÉCRITURE' : 'SIMULATION'}) — base ${databaseId} ===\n`);

// 1-4. Comptes, liens, fiches utilisateurs
const usersSnap = await db.collection('users').get();
const resetLinks = [];
for (const docSnap of usersSnap.docs) {
  const u = docSnap.data();
  if (u.deletedAt) continue;
  const email = String(u.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    report.users.push({ userId: docSnap.id, status: 'ignoré : e-mail invalide' });
    continue;
  }
  const tenantId = u.role === 'superadmin' ? null : (u.tenantId || null);
  if (u.role !== 'superadmin' && !tenantId) {
    report.users.push({ userId: docSnap.id, email, status: 'ignoré : aucune boutique (tenantId) — à corriger manuellement' });
    continue;
  }
  let uid = null;
  let created = false;
  try {
    uid = (await auth.getUserByEmail(email)).uid;
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
  if (!uid && APPLY) {
    const rec = await auth.createUser({ email, password: randomPassword(), displayName: u.name || undefined, disabled: u.active === false });
    uid = rec.uid;
    created = true;
  }
  if (APPLY && uid) {
    const linkRef = db.collection('authLinks').doc(uid);
    const existing = await linkRef.get();
    if (existing.exists && existing.data().userId !== docSnap.id) {
      report.users.push({ userId: docSnap.id, email, uid, status: `CONFLIT : ce compte Auth est déjà lié à ${existing.data().userId}` });
      continue;
    }
    await linkRef.set({ userId: docSnap.id, tenantId, email, migratedAt: FieldValue.serverTimestamp() });
    await docSnap.ref.update({ password: FieldValue.delete(), authUid: uid, firstLoginReset: true, email });
    try {
      resetLinks.push({ email, name: u.name || '', role: u.role, link: await auth.generatePasswordResetLink(email) });
    } catch (err) {
      resetLinks.push({ email, name: u.name || '', role: u.role, link: `ERREUR: ${err?.message}` });
    }
  }
  report.users.push({
    userId: docSnap.id, email, role: u.role, tenantId,
    status: APPLY ? (created ? 'compte créé + lien' : 'compte existant + lien') : (uid ? 'compte existant (à lier)' : 'compte à créer'),
    hadPlaintextPassword: Boolean(u.password),
  });
}

// 5. tenantId manquant sur les variantes et les journaux de facture
async function backfill(collectionName, parentCollection, parentField) {
  const snap = await db.collection(collectionName).get();
  let fixed = 0;
  let missingParent = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.tenantId) continue;
    const parentId = data[parentField];
    if (!parentId) { missingParent++; continue; }
    const parent = await db.collection(parentCollection).doc(String(parentId)).get();
    const tenantId = parent.exists ? parent.data().tenantId : null;
    if (!tenantId) { missingParent++; continue; }
    if (APPLY) await d.ref.update({ tenantId });
    fixed++;
  }
  report.fixes[collectionName] = { fixed, unresolved: missingParent };
}
await backfill('variants', 'products', 'productId');
await backfill('invoiceAuditLogs', 'invoices', 'invoiceId');

// 6. Documents métier sans boutique
for (const name of BUSINESS_COLLECTIONS) {
  const snap = await db.collection(name).get();
  const orphans = snap.docs.filter(d => !d.data().tenantId).map(d => d.id);
  if (orphans.length) report.orphans[name] = { count: orphans.length, sample: orphans.slice(0, 10) };
}

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(path.join(outDir, `report-${stamp}.json`), JSON.stringify(report, null, 2));
if (resetLinks.length) {
  const csv = ['email;nom;role;lien_reinitialisation', ...resetLinks.map(r => `${r.email};${r.name};${r.role};${r.link}`)].join('\n');
  fs.writeFileSync(path.join(outDir, `reset-links-${stamp}.csv`), csv, { mode: 0o600 });
}

console.log(`Utilisateurs traités : ${report.users.length}`);
for (const u of report.users) console.log(` - ${u.email || u.userId} : ${u.status}`);
console.log('Corrections tenantId :', JSON.stringify(report.fixes));
console.log('Documents sans tenantId :', Object.keys(report.orphans).length ? JSON.stringify(Object.fromEntries(Object.entries(report.orphans).map(([k, v]) => [k, v.count]))) : 'aucun');
console.log(`\nRapport : ${path.relative(process.cwd(), outDir)}/report-${stamp}.json`);
if (resetLinks.length) console.log(`Liens de réinitialisation (SENSIBLE, ne pas versionner) : migration-output/reset-links-${stamp}.csv`);
if (!APPLY) console.log('\nSimulation uniquement. Relancer avec --apply pour écrire.');
void admin;
