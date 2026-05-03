import { Skeleton } from './Skeleton';

export function GlobeSkeleton() {
  return (
    <div className="w-full h-full bg-[#020617] flex items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-cyan-400/10 animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="text-[11px] text-cyan-400/60 uppercase tracking-[0.2em] font-bold animate-pulse">
            Initializing Orbital Command
          </div>
          <div className="flex gap-1.5">
            <div className="w-1 h-1 rounded-full bg-cyan-400/20 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1 h-1 rounded-full bg-cyan-400/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1 h-1 rounded-full bg-cyan-400/20 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
