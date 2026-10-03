import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  type Firestore,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialiser Firebase de manière robuste (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Base Firestore nommée : uniquement celle déclarée dans la configuration (aucune valeur codée en dur).
const configuredDbId: string | undefined = (firebaseConfig as { firestoreDatabaseId?: string })?.firestoreDatabaseId || undefined;
const databaseId = configuredDbId && configuredDbId !== '(default)' ? configuredDbId : undefined;

/**
 * Indique si le cache Firestore persistant (IndexedDB) est actif.
 * Avec le cache persistant, les écritures en attente survivent au rechargement de la page
 * et l'application démarre hors ligne à partir des données déjà synchronisées (SYNC-03).
 */
export let firestorePersistenceEnabled = false;

function createFirestore(): Firestore {
  const hasIndexedDb = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  try {
    const db = initializeFirestore(
      app,
      {
        localCache: hasIndexedDb
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache(),
        ignoreUndefinedProperties: true,
      },
      databaseId
    );
    firestorePersistenceEnabled = hasIndexedDb;
    return db;
  } catch (err) {
    // Firestore déjà initialisé (HMR) ou persistance indisponible (navigation privée) : repli mémoire.
    console.warn('[FIRESTORE] Cache persistant indisponible, repli sur le cache mémoire :', err);
    try {
      return initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true }, databaseId);
    } catch {
      return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
    }
  }
}

export const db: Firestore = createFirestore();
export const auth: Auth = getAuth(app);
export const firebaseApp = app;
export { firebaseConfig };

export default app;
