'use client';

export default function MinimalErrorFallback({ name }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
      <div className="flex items-center justify-between gap-3">
        <span>{name} failed to render.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-100 hover:bg-slate-800 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}