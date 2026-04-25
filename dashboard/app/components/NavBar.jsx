'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Globe, Package, RotateCcw, Settings, Moon, Sun, Workflow } from 'lucide-react';
import { useTheme } from '../providers/ThemeProvider.jsx';

const NAV_ITEMS = [
  { href: '/', label: 'Globe', icon: Globe },
  { href: '/shipments', label: 'Shipments', icon: Package },
  { href: '/replay', label: 'Replay', icon: RotateCcw },
  { href: '/visualize', label: 'Visualize', icon: Workflow },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/health', label: 'System', icon: Activity },
];

function ThemeToggleButton({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle theme"
      className="p-1.5 rounded-lg border border-[var(--border-subtle)] 
                 text-[var(--text-muted)] hover:text-[var(--text-secondary)]
                 hover:bg-[var(--bg-elevated)] transition-colors"
    >
      {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const isGlobePage = pathname === '/';

  return (
    <nav
      className="h-14 shrink-0 flex items-center justify-between px-5
                 bg-[var(--bg-overlay)] backdrop-blur-xl
                 border-b border-[var(--border-subtle)] z-40
                 transition-colors duration-300"
    >
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-600/20
                        border border-cyan-400/25 flex items-center justify-center">
          <span className="text-[10px] font-bold text-cyan-300 tracking-tighter">SC</span>
        </div>
        <div className="hidden sm:block">
          <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight">
            Anti-Fragile
          </span>
          <span className="ml-1.5 text-[11px] text-[var(--text-muted)] tracking-wide hidden md:inline">
            Supply Chain
          </span>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center bg-[var(--bg-elevated)] rounded-xl border
                      border-[var(--border-subtle)] p-1 gap-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'transition-all duration-150',
                active
                  ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)]/40',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
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
          className="p-1.5 rounded-lg border border-[var(--border-subtle)]
                     text-[var(--text-muted)] hover:text-[var(--text-secondary)]
                     hover:bg-[var(--bg-elevated)] transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </Link>
      </div>
    </nav>
  );
}
