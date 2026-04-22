'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../lib/firebase.js';

function toOrgSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function OnboardingPage() {
  const router = useRouter();
  const [orgInput, setOrgInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = auth?.currentUser;
    if (!user) {
      router.replace('/login');
    }
  }, [router]);

  const orgId = useMemo(() => toOrgSlug(orgInput), [orgInput]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const user = auth?.currentUser;
    if (!user) {
      setError('You must sign in before setting an organization.');
      return;
    }

    if (!orgId) {
      setError('Enter a valid organization slug.');
      return;
    }

    setIsSaving(true);
    try {
      const idToken = await user.getIdToken(true);
      const response = await fetch('/api/auth/set-org', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ orgId }),
      });

      const payload = await response.json();
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || `Failed to set organization (HTTP ${response.status})`);
      }

      await user.getIdToken(true);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save organization.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#040615] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/5 p-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">Organization Setup</p>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">Choose your organization</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">
            This slug is used to scope tenant data and access policies.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="orgId" className="mb-2 block text-xs uppercase tracking-[0.18em] text-white/45">
                Organization Slug
              </label>
              <input
                id="orgId"
                value={orgInput}
                onChange={(e) => setOrgInput(e.target.value)}
                placeholder="e.g. acme-logistics"
                className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300/50"
                autoComplete="organization"
                maxLength={50}
                required
              />
              <p className="mt-2 text-xs text-white/45">Will be saved as: {orgId || '...'}</p>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Continue to Dashboard'}
            </button>
          </form>

          {error ? <p className="mt-4 text-xs text-red-300">{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
