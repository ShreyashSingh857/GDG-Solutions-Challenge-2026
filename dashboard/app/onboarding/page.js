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
    <main className="min-h-screen bg-[#040615] text-[var(--text-primary)] font-sans">
      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16">
        
        {/* Step Indicator */}
        <div className="mb-12 flex flex-col items-center gap-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--text-muted)]">
            Setup Progress: <span className="text-[var(--accent-cyan)]">Step 2 of 2</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[var(--accent-cyan)]/10 border border-[var(--accent-cyan)]/30 flex items-center justify-center text-[11px] font-bold text-[var(--accent-cyan)]">1</div>
              <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Account</span>
            </div>
            <div className="h-px w-12 bg-[var(--border-subtle)] -mt-6" />
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[var(--accent-cyan)] border border-[var(--accent-cyan)] shadow-[0_0_15px_rgba(34,211,238,0.4)] flex items-center justify-center text-[11px] font-bold text-[#020617]">2</div>
              <span className="text-[11px] uppercase tracking-widest text-[var(--accent-cyan)] font-bold">Setup</span>
            </div>
            <div className="h-px w-12 bg-[var(--border-subtle)] -mt-6" />
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border border-[var(--border-subtle)] flex items-center justify-center text-[11px] font-bold text-[var(--text-muted)]">3</div>
              <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Dashboard</span>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md glass-panel glass-edge p-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--accent-cyan)]">Organization Setup</p>
          <h1 className="mt-3 text-2xl font-bold leading-tight font-display text-[var(--text-primary)]">Identify your workspace</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            Each organization gets its own isolated data vault. This only needs to be set once.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="orgId" className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Organization ID
              </label>
              <input
                id="orgId"
                value={orgInput}
                onChange={(e) => setOrgInput(e.target.value)}
                placeholder="e.g. acme-logistics"
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)]/40 px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-cyan)]/50 focus:bg-[var(--bg-elevated)]/60"
                autoComplete="organization"
                maxLength={50}
                required
              />
              <div className="mt-4 space-y-3">
                <p className="text-[11px] font-medium text-[var(--text-muted)] leading-relaxed">
                  Your org ID is used to scope your team&apos;s shipment data. Use lowercase letters, numbers, and hyphens only.
                </p>
                <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--accent-cyan)] bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/10 px-3 py-1.5 rounded-lg w-fit">
                  <span className="opacity-50">WORKSPACE:</span>
                  <span className="font-bold">{orgId || '...'}</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full rounded-xl bg-[var(--accent-cyan)] px-4 py-3.5 text-xs font-bold uppercase tracking-widest text-[#020617] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-[var(--accent-cyan)]/10"
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border-2 border-[#020617]/30 border-t-[#020617] rounded-full animate-spin" />
                    Initializing...
                  </span>
                ) : 'Complete Deployment'}
              </button>
            </div>
          </form>

          {error ? (
            <div className="mt-6 p-3 rounded-lg border border-[var(--accent-red)]/20 bg-[var(--accent-red)]/5 text-[11px] font-medium text-[var(--accent-red)]">
              {error}
            </div>
          ) : null}

          <div className="mt-10 pt-8 border-t border-[var(--border-subtle)]">
            <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-[0.14em] mb-2">Architectural Privacy</p>
            <p className="text-[11px] leading-relaxed text-[var(--text-muted)] opacity-60">
              Each organization gets its own isolated data workspace. This ensures strict privacy and compliance boundaries for your logistics telemetry.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
