import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import 'dotenv/config';

const hasFirebaseCreds = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
if (hasFirebaseCreds && !getApps().length) {
	initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
}

const unavailable = new Proxy({}, { get() { throw new Error('[Firebase] Missing FIREBASE_* env vars'); } });
export const db = hasFirebaseCreds ? getFirestore() : unavailable;
export const auth = hasFirebaseCreds ? getAuth() : unavailable;
