import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GitBranch, Network, Plus, Trash2, Waypoints } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, EdgeSelect, SimTag, EmptyState, StatCard } from "@/components/app/ui";
import { TrafficMap, type MapRoute } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { analyzeImpact } from "@/lib/traffic/impact";
import { congestionMap } from "@/lib/traffic/conditions";
import { EDGE_MAP, NODE_MAP } from "@/lib/traffic/graph";
import { INCIDENT_LABEL } from "@/lib/traffic/incidents";
import { isActive } from "@/hooks/use-traffic-data";
import { simStore } from "@/lib/traffic/store";
import { PALETTE, SERIES_HEX } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { IncidentType } from "@/lib/traffic/conditions";
import { Clock, Unplug } from "lucide-react";

export const Route = createFileRoute("/app/impact")({
  head: () => ({
    meta: [
      { title: "Network Impact Analysis — TRAFFIX AI" },
      { name: "description", content: "See how incidents and road closures ripple through connected Bengaluru roads, with diversions and added travel time." },
      { property: "og:title", content: "Network Impact Analysis — TRAFFIX AI" },
      { property: "og:description", content: "Interactive road closure simulator with cascade analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Impact,
});

function Impact() {
  const { state, incidents, settings } = useNetworkState();
  const [closed, setClosed] = useState<string[]>(["e05"]);
  const [pick, setPick] = useState<string | null>(null);
  const report = useMemo(() => analyzeImpact(closed, state), [closed, state]);
  const after = useMemo(() => ({ ...state, closedEdges: new Set([...state.closedEdges, ...closed]) }), [state, closed]);
  const cong = useMemo(() => congestionMap(after), [after]);

  const toggle = (id: string) => setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const routes: MapRoute[] = report.od.filter((o) => o.rerouted && o.afterNodes).map((o, i) => ({ id: `${o.from}-${o.to}`, nodes: o.afterNodes!, color: SERIES_HEX[i % SERIES_HEX.length], weight: 4, opacity: 0.85, dashed: true, label: `Diversion ${NODE_MAP[o.from].name} → ${NODE_MAP[o.to].name}` }));
  const hop1 = report.affectedRoads.filter((a) => a.hop === 1);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Mandatory feature 2"
        title="Network Impact Analysis"
        description="Click roads on the map to close or reopen them. The engine finds connected roads, recalculates commuter routes, estimates added travel time and recommends diversions."
        actions={<SimTag>Road closure simulator</SimTag>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <TrafficMap className="h-[58vh] min-h-[420px]" congestion={cong} closedEdges={after.closedEdges} onEdgeClick={toggle} routes={routes} highlightNodes={closed.flatMap((id) => [EDGE_MAP[id].from, EDGE_MAP[id].to])} />
        <div className="space-y-4">
          <Panel title="Closed in this analysis" icon={Unplug}>
            {closed.length === 0 ? <p className="text-sm text-muted-foreground">Click a road on the map or add one below.</p> : (
              <ul className="space-y-1.5">
                {closed.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm">
                    <span className="truncate">{EDGE_MAP[id].name}</span>
                    <Button size="icon" variant="ghost" aria-label="Reopen" onClick={() => toggle(id)}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1"><EdgeSelect id="add-close" label="Add road" value={pick} onChange={setPick} /></div>
              <Button size="icon" variant="outline" aria-label="Add" disabled={!pick} onClick={() => pick && !closed.includes(pick) && setClosed([...closed, pick])}><Plus /></Button>
            </div>
            <div className="mt-3 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Analyse an active incident</div>
              {incidents.filter(isActive).slice(0, 5).map((i) => (
                <button key={i.id} onClick={() => i.road_code && setClosed([i.road_code])} className="block w-full truncate rounded-md px-2 py-1 text-left text-xs hover:bg-accent">
                  {INCIDENT_LABEL[i.type as IncidentType]} · {i.location_name}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={!closed.length}
                onClick={() => {
                  simStore.set({ simulatedClosures: Array.from(new Set([...settings.simulatedClosures, ...closed])) });
                  toast.success("Applied as simulated closures", { description: "All modules now route around these roads. Use Reset demo to undo." });
                }}
              >
                Apply to whole demo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setClosed([])}>Clear</Button>
            </div>
          </Panel>
        </div>
      </div>

      {closed.length === 0 ? (
        <EmptyState title="No closures selected" body="Close at least one road to see its network impact." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Directly connected roads" value={hop1.length} icon={Network} tone="amber" />
            <StatCard label="Second-order roads" value={report.affectedRoads.length - hop1.length} icon={GitBranch} tone="violet" />
            <StatCard label="Added travel time" value={`+${report.totalExtraMin} min`} icon={Clock} tone="red" hint="across affected corridors" />
            <StatCard label="Corridors rerouted" value={report.od.filter((o) => o.rerouted).length} icon={Waypoints} tone="cyan" hint={report.disconnected ? `${report.disconnected} disconnected` : "all reachable"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Recommended diversions" icon={GitBranch}>
              <ul className="space-y-2 text-sm">{report.diversions.map((d) => <li key={d} className="rounded-md border bg-background/30 p-2">{d}</li>)}</ul>
              <div className="mt-4 text-xs font-semibold text-muted-foreground">Affected commuter corridors</div>
              <ul className="mt-1 space-y-2">
                {report.od.length === 0 && <li className="text-xs text-muted-foreground">No monitored corridor uses these roads.</li>}
                {report.od.map((o) => (
                  <li key={`${o.from}${o.to}`} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span>{NODE_MAP[o.from].name} → {NODE_MAP[o.to].name}</span>
                      <Badge variant={o.extraMin === null ? "danger" : (o.extraMin ?? 0) > 2 ? "warning" : "muted"}>{o.extraMin === null ? "no path" : `${o.extraMin >= 0 ? "+" : ""}${o.extraMin} min`}</Badge>
                    </div>
                    {o.rerouted && <div className="mt-1 text-muted-foreground">New path: {o.afterPath}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Affected connected roads" icon={Network} bodyClassName="p-0">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2">Road</th><th className="px-2">Link</th><th className="px-2">Before</th><th className="px-2">After</th></tr></thead>
                <tbody>
                  {report.affectedRoads.slice(0, 12).map((a) => (
                    <tr key={a.edge.id} className="border-b last:border-0">
                      <td className="px-4 py-1.5">{a.edge.name}</td>
                      <td className="px-2"><Badge variant={a.hop === 1 ? "warning" : "muted"}>{a.hop === 1 ? "direct" : "2nd-order"}</Badge></td>
                      <td className="px-2 tabular">{Math.round(a.before * 100)}%</td>
                      <td className="px-2 font-semibold tabular" style={{ color: a.after - a.before > 0.05 ? PALETTE.red : undefined }}>{Math.round(a.after * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
