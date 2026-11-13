export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative grid h-8 w-8 place-items-center rounded-lg bg-brand shadow-glow">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
          <path d="M4 20 L12 4 L20 20" className="text-primary-foreground" />
          <path d="M8 13 H16" className="text-primary-foreground" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-sm font-extrabold tracking-[0.18em]">TRAFFIX AI</div>
          <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Smart City OS</div>
        </div>
      )}
    </div>
  );
}
