import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import 'dotenv/config';

// Prevent re-initialization on hot reloads (nodemon)
if (!getApps().length) {
	initializeApp({
		credential: cert({
			projectId: process.env.FIREBASE_PROJECT_ID,
			clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
			// The private key comes from env with literal \n - convert them to actual newlines
			privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
		}),
	});
}

export const db = getFirestore();
export const auth = getAuth();
