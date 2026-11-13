import type { EarlyWarning } from "@/lib/traffic/prediction";
import { NODE_MAP } from "@/lib/traffic/graph";

/** Animated early-warning radar. Blips are placed by bearing from city centre. */
export function Radar({ warnings, onSelect }: { warnings: EarlyWarning[]; onSelect?: (w: EarlyWarning) => void }) {
  const cx = 12.955, cy = 77.648;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <svg viewBox="-110 -110 220 220" className="h-full w-full">
        {[100, 70, 40].map((r) => <circle key={r} r={r} fill="none" stroke="var(--color-cyan)" strokeOpacity={0.2} />)}
        <line x1={-100} x2={100} y1={0} y2={0} stroke="var(--color-cyan)" strokeOpacity={0.12} />
        <line y1={-100} y2={100} x1={0} x2={0} stroke="var(--color-cyan)" strokeOpacity={0.12} />
        <g className="animate-radar origin-center">
          <path d="M0 0 L100 0 A100 100 0 0 0 70.7 -70.7 Z" fill="var(--color-cyan)" fillOpacity={0.16} />
          <line x1={0} y1={0} x2={100} y2={0} stroke="var(--color-cyan)" strokeWidth={1.5} />
        </g>
        {warnings.map((w) => {
          const a = NODE_MAP[w.edge.from], b = NODE_MAP[w.edge.to];
          const lat = (a.lat + b.lat) / 2, lng = (a.lng + b.lng) / 2;
          const dx = (lng - cy) * 900, dy = -(lat - cx) * 900;
          const d = Math.hypot(dx, dy) || 1;
          const r = Math.min(92, 25 + w.inMinutes * 2.3);
          const x = (dx / d) * r, y = (dy / d) * r;
          const col = w.riskLevel === "Critical" ? "var(--color-danger)" : "var(--color-warning)";
          return (
            <g key={w.edge.id} className="cursor-pointer" onClick={() => onSelect?.(w)}>
              <circle cx={x} cy={y} r={9} fill={col} fillOpacity={0.25} className="animate-ping-soft" style={{ transformOrigin: `${x}px ${y}px` }} />
              <circle cx={x} cy={y} r={4} fill={col} />
            </g>
          );
        })}
        <circle r={3} fill="var(--color-cyan)" />
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">ring distance = minutes ahead</div>
    </div>
  );
}
