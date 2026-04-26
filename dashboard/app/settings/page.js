'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Sun, Moon } from 'lucide-react';
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
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setAutoRotate(getLocalSetting('gdg_globe_auto_rotate', '10s'));
      setDefaultFilter(getLocalSetting('gdg_default_filter', 'all'));
    }, 0);
  }, []);

  useEffect(() => {
    if (!auth) {
      setTimeout(() => setLoading(false), 0);
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
    import('sonner').then(({ toast }) => {
      toast.success(`Theme changed to ${nextTheme === 'dark' ? 'Dark' : 'Light'}`);
    });
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
      import('sonner').then(({ toast }) => {
        toast.success('Preferences saved successfully');
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <NavBar />
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
            <span className="hover:text-[var(--text-primary)] transition-colors cursor-pointer">OpenTrade</span>
            <span className="opacity-30">/</span>
            <span className="text-[var(--text-secondary)]">Settings</span>
          </div>

          <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.25em] text-[var(--accent-cyan)] font-bold font-display">Operations Preferences</p>
              <h1 className="text-3xl font-bold tracking-tight font-display">System Settings</h1>
              <p className="text-sm text-[var(--text-secondary)] max-w-lg leading-relaxed">
                Configure your global OpenTrade platform preferences, notification triggers, and visual identity.
              </p>
            </div>
            
            <div className="flex flex-col items-end gap-2 shrink-0">
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Environment Theme</p>
              <div className="flex items-center gap-4 bg-[var(--bg-elevated)]/40 p-2 rounded-2xl border border-[var(--border-subtle)] glass-panel">
                <span className="text-xs font-bold text-[var(--text-primary)] pl-2">
                  {theme === 'dark' ? 'Dark Command Mode' : 'Light Operations Mode'}
                </span>
                <div className="flex gap-1">
                  {['light', 'dark'].map((t) => (
                    <button
                      key={t}
                      onClick={() => handleThemeToggle(t)}
                      className={`p-2 rounded-xl border transition-all active:scale-95 ${
                        theme === t 
                          ? 'bg-[var(--accent-cyan)]/10 border-[var(--accent-cyan)]/40 text-[var(--accent-cyan)] shadow-lg shadow-cyan-500/5' 
                          : 'bg-transparent border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {t === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
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
                      className={`flex-1 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${
                        theme === option 
                          ? 'border-[var(--accent-cyan)]/40 bg-[var(--accent-cyan)]/10 text-[var(--text-primary)] shadow-sm' 
                          : 'border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-bg-elevated)]'
                      }`}
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
                      className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-cyan)]/50 focus:ring-4 focus:ring-[var(--accent-cyan)]/5 transition-all"
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
                      className={`w-full rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                        isSaved 
                          ? 'bg-[var(--accent-green)] text-white shadow-[var(--accent-green)]/20' 
                          : 'bg-[var(--accent-blue)] text-white hover:brightness-110 disabled:opacity-60 shadow-[var(--accent-blue)]/20'
                      }`}
                    >
                      {saving ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : isSaved ? (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Preferences Saved
                        </>
                      ) : 'Save Preferences'}
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
    <article className="glass-panel p-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold tracking-tight font-display text-[var(--text-primary)]">{title}</h2>
        <p className="text-[11px] font-medium text-[var(--text-secondary)]">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </article>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3 cursor-pointer group transition-colors hover:bg-[var(--bg-elevated)]/40">
      <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
      <div className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-[var(--bg-elevated)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent-cyan)]/80"></div>
      </div>
    </label>
  );
}

function SelectRow({ label, value, onChange, options }) {
  return (
    <label className="space-y-2 block">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{label}</span>
      <div className="relative group">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-cyan)]/50 focus:ring-4 focus:ring-[var(--accent-cyan)]/5 transition-all appearance-none cursor-pointer"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    </label>
  );
}