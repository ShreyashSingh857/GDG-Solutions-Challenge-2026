'use client';

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
export const isFirebaseConfigured = requiredKeys.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === 'string' && value.trim().length > 0;
});

let app = null;
if (isFirebaseConfigured) {
  // Prevent re-initialization on hot reloads in Next.js dev mode
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

let db = null;
if (app) {
  try {
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch {
    db = getFirestore(app);
  }
}

export { db };
