'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="h-12 shrink-0 flex items-center justify-between px-4 bg-black/60 backdrop-blur-md border-b border-white/5 z-40">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-[10px]">&#9672;</span>
        <span className="text-sm font-semibold text-white/80 tracking-wide">
          Anti-Fragile Supply Chain
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href="/"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${pathname === '/' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
        >
          Globe
        </Link>
        <Link
          href="/shipments"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${pathname === '/shipments' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
        >
          Shipments
        </Link>
      </div>
    </nav>
  );
}
