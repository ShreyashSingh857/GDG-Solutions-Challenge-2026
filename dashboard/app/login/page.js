'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { app, auth } from '../lib/firebase.js';

export default function LoginPage() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState('');

  const isConfigured = useMemo(() => Boolean(app && auth), []);

  const handleSignIn = useCallback(async () => {
    if (!auth) {
      setError('Firebase client config is missing. Set NEXT_PUBLIC_FIREBASE_* variables.');
      return;
    }

    setIsSigningIn(true);
    setError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  }, [router]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#040615] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.16),transparent_35%),radial-gradient(circle_at_85%_80%,rgba(245,158,11,0.15),transparent_38%)]" />
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Supply Chain Intelligence</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">Sign in to access live disruption monitoring</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Authenticate with Google to continue to your organization dashboard.
          </p>

          <button
            type="button"
            onClick={handleSignIn}
            disabled={!isConfigured || isSigningIn}
            className="mt-8 w-full rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSigningIn ? 'Signing in...' : 'Continue With Google'}
          </button>

          {!isConfigured ? (
            <p className="mt-4 text-xs text-amber-200/90">
              Firebase web config is not set. Add NEXT_PUBLIC_FIREBASE_* values to enable sign-in.
            </p>
          ) : null}

          {error ? <p className="mt-4 text-xs text-red-300">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
