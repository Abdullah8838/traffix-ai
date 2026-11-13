import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RotateCcw, SlidersHorizontal, Sparkles, Trophy } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { PageHeader, Panel, NodeSelect, SimTag, EmptyState, Meter } from "@/components/app/ui";
import { TrafficMap } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { DEFAULT_WEIGHTS, FACTOR_LABELS, describePath, planRoutes, type Weights } from "@/lib/traffic/routing";
import { congestionMap } from "@/lib/traffic/conditions";
import type { NodeId } from "@/lib/traffic/graph";
import { SERIES_HEX } from "@/lib/palette";
import { tooltipProps } from "@/components/app/chart-theme";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/optimize")({
  head: () => ({
    meta: [
      { title: "Multi-Factor Route Optimization — TRAFFIX AI" },
      { name: "description", content: "Transparent 0–100 route ranking across distance, time, congestion, closures, fuel and reliability with custom priorities." },
      { property: "og:title", content: "Multi-Factor Route Optimization — TRAFFIX AI" },
      { property: "og:description", content: "Customisable, explainable route ranking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Optimize,
});

const PRESETS: Record<string, Weights> = {
  Balanced: DEFAULT_WEIGHTS,
  "Time critical": { distance: 5, time: 60, congestion: 15, closures: 10, fuel: 0, reliability: 10 },
  "Eco / fuel": { distance: 20, time: 10, congestion: 15, closures: 5, fuel: 45, reliability: 5 },
  "Predictable": { distance: 5, time: 15, congestion: 25, closures: 20, fuel: 5, reliability: 30 },
};

function Optimize() {
  const { state } = useNetworkState();
  const [src, setSrc] = useState<NodeId | null>("BSK");
  const [dst, setDst] = useState<NodeId | null>("WF");
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);
  const [sel, setSel] = useState<string | null>(null);
  const plan = useMemo(() => (src && dst ? planRoutes(src, dst, state, "car", w) : null), [src, dst, state, w]);
  const cong = useMemo(() => congestionMap(state), [state]);
  const ranked = plan ? [...plan.candidates].sort((a, b) => b.score - a.score) : [];
  const activeKey = sel && ranked.some((r) => r.key === sel) ? sel : ranked[0]?.key;
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const radar = (Object.keys(FACTOR_LABELS) as (keyof Weights)[]).map((k) => ({
    factor: FACTOR_LABELS[k],
    ...Object.fromEntries(ranked.slice(0, 3).map((r, i) => [`R${i + 1}`, r.factors[k]])),
  }));

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Mandatory feature 5" title="Multi-Factor Route Optimization" description="Every candidate route is scored 0–100 per factor, then combined with your priority weights. Change the sliders to see the ranking update instantly." actions={<SimTag>Transparent scoring</SimTag>} />
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Journey">
            <div className="grid gap-3">
              <NodeSelect id="osrc" label="Source" value={src} onChange={setSrc} exclude={dst} />
              <NodeSelect id="odst" label="Destination" value={dst} onChange={setDst} exclude={src} />
            </div>
          </Panel>
          <Panel title="Your priorities" icon={SlidersHorizontal} actions={<Button size="sm" variant="ghost" onClick={() => setW(DEFAULT_WEIGHTS)}><RotateCcw /> Reset</Button>}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Object.entries(PRESETS).map(([k, v]) => <Button key={k} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setW(v)}>{k}</Button>)}
            </div>
            <div className="space-y-4">
              {(Object.keys(FACTOR_LABELS) as (keyof Weights)[]).map((k) => (
                <div key={k} className="space-y-1.5">
                  <div className="flex justify-between text-xs"><Label>{FACTOR_LABELS[k]}</Label><span className="font-mono text-muted-foreground">{Math.round((w[k] / total) * 100)}%</span></div>
                  <Slider min={0} max={60} value={[w[k]]} onValueChange={([v]) => setW((s) => ({ ...s, [k]: v }))} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
        {!plan ? (
          <EmptyState title="No routes" body="Choose two different, connected locations." />
        ) : (
          <div className="min-w-0 space-y-4">
            <TrafficMap
              className="h-[40vh] min-h-[320px]"
              congestion={cong}
              closedEdges={state.closedEdges}
              selected={{ source: src, destination: dst }}
              fitTo={ranked[0]?.nodes}
              routes={ranked.map((r, i) => ({ id: r.key, nodes: r.nodes, color: SERIES_HEX[i % SERIES_HEX.length], weight: r.key === activeKey ? 8 : 4, opacity: r.key === activeKey ? 1 : 0.5, onClick: () => setSel(r.key), label: `#${i + 1} · score ${r.score}` })).reverse()}
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
              <Panel title="Route comparison" icon={Trophy} bodyClassName="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b"><th className="px-4 py-2">Rank</th><th className="px-2">Score</th><th className="px-2">ETA</th><th className="px-2">Distance</th><th className="px-2">Fuel</th><th className="px-2">Congestion</th><th className="px-2">Reliability</th></tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => (
                        <tr key={r.key} onClick={() => setSel(r.key)} className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/30", r.key === activeKey && "bg-cyan/10")}>
                          <td className="px-4 py-2"><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_HEX[i % SERIES_HEX.length] }} />#{i + 1}{i === 0 && <Badge variant="violet">AI pick</Badge>}</span></td>
                          <td className="px-2 font-display text-lg font-bold tabular">{r.score}</td>
                          <td className="px-2 tabular">{r.metrics.etaMin} min</td>
                          <td className="px-2 tabular">{r.metrics.distanceKm} km</td>
                          <td className="px-2 tabular">{r.metrics.fuelL} L</td>
                          <td className="px-2 w-28"><Meter value={r.metrics.avgCongestion} /></td>
                          <td className="px-2 tabular">{r.metrics.reliability}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activeKey && (
                  <div className="border-t p-4">
                    <div className="text-xs text-muted-foreground">{describePath(ranked.find((r) => r.key === activeKey)!.nodes)}</div>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                      {(Object.keys(FACTOR_LABELS) as (keyof Weights)[]).map((k) => {
                        const v = ranked.find((r) => r.key === activeKey)!.factors[k];
                        return <div key={k}><div className="flex justify-between text-xs"><span className="text-muted-foreground">{FACTOR_LABELS[k]}</span><span className="tabular">{v}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-cyan" style={{ width: `${v}%` }} /></div></div>;
                      })}
                    </div>
                  </div>
                )}
              </Panel>
              <div className="space-y-4">
                <Panel title="Factor profile (top 3)">
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radar} outerRadius="70%">
                      <PolarGrid stroke="var(--color-border)" />
                      <PolarAngleAxis dataKey="factor" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      {ranked.slice(0, 3).map((_, i) => <Radar key={i} dataKey={`R${i + 1}`} name={`#${i + 1}`} stroke={SERIES_HEX[i]} fill={SERIES_HEX[i]} fillOpacity={0.15} />)}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip {...tooltipProps} />
                    </RadarChart>
                  </ResponsiveContainer>
                </Panel>
                <Panel title="Why #1 is selected" icon={Sparkles}>
                  <ul className="space-y-1.5 text-sm">{plan.explanation.map((x) => <li key={x} className="flex gap-2"><span className="text-violet">▸</span>{x}</li>)}</ul>
                </Panel>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
