'use client';

export default function MinimalErrorFallback({ name }) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-base)] px-4 py-3 text-sm text-[var(--text-secondary)]">
      <div className="flex items-center justify-between gap-3">
        <span>{name} failed to render.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-[var(--border-strong)] px-3 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  );
}