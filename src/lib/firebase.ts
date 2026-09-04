import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialiser Firebase de manière robuste (singleton)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialiser Firestore avec le databaseId dédié s'il est spécifié
const customDbId = (firebaseConfig as any)?.firestoreDatabaseId;
export const db = customDbId && customDbId !== '(default)'
  ? getFirestore(app, customDbId)
  : getFirestore(app);

export default app;
