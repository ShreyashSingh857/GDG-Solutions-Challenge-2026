'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Activity, BarChart3, Globe, Package, RotateCcw, Settings, Moon, Sun, Workflow, AlertCircle } from 'lucide-react';
import { useAlertStore } from '../store/alertStore.js';
import { useTheme } from '../providers/ThemeProvider.jsx';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  { href: '/', label: 'Globe', icon: Globe, section: 'live' },
  { href: '/shipments', label: 'Shipments', icon: Package, section: 'live' },
  { href: '/replay', label: 'Replay', icon: RotateCcw, section: 'analysis' },
  { href: '/visualize', label: 'Visualize', icon: Workflow, section: 'analysis' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, section: 'analysis' },
  { href: '/health', label: 'System', icon: Activity, section: 'analysis' },
];

function ThemeToggleButton({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
      className="p-1.5 rounded-lg border border-[var(--border-subtle)] 
                 text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                 hover:bg-[var(--bg-elevated)] transition-all active:scale-95 shadow-sm"
    >
      {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
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
      className="h-14 shrink-0 flex items-center justify-between px-5
                 glass-panel !rounded-none !border-t-0 !border-x-0 !border-b
                 z-40 transition-colors duration-300"
    >
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10
                        border border-cyan-400/40 flex items-center justify-center shadow-lg shadow-cyan-500/5">
          <Activity className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="hidden sm:block">
          <span className="text-[13px] font-bold text-[var(--text-primary)] tracking-tight font-display">
            Anti-Fragile
          </span>
          <span className="ml-1.5 text-[11px] text-[var(--text-muted)] tracking-wide hidden md:inline font-medium">
            Command Center
          </span>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center glass-panel !bg-[var(--bg-elevated)]/40 p-1 gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, section }, idx) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
          
          const showDivider = idx > 0 && NAV_ITEMS[idx - 1].section !== section;

          return (
            <div key={href} className="flex items-center gap-1">
              {showDivider && (
                <div className="w-px h-4 bg-[var(--border-subtle)] mx-1 opacity-50" />
              )}
              <Link
                href={href}
                aria-label={label}
                title={label}
                className={[
                  'relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider',
                  'transition-all duration-200 outline-none',
                  'focus-visible:ring-2 focus-visible:ring-[var(--accent-cyan)]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-black',
                  active
                    ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)]/40',
                ].join(' ')}
              >
                <div className="relative">
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-[var(--accent-cyan)]' : 'opacity-70'}`} aria-hidden="true" />
                  {href === '/' && hasActiveDisruption && (
                    <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-[var(--accent-red)] rounded-full animate-pulse shadow-[0_0_8px_var(--accent-red)]" />
                  )}
                </div>
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <motion.div 
                    layoutId="nav-active-border"
                    className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--accent-cyan)] rounded-full shadow-[0_0_8px_var(--accent-cyan)]"
                  />
                )}
              </Link>
            </div>
          );
        })}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {!isGlobePage && (
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} />
        )}
        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings (Cmd+,)"
          className="p-1.5 rounded-lg border border-[var(--border-subtle)]
                     text-[var(--text-secondary)] hover:text-[var(--text-primary)]
                     hover:bg-[var(--bg-elevated)] transition-all active:scale-95 shadow-sm"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    </nav>
  );
}
