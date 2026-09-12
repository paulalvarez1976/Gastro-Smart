import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';

// Usamos initializeFirestore con experimentalForceLongPolling para garantizar
// conectividad estable y sin interrupciones en entornos iframe, proxies y cloud run.
let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  }, databaseId);
} catch {
  firestoreDb = getFirestore(app, databaseId);
}

export const db = firestoreDb;
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;


