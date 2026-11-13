import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Cpu, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, NodeSelect, SimTag, SignInPrompt, EmptyState } from "@/components/app/ui";
import { RouteCard } from "@/components/app/RouteCard";
import { TrafficMap, type MapRoute } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { congestionMap, VEHICLES, type VehicleType } from "@/lib/traffic/conditions";
import { nearestNode, type NodeId } from "@/lib/traffic/graph";
import { describePath, planRoutes, shortestPath, type RouteKind } from "@/lib/traffic/routing";
import { dijkstra } from "@/lib/traffic/algorithms";
import { edgeTravelMin } from "@/lib/traffic/conditions";
import { ROUTE_COLORS } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/routes")({
  head: () => ({
    meta: [
      { title: "Smart Route Planner — TRAFFIX AI" },
      { name: "description", content: "Shortest, fastest and AI-recommended routes across Bengaluru using Dijkstra and A* pathfinding." },
      { property: "og:title", content: "Smart Route Planner — TRAFFIX AI" },
      { property: "og:description", content: "Dijkstra, A* and multi-factor AI route recommendations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoutePlanner,
});

const LABELS: Record<RouteKind, { title: string; subtitle: string }> = {
  shortest: { title: "Shortest route", subtitle: "Dijkstra · minimum distance" },
  fastest: { title: "Fastest route", subtitle: "A* · minimum travel time" },
  ai: { title: "AI-recommended", subtitle: "Best multi-factor score" },
};

function RoutePlanner() {
  const { state } = useNetworkState();
  const { user } = useAuth();
  const [src, setSrc] = useState<NodeId | null>("EC");
  const [dst, setDst] = useState<NodeId | null>("HEB");
  const [vehicle, setVehicle] = useState<VehicleType>("car");
  const [active, setActive] = useState<RouteKind>("ai");
  const [saving, setSaving] = useState(false);

  const plan = useMemo(() => (src && dst ? planRoutes(src, dst, state, vehicle) : null), [src, dst, state, vehicle]);
  const algo = useMemo(() => {
    if (!src || !dst || !plan) return null;
    const dj = dijkstra(src, dst, (e) => edgeTravelMin(e, state, vehicle));
    return { dijkstraVisited: dj?.visited ?? 0, astarVisited: plan.fastest.visited, shortestVisited: shortestPath(src, dst, state)?.visited ?? 0 };
  }, [src, dst, plan, state, vehicle]);
  const cong = useMemo(() => congestionMap(state), [state]);

  const routes: MapRoute[] = plan
    ? (["shortest", "fastest", "ai"] as RouteKind[])
        .sort((a) => (a === active ? 1 : -1))
        .map((k) => ({ id: k, nodes: plan[k].nodes, color: ROUTE_COLORS[k], weight: k === active ? 8 : 4, opacity: k === active ? 1 : 0.55, onClick: () => setActive(k), label: LABELS[k].title }))
    : [];

  const save = async () => {
    if (!user || !plan || !src || !dst) return;
    setSaving(true);
    const r = plan[active];
    const { error } = await supabase.from("route_history").insert({
      user_id: user.id, source: src, destination: dst, vehicle_type: vehicle, route_kind: active,
      distance_km: r.metrics.distanceKm, eta_min: r.metrics.etaMin, score: r.score, path: r.nodes,
    });
    setSaving(false);
    if (error) toast.error("Couldn't save route", { description: error.message });
    else toast.success("Route saved to your history");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Smart Route Planner" description="Pick a source and destination on the map or below. Switch between routes to compare them." actions={<SimTag>Simulated conditions</SimTag>} />
      <Panel bodyClassName="grid gap-3 md:grid-cols-[1fr_auto_1fr_200px_auto] md:items-end">
        <NodeSelect id="src" label="Source" value={src} onChange={setSrc} exclude={dst} />
        <Button variant="ghost" size="icon" aria-label="Swap" onClick={() => { setSrc(dst); setDst(src); }}><ArrowLeftRight /></Button>
        <NodeSelect id="dst" label="Destination" value={dst} onChange={setDst} exclude={src} />
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Vehicle type</Label>
          <Select value={vehicle} onValueChange={(v) => setVehicle(v as VehicleType)}>
            <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(VEHICLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={!user || !plan || saving}><Save /> Save</Button>
      </Panel>
      <SignInPrompt what="save routes to your history" />

      {!plan ? (
        <EmptyState title="No route available" body="Choose two different locations. If roads are closed, there may be no connecting path." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <TrafficMap
              className="h-[56vh] min-h-[420px]"
              congestion={cong}
              closedEdges={state.closedEdges}
              routes={routes}
              selected={{ source: src, destination: dst }}
              onNodeClick={(id) => (id !== src ? setDst(id) : undefined)}
              onMapClick={(p) => setDst(nearestNode(p).id)}
              fitTo={plan.ai.nodes}
            />
            <Panel title="Why the AI recommends this route" icon={Sparkles}>
              <ul className="space-y-1.5 text-sm">
                {plan.explanation.map((x) => <li key={x} className="flex gap-2"><span className="text-violet">▸</span>{x}</li>)}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">Path: {describePath(plan[active].nodes)}</p>
            </Panel>
          </div>
          <div className="space-y-3">
            {(["shortest", "fastest", "ai"] as RouteKind[]).map((k) => (
              <RouteCard key={k} {...LABELS[k]} route={plan[k]} color={ROUTE_COLORS[k]} active={active === k} onClick={() => setActive(k)} />
            ))}
            {algo && (
              <Panel title="Algorithm trace" icon={Cpu}>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border p-2"><div className="font-display text-lg font-bold">{algo.shortestVisited}</div>Dijkstra (distance)</div>
                  <div className="rounded-lg border p-2"><div className="font-display text-lg font-bold">{algo.dijkstraVisited}</div>Dijkstra (time)</div>
                  <div className="rounded-lg border border-cyan/40 p-2"><div className="font-display text-lg font-bold text-cyan">{algo.astarVisited}</div>A* (time)</div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Junctions expanded. A* uses a straight-line time heuristic, so it explores fewer junctions for the same optimal answer. {plan.candidates.length} candidate routes scored.</p>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
