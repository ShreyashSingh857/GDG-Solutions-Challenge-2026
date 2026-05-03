export function EmptyState({
  icon,
  title,
  description,
  action
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] flex items-center justify-center text-3xl shadow-sm border border-[var(--border-subtle)]">
        {icon}
      </div>
      <div>
        <h3 className="text-[var(--text-primary)] text-base font-bold mb-1">
          {title}
        </h3>
        <p className="text-[13px] text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
