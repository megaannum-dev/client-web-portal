import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Default Firebase **web client** config for local development.
 * Override any field with matching `NEXT_PUBLIC_FIREBASE_*` in `.env.local` (recommended for CI/production builds).
 */
const devFirebaseWebConfig = {
  apiKey: "AIzaSyCkjL0NlHfnH31yMgmHXbI_vp-DDwkz1U0",
  authDomain: "client-web-portal-2026.firebaseapp.com",
  projectId: "client-web-portal-2026",
  appId: "1:414330930265:web:979f7e750a78ada5809d48",
  storageBucket: "client-web-portal-2026.firebasestorage.app",
  messagingSenderId: "414330930265",
} as const;

function getFirebaseWebConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? devFirebaseWebConfig.apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? devFirebaseWebConfig.authDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? devFirebaseWebConfig.projectId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? devFirebaseWebConfig.appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? devFirebaseWebConfig.storageBucket,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? devFirebaseWebConfig.messagingSenderId,
  };
}

export function isFirebaseConfigured(): boolean {
  const c = getFirebaseWebConfig();
  return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
}

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase web config is incomplete. Check lib/firebase.ts or .env.local.");
  }
  const firebaseConfig = getFirebaseWebConfig();
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
