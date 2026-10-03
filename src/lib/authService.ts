/**
 * Authentification Firebase (SEC-02).
 *
 * Modèle retenu (phase 1) : Firebase Auth e-mail / mot de passe + document `authLinks/{uid}`
 * qui relie le compte Auth à la fiche `users/{userId}` et à la boutique (`tenantId`).
 * Les règles Firestore lisent ce lien pour borner chaque lecture / écriture à la boutique
 * de l'utilisateur. Le rôle reste porté par `users/{userId}.role`.
 *
 * Aucun mot de passe n'est plus stocké dans Firestore ni comparé dans le navigateur.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseConfig } from './firebase';
import type { Tenant, User, UserRole } from '../types';

export interface AuthLink {
  uid: string;
  userId: string;
  tenantId: string | null;
  email: string;
  role: UserRole | null;
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unlinked';

export interface AuthState {
  status: AuthStatus;
  uid: string | null;
  email: string | null;
  link: AuthLink | null;
}

const LINK_CACHE_PREFIX = 'nexastock_auth_link:';
export const MIN_PASSWORD_LENGTH = 8;

function readCachedLink(uid: string): AuthLink | null {
  try {
    const raw = localStorage.getItem(LINK_CACHE_PREFIX + uid);
    return raw ? (JSON.parse(raw) as AuthLink) : null;
  } catch {
    return null;
  }
}

function writeCachedLink(link: AuthLink) {
  try {
    localStorage.setItem(LINK_CACHE_PREFIX + link.uid, JSON.stringify(link));
  } catch { /* quota : non bloquant */ }
}

export function clearCachedLink(uid: string) {
  try { localStorage.removeItem(LINK_CACHE_PREFIX + uid); } catch { /* ignore */ }
}

/**
 * Lit le lien Auth -> utilisateur -> boutique. Hors ligne, le cache Firestore persistant
 * puis le cache local prennent le relais (démarrage hors ligne d'une session existante).
 */
export async function fetchAuthLink(uid: string): Promise<AuthLink | null> {
  try {
    const linkSnap = await getDoc(doc(db, 'authLinks', uid));
    if (!linkSnap.exists()) return null;
    const data = linkSnap.data() as { userId: string; tenantId: string | null; email: string };
    let role: UserRole | null = null;
    try {
      const userSnap = await getDoc(doc(db, 'users', data.userId));
      role = userSnap.exists() ? ((userSnap.data() as User).role ?? null) : null;
    } catch {
      role = readCachedLink(uid)?.role ?? null;
    }
    const link: AuthLink = { uid, userId: data.userId, tenantId: data.tenantId ?? null, email: data.email, role };
    writeCachedLink(link);
    return link;
  } catch (err) {
    const cached = readCachedLink(uid);
    if (cached) return cached;
    throw err;
  }
}

const authListeners = new Set<(state: AuthState) => void>();

let emitSequence = 0;

async function emitForUser(fbUser: FirebaseUser | null) {
  // Seule la dernière lecture lancée publie son résultat (évite qu'une lecture ancienne écrase une plus récente).
  const seq = ++emitSequence;
  const emit = (state: AuthState) => { if (seq === emitSequence) authListeners.forEach(cb => cb(state)); };
  if (!fbUser) {
    emit({ status: 'signedOut', uid: null, email: null, link: null });
    return;
  }
  emit({ status: 'loading', uid: fbUser.uid, email: fbUser.email, link: readCachedLink(fbUser.uid) });
  try {
    const link = await fetchAuthLink(fbUser.uid);
    emit({ status: link ? 'signedIn' : 'unlinked', uid: fbUser.uid, email: fbUser.email, link });
  } catch (err) {
    console.warn('[AUTH] Lecture du lien utilisateur impossible :', err);
    emit({ status: 'unlinked', uid: fbUser.uid, email: fbUser.email, link: null });
  }
}

export function subscribeAuthState(callback: (state: AuthState) => void): () => void {
  authListeners.add(callback);
  callback({ status: 'loading', uid: null, email: null, link: null });
  const unsubscribe = onAuthStateChanged(auth, fbUser => { void emitForUser(fbUser); });
  return () => {
    authListeners.delete(callback);
    unsubscribe();
  };
}

/** Relit le lien de l'utilisateur connecté (après inscription ou rattachement). */
export async function refreshAuthLink(): Promise<void> {
  await emitForUser(auth.currentUser);
}

export async function signIn(email: string, password: string): Promise<AuthLink> {
  const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  const link = await fetchAuthLink(cred.user.uid);
  if (!link) {
    await signOut(auth);
    throw new Error("Ce compte n'est rattaché à aucune boutique. Contactez votre administrateur.");
  }
  return link;
}

export async function signOutUser(): Promise<void> {
  const uid = auth.currentUser?.uid;
  await signOut(auth);
  if (uid) clearCachedLink(uid);
}

export async function sendResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

/** Changement du mot de passe de l'utilisateur connecté (ré-authentification si le mot de passe actuel est fourni). */
export async function changeOwnPassword(newPassword: string, currentPassword?: string): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.email) throw new Error('Aucune session active.');
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  if (currentPassword) {
    const credential = EmailAuthProvider.credential(current.email, currentPassword);
    await reauthenticateWithCredential(current, credential);
  }
  await updatePassword(current, newPassword);
}

/**
 * Inscription d'une nouvelle boutique : compte Auth + boutique + fiche propriétaire + lien,
 * écrits dans un seul lot atomique (les règles vérifient la cohérence des trois documents).
 */
export async function registerTenantOwner(params: {
  email: string;
  password: string;
  tenant: Tenant;
  user: User;
}): Promise<AuthLink> {
  const email = params.email.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, email, params.password);
  const uid = cred.user.uid;
  try {
    const { password: _ignored, ...userWithoutPassword } = params.user as User & { password?: string };
    const batch = writeBatch(db);
    batch.set(doc(db, 'tenants', params.tenant.id), { ...params.tenant, createdBy: uid });
    batch.set(doc(db, 'users', params.user.id), { ...userWithoutPassword, email, role: 'owner', tenantId: params.tenant.id });
    batch.set(doc(db, 'authLinks', uid), { userId: params.user.id, tenantId: params.tenant.id, email });
    await batch.commit();
  } catch (err) {
    // Annuler le compte Auth orphelin pour permettre une nouvelle tentative.
    try { await cred.user.delete(); } catch { /* ignore */ }
    throw err;
  }
  const link: AuthLink = { uid, userId: params.user.id, tenantId: params.tenant.id, email, role: 'owner' };
  writeCachedLink(link);
  // onAuthStateChanged a été émis avant l'écriture du lien : relecture explicite.
  await refreshAuthLink();
  return link;
}

let provisioningAuth: Auth | null = null;
function getProvisioningAuth(): Auth {
  if (provisioningAuth) return provisioningAuth;
  const name = 'nexastock-provisioning';
  const existing = getApps().find(a => a.name === name);
  const secondaryApp: FirebaseApp = existing || initializeApp(firebaseConfig, name);
  // Persistance mémoire : la création d'un compte ne doit pas remplacer la session de l'administrateur.
  provisioningAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
  return provisioningAuth;
}

/**
 * Création, par un administrateur, du compte Auth d'un collaborateur, de sa fiche et de son lien.
 * Nécessite une connexion Internet (création du compte Auth).
 */
export async function provisionUserAccount(user: User, temporaryPassword: string): Promise<string> {
  if (temporaryPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe provisoire doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('La création d\'un compte utilisateur nécessite une connexion Internet.');
  }
  const email = user.email.trim().toLowerCase();
  const secondary = getProvisioningAuth();
  const cred = await createUserWithEmailAndPassword(secondary, email, temporaryPassword);
  const uid = cred.user.uid;
  try {
    const { password: _ignored, ...userWithoutPassword } = user as User & { password?: string };
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', user.id), { ...userWithoutPassword, email, authUid: uid }, { merge: true });
    batch.set(doc(db, 'authLinks', uid), { userId: user.id, tenantId: user.tenantId ?? null, email });
    await batch.commit();
  } catch (err) {
    try { await cred.user.delete(); } catch { /* ignore */ }
    throw err;
  } finally {
    try { await signOut(secondary); } catch { /* ignore */ }
  }
  return uid;
}

/** Messages d'erreur Firebase Auth en français. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Identifiants incorrects.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez dans quelques minutes.';
    case 'auth/network-request-failed':
      return 'Connexion Internet requise pour cette opération.';
    case 'auth/email-already-in-use':
      return 'Cette adresse e-mail est déjà utilisée par un compte.';
    case 'auth/weak-password':
      return `Mot de passe trop faible (au moins ${MIN_PASSWORD_LENGTH} caractères).`;
    case 'auth/invalid-email':
      return 'Adresse e-mail invalide.';
    case 'auth/requires-recent-login':
      return 'Par sécurité, saisissez votre mot de passe actuel puis réessayez.';
    case 'auth/user-disabled':
      return 'Ce compte est désactivé.';
    case 'permission-denied':
      return 'Opération refusée par les règles de sécurité.';
    default:
      return (err as Error)?.message || 'Erreur d\'authentification.';
  }
}
