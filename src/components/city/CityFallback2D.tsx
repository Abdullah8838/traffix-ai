import { NODES } from "@/lib/traffic/graph";
import { EDGE_GEOM, NODE_XZ } from "@/lib/traffic/citySim";
import { PALETTE, congestionColor } from "@/lib/palette";
import type { CitySceneProps } from "./CitySceneImpl";

/** 2D schematic used when WebGL is unavailable. */
export function CityFallback2D({ congestion, closed, selectedEdge, onSelectEdge, onSelectNode, className }: CitySceneProps) {
  return (
    <div className={`relative grid-lines bg-ink ${className ?? "h-full w-full"}`}>
      <svg viewBox="-45 -40 90 80" className="h-full w-full">
        {EDGE_GEOM.map((g) => (
          <line
            key={g.edge.id}
            x1={g.a[0]}
            y1={g.a[1]}
            x2={g.b[0]}
            y2={g.b[1]}
            stroke={selectedEdge === g.edge.id ? PALETTE.cyan : closed.has(g.edge.id) ? PALETTE.red : congestionColor(congestion[g.edge.id] ?? 0.3)}
            strokeWidth={0.3 + g.edge.lanes * 0.08}
            strokeDasharray={closed.has(g.edge.id) ? "1 1" : undefined}
            className="cursor-pointer"
            onClick={() => onSelectEdge?.(g.edge.id)}
          />
        ))}
        {NODES.map((n) => (
          <circle key={n.id} cx={NODE_XZ[n.id][0]} cy={NODE_XZ[n.id][1]} r={0.9} fill={PALETTE.navy} stroke={PALETTE.text} strokeWidth={0.25} onClick={() => onSelectNode?.(n.id)} className="cursor-pointer" />
        ))}
      </svg>
      <div className="absolute left-3 top-3 rounded-md glass-strong px-2 py-1 text-xs text-muted-foreground">
        WebGL unavailable — showing 2D schematic
      </div>
    </div>
  );
}
