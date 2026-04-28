import { auth } from '../db/firebase.js';

/**
 * Fastify preHandler middleware.
 * Verifies the Firebase ID token sent in the Authorization header.
 * Attaches { uid, email, role } to request.user on success.
 * Use this on any route that requires authentication.
 */
export async function firebaseAuthMiddleware(req, reply) {
	const authHeader = req.headers.authorization;

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return reply.status(401).send({ error: 'Missing or invalid Authorization header', traceId: null });
	}

	const idToken = authHeader.split('Bearer ')[1];

	try {
		const decoded = await auth.verifyIdToken(idToken);
		req.user = {
			uid: decoded.uid,
			email: decoded.email,
			role: decoded.role || 'viewer', // custom claim - set via Firebase Admin in future
		};
	} catch (_err) {
		return reply.status(401).send({ error: 'Invalid or expired token', traceId: null });
	}
}
