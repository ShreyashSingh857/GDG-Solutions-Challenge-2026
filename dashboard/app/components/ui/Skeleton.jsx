import clsx from 'clsx';

export function Skeleton({ className, variant = 'line', ...props }) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-[var(--bg-elevated)] relative overflow-hidden',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/5 after:to-transparent',
        variant === 'line' && 'h-3 w-full rounded-md',
        variant === 'block' && 'h-24 w-full rounded-xl',
        variant === 'circle' && 'h-12 w-12 rounded-full',
        className
      )}
      {...props}
    />
  );
}
