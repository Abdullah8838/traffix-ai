import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Layers, Search, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, SimTag, CongestionBadge, KV } from "@/components/app/ui";
import { TrafficMap, type MapMarker, type MapRoute } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { congestion, congestionMap, edgeTravelMin, incidentsOnEdge, vehicleDensity } from "@/lib/traffic/conditions";
import { EDGE_MAP, NODES, NODE_MAP, nearestNode, type NodeId } from "@/lib/traffic/graph";
import { planRoutes, describePath } from "@/lib/traffic/routing";
import { planEmergency } from "@/lib/traffic/emergency";
import { INCIDENT_LABEL } from "@/lib/traffic/incidents";
import { isActive } from "@/hooks/use-traffic-data";
import { PALETTE, ROUTE_COLORS } from "@/lib/palette";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { IncidentType } from "@/lib/traffic/conditions";

export const Route = createFileRoute("/app/map")({
  head: () => ({
    meta: [
      { title: "Live Traffic Map — TRAFFIX AI" },
      { name: "description", content: "Interactive OpenStreetMap view of Bengaluru with congestion overlays, incidents, closures and routes." },
      { property: "og:title", content: "Live Traffic Map — TRAFFIX AI" },
      { property: "og:description", content: "Congestion overlays, incidents and routes on OpenStreetMap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MapPage,
});

interface GeoResult { name: string; lat: number; lng: number }

function MapPage() {
  const { state, incidents } = useNetworkState();
  const [src, setSrc] = useState<NodeId | null>("EC");
  const [dst, setDst] = useState<NodeId | null>("MG");
  const [layers, setLayers] = useState({ congestion: true, incidents: true, closures: true, route: true, emergency: false });
  const [q, setQ] = useState("");
  const [geo, setGeo] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [edge, setEdge] = useState<string | null>(null);

  const cong = useMemo(() => congestionMap(state), [state]);
  const plan = useMemo(() => (src && dst ? planRoutes(src, dst, state) : null), [src, dst, state]);
  const em = useMemo(() => (layers.emergency ? planEmergency("WF", "KOR", "ambulance", state) : null), [layers.emergency, state]);
  const local = q.trim().length > 1 ? NODES.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())) : [];

  const searchOsm = async () => {
    if (q.trim().length < 3) return;
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&bounded=1&viewbox=77.45,13.12,77.82,12.80&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error();
      const data = (await r.json()) as { display_name: string; lat: string; lon: string }[];
      setGeo(data.map((d) => ({ name: d.display_name, lat: +d.lat, lng: +d.lon })));
      if (!data.length) toast("No OpenStreetMap results in Bengaluru", { description: "Try a demo location instead." });
    } catch {
      toast.error("Geocoding service unavailable", { description: "Showing demo locations only." });
    } finally {
      setSearching(false);
    }
  };

  const pickPoint = (p: { lat: number; lng: number }) => {
    const n = nearestNode(p);
    if (!src || (src && dst)) {
      setSrc(n.id);
      setDst(null);
    } else setDst(n.id === src ? null : n.id);
  };

  const routes: MapRoute[] = [];
  if (layers.route && plan) routes.push({ id: "ai", nodes: plan.ai.nodes, color: ROUTE_COLORS.ai, label: `AI route · ${plan.ai.metrics.etaMin} min` });
  if (em) {
    routes.push({ id: "em-normal", nodes: em.normal.nodes, color: ROUTE_COLORS.normal, dashed: true, weight: 5, label: "Normal route" });
    routes.push({ id: "em", nodes: em.emergency.nodes, color: ROUTE_COLORS.emergency, label: "Emergency corridor (simulated)" });
  }
  const markers: MapMarker[] = [];
  if (layers.incidents)
    for (const i of incidents.filter(isActive))
      markers.push({ id: i.id, lat: i.lat, lng: i.lng, color: i.status === "verified" ? PALETTE.red : PALETTE.amber, label: INCIDENT_LABEL[i.type as IncidentType], detail: `${i.location_name} · ${i.status}` });
  if (layers.closures)
    for (const id of state.closedEdges) {
      const e = EDGE_MAP[id];
      const a = NODE_MAP[e.from], b = NODE_MAP[e.to];
      markers.push({ id: `c-${id}`, lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2, color: PALETTE.amber, radius: 10, label: "Road closure", detail: e.name });
    }
  for (const g of geo) markers.push({ id: `g-${g.lat}`, lat: g.lat, lng: g.lng, color: PALETTE.cyan, radius: 6, label: "Search result", detail: g.name });

  const sel = edge ? EDGE_MAP[edge] : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Live Traffic Map" description="Click the map or a junction to set source and destination. Congestion is simulated over a local road graph." actions={<SimTag>Simulated flow</SimTag>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <TrafficMap
          className="h-[68vh] min-h-[460px]"
          congestion={layers.congestion ? cong : undefined}
          closedEdges={layers.closures ? state.closedEdges : new Set()}
          routes={routes}
          markers={markers}
          selected={{ source: src, destination: dst }}
          onNodeClick={(id) => pickPoint(NODE_MAP[id])}
          onMapClick={pickPoint}
          onEdgeClick={setEdge}
          focus={focus}
          fitTo={plan?.ai.nodes ?? null}
        />
        <div className="space-y-4">
          <Panel title="Location search" icon={Search}>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && searchOsm()} placeholder="Silk Board, Whitefield…" />
              <Button variant="outline" size="icon" onClick={searchOsm} disabled={searching} aria-label="Search OpenStreetMap"><Search /></Button>
            </div>
            {(local.length > 0 || geo.length > 0) && (
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-sm">
                {local.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent">
                    <button className="truncate text-left" onClick={() => setFocus({ lat: n.lat, lng: n.lng, zoom: 14 })}>{n.name}</button>
                    <span className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setSrc(n.id)}>From</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setDst(n.id)}>To</Button>
                    </span>
                  </li>
                ))}
                {geo.map((g) => (
                  <li key={g.name}>
                    <button className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent" onClick={() => setFocus({ ...g, zoom: 15 })}>
                      {g.name} <span className="text-cyan">→ near {nearestNode(g).name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Journey" actions={(src || dst) && <Button size="sm" variant="ghost" onClick={() => { setSrc(null); setDst(null); }}><X /> Clear</Button>}>
            <KV k="Source" v={src ? NODE_MAP[src].name : "Click the map"} />
            <KV k="Destination" v={dst ? NODE_MAP[dst].name : "Click the map"} />
            {plan && (
              <div className="mt-2 rounded-lg border bg-background/30 p-3 text-sm">
                <div className="text-xs text-muted-foreground">AI-recommended</div>
                <div className="font-semibold">{plan.ai.metrics.etaMin} min · {plan.ai.metrics.distanceKm} km · score {plan.ai.score}</div>
                <div className="mt-1 text-xs text-muted-foreground">{describePath(plan.ai.nodes)}</div>
              </div>
            )}
          </Panel>
          <Panel title="Layers" icon={Layers}>
            {(Object.keys(layers) as (keyof typeof layers)[]).map((k) => (
              <div key={k} className="flex items-center justify-between py-1">
                <Label htmlFor={`l-${k}`} className="capitalize">{k === "emergency" ? "Emergency corridor demo" : k === "route" ? "AI route" : k}</Label>
                <Switch id={`l-${k}`} checked={layers[k]} onCheckedChange={(v) => setLayers((s) => ({ ...s, [k]: v }))} />
              </div>
            ))}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-2 w-6 rounded-full bg-success" /> free <span className="h-2 w-6 rounded-full bg-warning" /> moderate <span className="h-2 w-6 rounded-full bg-danger" /> heavy
            </div>
          </Panel>
          {sel && (
            <Panel title={sel.name} actions={<Button size="icon" variant="ghost" onClick={() => setEdge(null)} aria-label="Close"><X /></Button>}>
              <CongestionBadge value={congestion(sel, state)} />
              <KV k="Length" v={`${sel.lengthKm} km`} />
              <KV k="Lanes · limit" v={`${sel.lanes} · ${sel.speedLimit} km/h`} />
              <KV k="Travel time" v={state.closedEdges.has(sel.id) ? "Closed" : `${edgeTravelMin(sel, state).toFixed(1)} min`} />
              <KV k="Vehicle density" v={`${vehicleDensity(sel, congestion(sel, state))} veh/km`} />
              <KV k="Incidents" v={incidentsOnEdge(sel.id, state).length} />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
