import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';

export const firebaseConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'goodwin-team-parlay',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || 'mock-app-id',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'mock-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'goodwin-team-parlay.firebaseapp.com',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-MXKX0DL7ZV',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

export const analyticsPromise: Promise<Analytics | null> =
  typeof window !== 'undefined'
    ? isSupported()
        .then((supported) => (supported ? getAnalytics(app) : null))
        .catch(() => null)
    : Promise.resolve(null);

export async function logAnalyticsEvent(eventName: string, eventParams?: Record<string, any>): Promise<void> {
  try {
    const analytics = await analyticsPromise;
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch {
    // Fail-safe: analytics logging should never crash user actions
  }
}

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
