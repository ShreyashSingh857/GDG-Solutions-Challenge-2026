'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Activity, BarChart3, Globe, Package, RotateCcw, Settings, Moon, Sun, Workflow, AlertCircle, Code2, Zap } from 'lucide-react';
import { useAlertStore } from '../store/alertStore.js';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { href: '/', label: 'Globe', icon: Globe, section: 'live' },
  { href: '/shipments', label: 'Shipments', icon: Package, section: 'live' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, section: 'live' },
  { href: '/demo', label: 'Demo', icon: Zap, section: 'live' },
  { href: '/replay', label: 'Replay', icon: RotateCcw, section: 'analysis' },
  { href: '/visualize', label: 'Visualize', icon: Workflow, section: 'analysis' },
  { href: '/developers', label: 'API', icon: Code2, section: 'analysis' },
  { href: '/health', label: 'System', icon: Activity, section: 'analysis' },
];

function ThemeToggleButton({ onToggle }) {
  return (
    <button
      onClick={onToggle}
      title="Toggle theme"
      aria-label="Toggle theme"
      className="p-1.5 rounded-lg border border-[var(--border-subtle)] 
                 text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                 hover:bg-[var(--bg-elevated)] transition-all active:scale-95 shadow-sm"
    >
      <Sun className="theme-toggle-light-icon w-3.5 h-3.5" aria-hidden="true" />
      <Moon className="theme-toggle-dark-icon w-3.5 h-3.5" aria-hidden="true" />
    </button>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleTheme } = useTheme();
  const isGlobePage = pathname === '/';
  const hasActiveDisruption = useAlertStore((s) => Boolean(s.activeDisruptionId));

  // Keyboard shortcut for Settings (Cmd/Ctrl + ,)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        router.push('/settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  return (
    <nav
      className="h-16 shrink-0 flex items-center justify-between px-6
                 glass-panel !rounded-none !border-t-0 !border-x-0 !border-b
                 z-40 transition-all duration-500 shadow-lg"
    >
      {/* Brand */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10
                        border border-cyan-400/40 flex items-center justify-center shadow-lg shadow-cyan-500/10 hover:scale-110 transition-transform">
          <Activity className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="hidden sm:block">
          <div className="text-[14px] font-extrabold text-[var(--text-primary)] tracking-tight font-display">
            OpenTrade
          </div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-[0.2em] uppercase font-bold">
            Intelligence
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center bg-[var(--bg-elevated)]/30 rounded-2xl p-1 gap-1 border border-[var(--border-subtle)] backdrop-blur-sm">
        {NAV_ITEMS.map(({ href, label, icon: Icon, section }, idx) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
          
          const showDivider = idx > 0 && NAV_ITEMS[idx - 1].section !== section;

          return (
            <div key={href} className="flex items-center gap-1">
              {showDivider && (
                <div className="w-px h-5 bg-[var(--border-subtle)] mx-1 opacity-50" />
              )}
              <Link
                href={href}
                aria-label={label}
                title={label}
                className={[
                  'relative flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.1em]',
                  'transition-all duration-300 outline-none',
                  active
                    ? 'bg-[var(--glass-bg-elevated)] text-[var(--text-primary)] shadow-sm border border-[var(--glass-border)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]/40',
                ].join(' ')}
              >
                <div className="relative">
                  <Icon className={`w-4 h-4 ${active ? 'text-[var(--accent-cyan)]' : 'opacity-60'}`} aria-hidden="true" />
                  {href === '/' && hasActiveDisruption && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[var(--accent-red)] rounded-full animate-pulse shadow-[0_0_10px_var(--accent-red)]" />
                  )}
                </div>
                <span className="hidden lg:inline">{label}</span>
                {active && (
                  <motion.div 
                    layoutId="nav-active-indicator"
                    className="absolute -bottom-1 left-4 right-4 h-[2px] bg-[var(--accent-cyan)] rounded-full shadow-[0_0_10px_var(--accent-cyan)]"
                  />
                )}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {!isGlobePage && (
          <ThemeToggleButton onToggle={toggleTheme} />
        )}
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings (Cmd+,)"
          className="p-2 rounded-xl border border-[var(--border-subtle)]
                     text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                     hover:bg-[var(--bg-elevated)] transition-all active:scale-95 shadow-sm hover:border-[var(--accent-cyan)]/30"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
    </nav>
  );
}
