'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import NavBar from '../components/NavBar.jsx';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { auth, db, isFirebaseConfigured } from '../lib/firebase.js';

const AUTO_ROTATE_OPTIONS = [
  { value: '5s', label: '5 seconds' },
  { value: '10s', label: '10 seconds' },
  { value: '30s', label: '30 seconds' },
  { value: 'never', label: 'Never' },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'delayed', label: 'Delayed' },
];

function getLocalSetting(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function setLocalSetting(key, value) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
}

export default function SettingsPage() {
  const { theme, setThemePreference } = useTheme();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [orgDisplayName, setOrgDisplayName] = useState('');
  const [autoRotate, setAutoRotate] = useState('10s');
  const [defaultFilter, setDefaultFilter] = useState('all');

  useEffect(() => {
    setAutoRotate(getLocalSetting('gdg_globe_auto_rotate', '10s'));
    setDefaultFilter(getLocalSetting('gdg_default_filter', 'all'));
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser || null);

      if (!nextUser || !db) {
        setLoading(false);
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, 'user_preferences', nextUser.uid));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setPushEnabled(Boolean(data.pushEnabled ?? true));
          setEmailEnabled(Boolean(data.emailEnabled ?? true));
          setOrgDisplayName(String(data.orgDisplayName || ''));
        }
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const themeLabel = useMemo(() => (theme === 'dark' ? 'Dark' : 'Light'), [theme]);

  const handleThemeToggle = (nextTheme) => {
    setThemePreference(nextTheme);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      setLocalSetting('gdg_globe_auto_rotate', autoRotate);
      setLocalSetting('gdg_default_filter', defaultFilter);

      if (user && db) {
        await setDoc(doc(db, 'user_preferences', user.uid), {
          pushEnabled,
          emailEnabled,
          orgDisplayName: orgDisplayName.trim(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <NavBar />
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="mx-auto max-w-4xl space-y-8">
          <header className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.25em] text-cyan-400 font-semibold font-display">Preferences</p>
            <h1 className="text-3xl font-bold tracking-tight font-display">Settings</h1>
            <p className="text-sm text-[var(--text-secondary)]">Control alerts, layout defaults, and the visual theme from one place.</p>
          </header>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((idx) => (
                <div key={idx} className="h-72 rounded-2xl bg-[var(--bg-surface)] animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2">
            <SettingCard title="Notifications" description="Choose how you want to be notified when disruptions occur.">
              <ToggleRow label="Push notifications" checked={pushEnabled} onChange={setPushEnabled} />
              <ToggleRow label="Email digest" checked={emailEnabled} onChange={setEmailEnabled} />
            </SettingCard>

            <SettingCard title="Appearance" description="Theme and globe behavior are stored locally for instant response.">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Theme mode</label>
                <div className="flex gap-2">
                  {['dark', 'light'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleThemeToggle(option)}
                      className={`rounded-xl border px-4 py-2 text-sm capitalize transition-colors ${theme === option ? 'border-cyan-400/40 bg-cyan-400/10 text-[var(--text-primary)]' : 'border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">Current theme: {themeLabel}</p>
                 <p className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-elevated)] rounded-lg p-2.5 border border-[var(--border-subtle)]">
                   <span className="font-medium text-[var(--text-secondary)]">Note:</span> Theme changes apply across all pages except the Globe view, which remains fixed dark for 3D rendering accuracy.
                 </p>
              </div>

              <SelectRow label="Globe auto-rotate" value={autoRotate} onChange={setAutoRotate} options={AUTO_ROTATE_OPTIONS} />
              <SelectRow label="Default filter" value={defaultFilter} onChange={setDefaultFilter} options={FILTER_OPTIONS} />
            </SettingCard>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <SettingCard title="Organisation" description="The org display name is stored in Firestore for shared workspace identity.">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Org display name</span>
                    <input
                      value={orgDisplayName}
                      onChange={(e) => setOrgDisplayName(e.target.value)}
                      placeholder="Northstar Logistics"
                      className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-cyan-400/50"
                    />
                  </label>
                  <p className="text-[11px] text-[var(--text-muted)]">Saved for {user?.email || 'the current user'}.</p>
                </SettingCard>

                <SettingCard title="Status" description="These preferences are a mix of local and Firestore-backed settings.">
                  <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                    <p>Firebase configured: {isFirebaseConfigured ? 'Yes' : 'No'}</p>
                    <p>Signed in: {user?.email || 'No active session detected'}</p>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-60"
                    >
                      {saving ? 'Saving...' : 'Save Preferences'}
                    </button>
                  </div>
                </SettingCard>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SettingCard({ title, description, children }) {
  return (
    <article className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-base)] p-5 shadow-[var(--shadow-card)] space-y-4">
      <div>
        <h2 className="text-lg font-semibold font-display">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </article>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3">
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-cyan-400"
      />
    </label>
  );
}

function SelectRow({ label, value, onChange, options }) {
  return (
    <label className="space-y-2 block">
      <span className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-cyan-400/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}