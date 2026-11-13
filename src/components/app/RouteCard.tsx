import { AlertTriangle, Fuel, Gauge, ShieldCheck, Timer, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Route } from "@/lib/traffic/routing";
import { Meter } from "./ui";

export function RouteCard({ title, subtitle, route, color, active, onClick }: { title: string; subtitle: string; route: Route; color: string; active: boolean; onClick: () => void }) {
  const m = route.metrics;
  return (
    <button onClick={onClick} className={cn("glass w-full rounded-xl p-4 text-left transition", active ? "ring-2 ring-cyan shadow-glow" : "hover:-translate-y-0.5")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            {title}
          </div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular">{route.score}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">score / 100</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Waypoints className="h-3.5 w-3.5" /> <b className="text-foreground tabular">{m.distanceKm} km</b></span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><Timer className="h-3.5 w-3.5" /> <b className="text-foreground tabular">{m.etaMin} min</b></span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><Fuel className="h-3.5 w-3.5" /> <b className="text-foreground tabular">{m.fuelL} L</b></span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> <b className="text-foreground tabular">{m.reliability}%</b> reliable</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> <b className="text-foreground tabular">{m.incidentCount}</b> incidents</span>
        <span className="flex items-center gap-1.5 text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> <b className="text-foreground tabular">{Math.round(m.avgCongestion * 100)}%</b> congestion</span>
      </div>
      <Meter value={m.avgCongestion} className="mt-3" />
      {m.closureWarnings.length > 0 && <div className="mt-2 text-[11px] text-warning">⚠ Closure nearby: {m.closureWarnings.join(", ")}</div>}
    </button>
  );
}
