import { createRequire } from 'node:module';

// Best-effort local env loading: skip if dotenv is unavailable in this package context.
try {
	await import('dotenv/config');
} catch {
	// no-op
}

const require = createRequire(process.cwd() + '/package.json');
const hasFirebaseCreds =
	process.env.FIREBASE_PROJECT_ID &&
	process.env.FIREBASE_CLIENT_EMAIL &&
	process.env.FIREBASE_PRIVATE_KEY;

let dbInstance = null;
let authInstance = null;
let unavailableReason = null;

if (hasFirebaseCreds) {
	try {
		const { initializeApp, cert, getApps } = require('firebase-admin/app');
		const { getFirestore } = require('firebase-admin/firestore');
		const { getAuth } = require('firebase-admin/auth');

		if (!getApps().length) {
			initializeApp({
				credential: cert({
					projectId: process.env.FIREBASE_PROJECT_ID,
					clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
					privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
				}),
			});
		}

		dbInstance = getFirestore();
		authInstance = getAuth();
	} catch (err) {
		unavailableReason = `[Firebase] firebase-admin is not available: ${err.message}`;
	}
} else {
	unavailableReason = '[Firebase] Missing FIREBASE_* env vars';
}

const unavailable = new Proxy(
	{},
	{
		get() {
			throw new Error(unavailableReason || '[Firebase] Firebase is unavailable');
		},
	}
);

export const db = dbInstance || unavailable;
export const auth = authInstance || unavailable;
