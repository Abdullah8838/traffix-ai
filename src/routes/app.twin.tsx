import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ambulance, Box, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, SimTag, KV, CongestionBadge, NodeSelect } from "@/components/app/ui";
import { CityScene } from "@/components/city/CityScene";
import { useNetworkState } from "@/hooks/use-network";
import { congestionMap, edgeTravelMin, incidentsOnEdge, vehicleDensity } from "@/lib/traffic/conditions";
import { ADJACENCY, EDGE_MAP, NODE_MAP, type NodeId } from "@/lib/traffic/graph";
import { predictLevel } from "@/lib/traffic/prediction";
import { planEmergency } from "@/lib/traffic/emergency";
import { edgeVehicleCount, lightAt, type CityWorld } from "@/lib/traffic/citySim";
import { simStore } from "@/lib/traffic/store";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/app/twin")({
  head: () => ({
    meta: [
      { title: "3D Smart City Digital Twin — TRAFFIX AI" },
      { name: "description", content: "Explore a living low-poly 3D Bengaluru where vehicles follow roads, queue at signals and react to closures." },
      { property: "og:title", content: "3D Smart City Digital Twin — TRAFFIX AI" },
      { property: "og:description", content: "Interactive 3D traffic digital twin of Bengaluru." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Twin,
});

function Twin() {
  const { state, settings, incidents } = useNetworkState();
  const [running, setRunning] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [edge, setEdge] = useState<string | null>("e05");
  const [node, setNode] = useState<NodeId | null>(null);
  const [amb, setAmb] = useState<{ route: NodeId[]; key: number } | null>(null);
  const [from, setFrom] = useState<NodeId | null>("HEB");
  const [to, setTo] = useState<NodeId | null>("SB");
  const world = useRef<CityWorld | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 700);
    return () => clearInterval(id);
  }, []);

  const cong = useMemo(() => congestionMap(state), [state]);
  const active = incidents.filter((i) => i.status === "pending" || i.status === "verified").map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, severity: Number(i.estimated_severity ?? i.severity) }));
  const sel = edge ? EDGE_MAP[edge] : null;

  const dispatch = () => {
    if (!from || !to) return;
    const p = planEmergency(from, to, "ambulance", state);
    if (!p) return toast.error("No route for the ambulance");
    setAmb({ route: p.emergency.nodes, key: Date.now() });
    setRunning(true);
    toast.success("Ambulance dispatched", { description: `Signals ahead switch green as it approaches (simulated). ETA ${p.emergency.etaMin} min.` });
  };

  const w = world.current;
  const moving = w ? w.vehicles.filter((v) => !v.done && v.v > 0.1).length : 0;
  const total = w ? w.vehicles.filter((v) => !v.done).length : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="3D Smart City Digital Twin"
        description="Drag to rotate, scroll to zoom, right-drag to pan. Click a road or junction to inspect it. Geometry is generated from the road graph; traffic is simulated."
        actions={<SimTag>Generated geometry · simulated traffic</SimTag>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="relative h-[72vh] min-h-[480px] overflow-hidden rounded-xl border">
          <CityScene
            mode="twin"
            className="h-full w-full"
            congestion={cong}
            closed={state.closedEdges}
            incidents={active}
            signalsOptimized={settings.signalsOptimized}
            running={running}
            resetKey={resetKey}
            selectedEdge={edge}
            selectedNode={node}
            onSelectEdge={(id) => { setEdge(id); setNode(null); }}
            onSelectNode={(id) => { setNode(id); setEdge(null); }}
            ambulanceRoute={amb?.route}
            ambulanceKey={amb?.key}
            worldRef={world}
          />
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2">
            <Badge variant="info" className="glass-strong">{total} vehicles · {moving} moving</Badge>
            {settings.signalsOptimized && <Badge variant="success" className="glass-strong">AI signals on</Badge>}
          </div>
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
            <Button size="sm" variant="glass" onClick={() => setRunning(true)} disabled={running}><Play /> Start</Button>
            <Button size="sm" variant="glass" onClick={() => setRunning(false)} disabled={!running}><Pause /> Pause</Button>
            <Button size="sm" variant="glass" onClick={() => { setResetKey((k) => k + 1); setAmb(null); }}><RotateCcw /> Reset</Button>
          </div>
        </div>
        <div className="space-y-4">
          <Panel title="Simulation" icon={Box}>
            <div className="flex items-center justify-between py-1">
              <Label htmlFor="opt" className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-cyan" /> AI-optimized signals</Label>
              <Switch id="opt" checked={settings.signalsOptimized} onCheckedChange={(v) => simStore.set({ signalsOptimized: v })} />
            </div>
            <p className="text-[11px] text-muted-foreground">Adaptive junctions give green to the direction with more waiting vehicles.</p>
          </Panel>
          <Panel title="Dispatch ambulance" icon={Ambulance}>
            <div className="grid gap-2">
              <NodeSelect id="tf" label="From" value={from} onChange={setFrom} exclude={to} />
              <NodeSelect id="tt" label="To" value={to} onChange={setTo} exclude={from} />
              <Button variant="danger" onClick={dispatch}><Ambulance /> Dispatch</Button>
            </div>
          </Panel>
          {sel && (
            <Panel title={sel.name} actions={<Button size="icon" variant="ghost" aria-label="Close" onClick={() => setEdge(null)}><X /></Button>}>
              <CongestionBadge value={cong[sel.id]} />
              <KV k="Traffic level" v={state.closedEdges.has(sel.id) ? "Closed" : `${Math.round(cong[sel.id] * 100)}%`} />
              <KV k="Vehicle density" v={`${vehicleDensity(sel, cong[sel.id])} veh/km`} />
              <KV k="Vehicles in twin" v={w ? edgeVehicleCount(w, sel.id) : "—"} />
              <KV k="Est. travel time" v={state.closedEdges.has(sel.id) ? "—" : `${edgeTravelMin(sel, state).toFixed(1)} min`} />
              <KV k="Incidents" v={incidentsOnEdge(sel.id, state).length} />
              <KV k="Predicted (+15 min)" v={`${Math.round(predictLevel(sel, 15, state) * 100)}%`} />
              <KV k="Predicted (+30 min)" v={`${Math.round(predictLevel(sel, 30, state) * 100)}%`} />
            </Panel>
          )}
          {node && (
            <Panel title={NODE_MAP[node].name} actions={<Button size="icon" variant="ghost" aria-label="Close" onClick={() => setNode(null)}><X /></Button>}>
              <KV k="Connected roads" v={ADJACENCY[node].length} />
              <KV k="North–South signal" v={w ? lightAt(w, node, "NS") : "—"} />
              <KV k="East–West signal" v={w ? lightAt(w, node, "EW") : "—"} />
              <KV k="Priority mode" v={w?.signals[node]?.priority ? "Emergency green" : "Normal"} />
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {ADJACENCY[node].map((a) => <li key={a.edge.id}><button className="hover:text-foreground" onClick={() => { setEdge(a.edge.id); setNode(null); }}>{a.edge.name} · {Math.round(cong[a.edge.id] * 100)}%</button></li>)}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
