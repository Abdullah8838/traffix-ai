import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ambulance, Play, RotateCcw, Save, Siren, Timer, TimerOff, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, NodeSelect, SimTag, StatCard, SignInPrompt, EmptyState } from "@/components/app/ui";
import { TrafficMap } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { EMERGENCY_VEHICLES, corridorEdgeMin, junctionCorridorState, planEmergency, type EmergencyVehicle } from "@/lib/traffic/emergency";
import { NODE_MAP, type NodeId } from "@/lib/traffic/graph";
import { describePath } from "@/lib/traffic/routing";
import { PALETTE, ROUTE_COLORS } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/emergency")({
  head: () => ({
    meta: [
      { title: "Emergency Priority Routing — TRAFFIX AI" },
      { name: "description", content: "Route ambulances and fire brigades with a simulated green corridor that clears junctions ahead." },
      { property: "og:title", content: "Emergency Priority Routing — TRAFFIX AI" },
      { property: "og:description", content: "Simulated green corridors for emergency vehicles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Emergency,
});

const ANIM_SECONDS = 18;
const STATE_STYLE = {
  normal: "border-border text-muted-foreground",
  detecting: "border-warning/50 bg-warning/10 text-warning",
  green: "border-success/60 bg-success/15 text-success",
  restored: "border-border text-muted-foreground opacity-60",
} as const;
const STATE_LABEL = { normal: "Normal cycle", detecting: "Vehicle detected", green: "Priority green", restored: "Restored" } as const;

function Emergency() {
  const { state } = useNetworkState();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<EmergencyVehicle>("ambulance");
  const [src, setSrc] = useState<NodeId | null>("WF");
  const [dst, setDst] = useState<NodeId | null>("KOR");
  const [progress, setProgress] = useState(0); // minutes along route
  const [running, setRunning] = useState(false);
  const raf = useRef(0);

  const plan = useMemo(() => (src && dst ? planEmergency(src, dst, vehicle, state) : null), [src, dst, vehicle, state]);
  const cum = useMemo(() => {
    if (!plan) return [] as number[];
    let t = 0;
    return [0, ...plan.emergency.edges.map((e) => (t += corridorEdgeMin(e, state, vehicle)))];
  }, [plan, state, vehicle]);

  useEffect(() => {
    setProgress(0);
    setRunning(false);
  }, [src, dst, vehicle]);

  useEffect(() => {
    if (!running || !plan) return;
    const total = plan.emergency.etaMin;
    const start = performance.now() - (progress / total) * ANIM_SECONDS * 1000;
    const loop = (t: number) => {
      const p = Math.min(total, (((t - start) / 1000) / ANIM_SECONDS) * total);
      setProgress(p);
      if (p >= total) {
        setRunning(false);
        toast.success(`${EMERGENCY_VEHICLES[vehicle].label} arrived`, { description: `Simulated green corridor saved ${plan.timeSavedMin} min.` });
        return;
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, plan]);

  const pos = useMemo(() => {
    if (!plan) return null;
    const n = plan.emergency.nodes;
    let i = cum.findIndex((c) => c > progress) - 1;
    if (i < 0) i = n.length - 2;
    const f = Math.min(1, Math.max(0, (progress - cum[i]) / (cum[i + 1] - cum[i] || 1)));
    const a = NODE_MAP[n[i]], b = NODE_MAP[n[i + 1]];
    return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f };
  }, [plan, cum, progress]);

  const save = async () => {
    if (!user || !plan || !src || !dst) return;
    const { error } = await supabase.from("emergency_routes").insert({
      user_id: user.id, vehicle_type: vehicle, source: src, destination: dst, normal_eta_min: plan.normal.etaMin,
      emergency_eta_min: plan.emergency.etaMin, time_saved_min: plan.timeSavedMin, path: plan.emergency.nodes,
    });
    if (error) toast.error("Couldn't save dispatch", { description: error.message });
    else toast.success("Dispatch logged");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Mandatory feature 4"
        title="Emergency Vehicle Priority Routing"
        description="Routes weigh distance, travel time, congestion, incidents and closures. As the vehicle approaches each junction, its signal turns green for the emergency direction and then returns to normal."
        actions={<SimTag>Simulated green corridor</SimTag>}
      />
      <Panel bodyClassName="grid gap-3 md:grid-cols-[200px_1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Vehicle</Label>
          <Select value={vehicle} onValueChange={(v) => setVehicle(v as EmergencyVehicle)}>
            <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(EMERGENCY_VEHICLES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <NodeSelect id="esrc" label="Dispatch from" value={src} onChange={setSrc} exclude={dst} />
        <NodeSelect id="edst" label="Destination" value={dst} onChange={setDst} exclude={src} />
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => setRunning(true)} disabled={!plan || running}><Play /> Dispatch</Button>
          <Button variant="outline" onClick={() => { setRunning(false); setProgress(0); }}><RotateCcw /> Reset</Button>
          <Button variant="outline" onClick={save} disabled={!user || !plan}><Save /> Log</Button>
        </div>
      </Panel>
      <SignInPrompt what="log emergency dispatches" />
      {!plan ? (
        <EmptyState title="No emergency route available" body="Choose two different locations." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Normal route ETA" value={`${plan.normal.etaMin} min`} icon={TimerOff} tone="amber" hint="in regular traffic" />
            <StatCard label="Emergency route ETA" value={`${plan.emergency.etaMin} min`} icon={Timer} tone="red" hint={`${plan.emergency.distanceKm} km`} />
            <StatCard label="Estimated time saved" value={`${plan.timeSavedMin} min`} icon={Zap} tone="green" />
            <StatCard label="Priority junctions" value={plan.priorityJunctions.length} icon={Siren} tone="violet" hint={`${plan.avoidedIncidents.length} incidents avoided`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            <TrafficMap
              className="h-[56vh] min-h-[420px]"
              closedEdges={state.closedEdges}
              fitTo={[...plan.emergency.nodes, ...plan.normal.nodes]}
              routes={[
                { id: "normal", nodes: plan.normal.nodes, color: ROUTE_COLORS.normal, dashed: true, weight: 5, label: `Normal route · ${plan.normal.etaMin} min` },
                { id: "em", nodes: plan.emergency.nodes, color: ROUTE_COLORS.emergency, weight: 7, label: `Emergency corridor · ${plan.emergency.etaMin} min` },
              ]}
              highlightNodes={plan.priorityJunctions.filter((j) => junctionCorridorState(j.atMin, progress) === "green").map((j) => j.id)}
              markers={pos ? [{ id: "veh", lat: pos.lat, lng: pos.lng, color: PALETTE.red, radius: 10, label: EMERGENCY_VEHICLES[vehicle].label, detail: `${progress.toFixed(1)} / ${plan.emergency.etaMin} min` }] : []}
            />
            <Panel title="Green corridor timeline" icon={Ambulance}>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-danger transition-all" style={{ width: `${(progress / plan.emergency.etaMin) * 100}%` }} />
              </div>
              <ol className="space-y-1.5">
                {plan.priorityJunctions.map((j) => {
                  const s = junctionCorridorState(j.atMin, progress);
                  return (
                    <li key={j.id} className={cn("flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition", STATE_STYLE[s])}>
                      <span className="font-semibold">{j.name}</span>
                      <span className="flex items-center gap-2"><span className="font-mono">{j.atMin}m</span><Badge variant="outline" className="text-[10px]">{STATE_LABEL[s]}</Badge></span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div><b className="text-foreground">Corridor:</b> {describePath(plan.emergency.nodes)}</div>
                <div><b className="text-foreground">Normal:</b> {describePath(plan.normal.nodes)}</div>
                {plan.avoidedIncidents.length > 0 && <div className="text-warning">Avoids: {plan.avoidedIncidents.join(", ")}</div>}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Sequence: detect approaching vehicle → give its direction priority → switch to green → let it pass → restore normal operation. Simulated only.</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
