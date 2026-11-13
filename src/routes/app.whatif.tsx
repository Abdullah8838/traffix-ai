import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, EdgeSelect, NodeSelect, SimTag, SignInPrompt, EmptyState, StatCard } from "@/components/app/ui";
import { TrafficMap } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { SCENARIO_LABELS, runWhatIf, type Scenario, type ScenarioType, type WhatIfResult } from "@/lib/traffic/whatif";
import { congestionMap } from "@/lib/traffic/conditions";
import { NODE_MAP, type NodeId } from "@/lib/traffic/graph";
import { SERIES_HEX } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Clock, Gauge, Route as RouteIcon } from "lucide-react";

export const Route = createFileRoute("/app/whatif")({
  head: () => ({
    meta: [
      { title: "What-If Traffic Simulator — TRAFFIX AI" },
      { name: "description", content: "Test closures, accidents, demand surges, emergency entries and AI signals, and compare before vs after." },
      { property: "og:title", content: "What-If Traffic Simulator — TRAFFIX AI" },
      { property: "og:description", content: "Scenario testing for the Bengaluru road network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatIf,
});

function WhatIf() {
  const { state } = useNetworkState();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [type, setType] = useState<ScenarioType>("closure");
  const [edgeId, setEdgeId] = useState<string | null>("e07");
  const [severity, setSeverity] = useState(4);
  const [densityPct, setDensityPct] = useState(35);
  const [from, setFrom] = useState<NodeId | null>("WF");
  const [to, setTo] = useState<NodeId | null>("MG");
  const [result, setResult] = useState<{ sc: Scenario; r: WhatIfResult } | null>(null);
  const [name, setName] = useState("");

  const saved = useQuery({
    queryKey: ["scenarios", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("simulation_scenarios").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data;
    },
  });

  const scenario: Scenario = { type, edgeId: edgeId ?? undefined, severity, densityPct, from: from ?? undefined, to: to ?? undefined };
  const run = (sc: Scenario = scenario) => setResult({ sc, r: runWhatIf(state, sc) });
  const afterCong = useMemo(() => (result ? congestionMap(result.r.afterState) : congestionMap(state)), [result, state]);

  const save = async () => {
    if (!user || !result) return;
    const { error } = await supabase.from("simulation_scenarios").insert({
      user_id: user.id, name: (name || SCENARIO_LABELS[result.sc.type]).slice(0, 120), scenario_type: result.sc.type,
      params: result.sc as unknown as Json,
      results: { before: result.r.before.odTotalMin, after: result.r.after.odTotalMin, avgBefore: result.r.before.avgCongestion, avgAfter: result.r.after.avgCongestion, verdict: result.r.verdict } as Json,
    });
    if (error) { toast.error("Couldn't save scenario", { description: error.message }); return; }
    toast.success("Scenario saved");
    setName("");
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  };
  const remove = async (id: string) => {
    await supabase.from("simulation_scenarios").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  };

  const r = result?.r;
  const rerouted = r?.after.od.filter((o, i) => o.path !== r.before.od[i].path && o.nodes) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="What-If Traffic Simulator" description="Choose an event, run it against the current network and compare conditions before and after." actions={<SimTag>Scenario simulation</SimTag>} />
      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Panel title="Scenario" icon={FlaskConical}>
            <ToggleGroup type="single" value={type} onValueChange={(v) => v && setType(v as ScenarioType)} className="grid grid-cols-1 gap-1">
              {(Object.keys(SCENARIO_LABELS) as ScenarioType[]).map((t) => (
                <ToggleGroupItem key={t} value={t} className="justify-start border text-xs data-[state=on]:border-cyan data-[state=on]:bg-cyan/10">{SCENARIO_LABELS[t]}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="mt-4 grid gap-3">
              {(type === "closure" || type === "accident") && <EdgeSelect id="wedge" label="Road" value={edgeId} onChange={setEdgeId} />}
              {type === "accident" && (
                <div className="space-y-1.5"><Label className="text-xs">Severity {severity}/5</Label><Slider min={1} max={5} value={[severity]} onValueChange={([v]) => setSeverity(v)} /></div>
              )}
              {type === "density" && (
                <div className="space-y-1.5"><Label className="text-xs">Extra vehicles +{densityPct}%</Label><Slider min={5} max={80} step={5} value={[densityPct]} onValueChange={([v]) => setDensityPct(v)} /></div>
              )}
              {type === "emergency" && (
                <>
                  <NodeSelect id="wf" label="Ambulance from" value={from} onChange={setFrom} exclude={to} />
                  <NodeSelect id="wt" label="To" value={to} onChange={setTo} exclude={from} />
                </>
              )}
              {type === "signals" && <p className="text-xs text-muted-foreground">Switches every junction to adaptive AI timing.</p>}
              <Button onClick={() => run()}><Play /> Run scenario</Button>
            </div>
          </Panel>
          <Panel title="Saved scenarios">
            <SignInPrompt what="save scenarios" />
            {user && (saved.data?.length ? (
              <ul className="space-y-1.5">
                {saved.data.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs">
                    <button className="min-w-0 flex-1 truncate text-left hover:text-cyan" onClick={() => run(s.params as unknown as Scenario)}>{s.name}</button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Delete" onClick={() => remove(s.id)}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">No saved scenarios yet.</p>)}
          </Panel>
        </div>
        <div className="space-y-4">
          <TrafficMap
            className="h-[44vh] min-h-[340px]"
            congestion={afterCong}
            closedEdges={r?.afterState.closedEdges ?? state.closedEdges}
            routes={rerouted.map((o, i) => ({ id: `${o.from}${o.to}`, nodes: o.nodes!, color: SERIES_HEX[i % SERIES_HEX.length], dashed: true, weight: 4, label: `New route ${NODE_MAP[o.from].name} → ${NODE_MAP[o.to].name}` }))}
          />
          {!r ? (
            <EmptyState title="Run a scenario to see its impact" body="The map shows current conditions until then." />
          ) : (
            <>
              <div className="rounded-lg border border-violet/30 bg-violet/10 p-3 text-sm"><b>{SCENARIO_LABELS[result!.sc.type]}:</b> {r.verdict}</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <StatCard label="Avg congestion" value={`${Math.round(r.before.avgCongestion * 100)}% → ${Math.round(r.after.avgCongestion * 100)}%`} icon={Gauge} tone="amber" />
                <StatCard label="Heavy roads" value={`${r.before.heavyRoads} → ${r.after.heavyRoads}`} icon={RouteIcon} tone="red" />
                <StatCard label="Corridor travel time" value={`${r.before.odTotalMin} → ${r.after.odTotalMin} min`} icon={Clock} tone="cyan" hint="sum of 8 commuter trips" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Affected roads" bodyClassName="p-0">
                  {r.affected.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No road changed by more than 3 points.</p> : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2">Road</th><th className="px-2">Before</th><th className="px-2">After</th><th className="px-2 pr-4">Δ</th></tr></thead>
                      <tbody>{r.affected.slice(0, 10).map((a) => (
                        <tr key={a.edge.id} className="border-b last:border-0"><td className="px-4 py-1.5">{a.edge.name}</td><td className="px-2 tabular">{Math.round(a.before * 100)}%</td><td className="px-2 tabular">{Math.round(a.after * 100)}%</td><td className={`px-2 pr-4 tabular font-semibold ${a.after > a.before ? "text-danger" : "text-success"}`}>{a.after > a.before ? "+" : ""}{Math.round((a.after - a.before) * 100)}</td></tr>
                      ))}</tbody>
                    </table>
                  )}
                </Panel>
                <Panel title="Estimated delays & alternative routes">
                  <ul className="space-y-2">
                    {r.delays.map((d) => (
                      <li key={`${d.from}${d.to}`} className="rounded-md border p-2 text-xs">
                        <div className="flex justify-between font-semibold"><span>{NODE_MAP[d.from].name} → {NODE_MAP[d.to].name}</span>
                          <Badge variant={d.deltaMin === null ? "danger" : d.deltaMin > 1 ? "warning" : d.deltaMin < -0.5 ? "success" : "muted"}>{d.deltaMin === null ? "no path" : `${d.deltaMin > 0 ? "+" : ""}${d.deltaMin} min`}</Badge>
                        </div>
                        {d.rerouted && d.newPath && <div className="mt-1 text-muted-foreground">Alternative: {d.newPath}</div>}
                      </li>
                    ))}
                  </ul>
                  {user && (
                    <div className="mt-3 flex gap-2">
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name" maxLength={120} />
                      <Button onClick={save}><Save /> Save</Button>
                    </div>
                  )}
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
