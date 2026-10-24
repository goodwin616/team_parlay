import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'goodwin-team-parlay',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:411391028164:web:c7d2e54d11d47aaf691291',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDCOY1oYm11XDD1AXodMIJYMhUPVq93ZeY',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'goodwin-team-parlay.firebaseapp.com',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

let emulatorsConnected = false;

if (
  !emulatorsConnected &&
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  import.meta.env.VITE_USE_PRODUCTION_FIREBASE !== 'true'
) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  emulatorsConnected = true;
}
