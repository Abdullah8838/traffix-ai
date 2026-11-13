import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Pause, Play, RotateCcw, Save, Sparkles, TrafficCone } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, SimTag, KV, StatCard, SignInPrompt } from "@/components/app/ui";
import { Intersection, type Crossing } from "@/components/app/Intersection";
import { useAuth } from "@/hooks/use-auth";
import { DIRS, compare, createSim, lightsFor, metrics, ratesForDensity, step, type Comparison, type Dir, type SignalMode, type SignalSim } from "@/lib/traffic/signals";
import { simStore } from "@/lib/traffic/store";
import { axisProps, gridProps, tooltipProps, SERIES } from "@/components/app/chart-theme";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Gauge, Layers, Timer } from "lucide-react";

export const Route = createFileRoute("/app/signals")({
  head: () => ({
    meta: [
      { title: "Adaptive Traffic Signals — TRAFFIX AI" },
      { name: "description", content: "Animated four-way intersection comparing fixed-time signals with AI-optimized adaptive timing." },
      { property: "og:title", content: "Adaptive Traffic Signals — TRAFFIX AI" },
      { property: "og:description", content: "Fixed vs AI-optimized signal simulation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Signals,
});

const SEED = 21;

function Signals() {
  const { user } = useAuth();
  const [mode, setMode] = useState<SignalMode>("fixed");
  const [density, setDensity] = useState(5);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [junction, setJunction] = useState("SB");
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const sim = useRef<SignalSim>(createSim(SEED));
  const crossings = useRef<Crossing[]>([]);
  const [, force] = useState(0);
  const [now, setNow] = useState(0);

  const signals = useQuery({
    queryKey: ["traffic_signals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("traffic_signals").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const rates = useMemo(() => ratesForDensity(density), [density]);
  const cfg = useMemo(() => ({ mode, rates, seed: SEED }), [mode, rates]);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  useEffect(() => {
    if (!running) return;
    let raf = 0, last = performance.now(), acc = 0, id = 0;
    const loop = (t: number) => {
      acc += ((t - last) / 1000) * speed;
      last = t;
      while (acc >= 1) {
        acc -= 1;
        const before = { ...sim.current.processedBy };
        step(sim.current, cfgRef.current);
        for (const d of DIRS) if (sim.current.processedBy[d] > before[d]) crossings.current.push({ id: ++id + sim.current.t * 10, dir: d, t0: t });
      }
      crossings.current = crossings.current.filter((c) => t - c.t0 < 900);
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  const reset = () => {
    sim.current = createSim(SEED);
    crossings.current = [];
    force((x) => x + 1);
  };
  const runCompare = () => {
    const c = compare(rates, 900, SEED);
    setCmp(c);
    toast.success(`AI signals cut average wait by ${c.waitImprovementPct}%`, { description: "15-minute simulation, identical arrivals for both modes." });
  };
  const optimize = () => {
    setMode("adaptive");
    simStore.set({ signalsOptimized: true });
    toast.success("AI optimization enabled", { description: "This junction and the city-wide simulation now use adaptive timing." });
  };
  const save = async () => {
    if (!user || !cmp) return;
    const { error } = await supabase.from("signal_simulations").insert({
      user_id: user.id, junction, density_level: density, fixed_avg_wait: cmp.fixed.avgWait, adaptive_avg_wait: cmp.adaptive.avgWait,
      fixed_processed: cmp.fixed.processed, adaptive_processed: cmp.adaptive.processed, improvement_pct: cmp.waitImprovementPct,
    });
    if (error) toast.error("Couldn't save", { description: error.message });
    else toast.success("Simulation saved");
  };

  const m = metrics(sim.current);
  const lights = lightsFor(sim.current.phase);
  const chart = cmp
    ? [
        { metric: "Avg wait (s)", fixed: cmp.fixed.avgWait, adaptive: cmp.adaptive.avgWait },
        { metric: "Avg queue", fixed: cmp.fixed.avgQueue, adaptive: cmp.adaptive.avgQueue },
        { metric: "Throughput /min", fixed: cmp.fixed.throughput, adaptive: cmp.adaptive.throughput },
      ]
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Mandatory feature 3"
        title="Adaptive Traffic Signal Optimization"
        description="A four-way junction simulation. The AI controller extends or cuts green time using queue length and accumulated waiting time. Conflicting directions are never green together. This does not control real signals."
        actions={<SimTag>Simulation only</SimTag>}
      />
      <Panel bodyClassName="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Junction</Label>
          <Select value={junction} onValueChange={setJunction}>
            <SelectTrigger className="w-56 bg-background/40"><SelectValue /></SelectTrigger>
            <SelectContent>{(signals.data ?? [{ node_code: "SB", name: "Silk Board Junction" }]).map((s) => <SelectItem key={s.node_code} value={s.node_code}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Signal mode</Label>
          <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as SignalMode)} className="rounded-md border p-0.5">
            <ToggleGroupItem value="fixed" className="px-3 text-xs">Traditional fixed</ToggleGroupItem>
            <ToggleGroupItem value="adaptive" className="px-3 text-xs">AI-optimized</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="w-48 space-y-2">
          <Label className="text-xs text-muted-foreground">Vehicle density: level {density}</Label>
          <Slider min={1} max={10} value={[density]} onValueChange={([v]) => setDensity(v)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Speed</Label>
          <ToggleGroup type="single" value={String(speed)} onValueChange={(v) => v && setSpeed(+v)} className="rounded-md border p-0.5">
            {[1, 4, 12].map((s) => <ToggleGroupItem key={s} value={String(s)} className="px-2.5 text-xs">{s}×</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button onClick={() => setRunning(true)} disabled={running}><Play /> Start</Button>
          <Button variant="outline" onClick={() => setRunning(false)} disabled={!running}><Pause /> Pause</Button>
          <Button variant="outline" onClick={reset}><RotateCcw /> Reset</Button>
          <Button variant="hero" onClick={optimize}><Sparkles /> Optimize</Button>
          <Button variant="glass" onClick={runCompare}><BarChart3 /> Compare</Button>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,560px)_1fr]">
        <Panel title={<>Live junction · <span className="font-mono text-xs text-muted-foreground">t = {sim.current.t}s · {sim.current.phase.replace("_", " ")}</span></>} icon={TrafficCone} bodyClassName="p-2">
          <div className="aspect-square w-full overflow-hidden rounded-lg">
            <Intersection sim={sim.current} crossings={crossings.current} now={now} />
          </div>
        </Panel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Average waiting" value={`${m.avgWait}s`} icon={Clock} tone="amber" />
            <StatCard label="Average queue" value={m.avgQueue} icon={Layers} tone="violet" />
            <StatCard label="Vehicles processed" value={m.processed} icon={Gauge} tone="green" />
            <StatCard label="Throughput" value={`${m.throughput}/min`} icon={Timer} tone="cyan" />
          </div>
          <Panel title="Approaches">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Direction</th><th>Signal</th><th>Arrivals</th><th>Queue</th><th>Longest wait</th><th>Processed</th></tr></thead>
              <tbody>
                {DIRS.map((d: Dir) => {
                  const q = sim.current.queues[d];
                  return (
                    <tr key={d} className="border-t">
                      <td className="py-1.5 font-semibold">{{ N: "North", S: "South", E: "East", W: "West" }[d]}</td>
                      <td><Badge variant={lights[d] === "green" ? "success" : lights[d] === "yellow" ? "warning" : "danger"}>{lights[d]}</Badge></td>
                      <td className="tabular">{rates[d]}/min</td>
                      <td className="tabular">{q.length}</td>
                      <td className="tabular">{q.length ? `${sim.current.t - q[0]}s` : "—"}</td>
                      <td className="tabular">{sim.current.processedBy[d]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
          <Panel title="Before & after: 15-minute comparison" icon={BarChart3} actions={cmp && <Button size="sm" variant="outline" onClick={save} disabled={!user}><Save /> Save</Button>}>
            {!cmp ? (
              <p className="text-sm text-muted-foreground">Press Compare to run both controllers on identical arrivals at density level {density}.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3"><div className="font-display text-2xl font-bold text-success">{cmp.waitImprovementPct}%</div><div className="text-xs text-muted-foreground">less waiting</div></div>
                  <div className="rounded-lg border border-cyan/30 bg-cyan/10 p-3"><div className="font-display text-2xl font-bold text-cyan">{cmp.queueImprovementPct}%</div><div className="text-xs text-muted-foreground">shorter queues</div></div>
                  <div className="rounded-lg border border-violet/30 bg-violet/10 p-3"><div className="font-display text-2xl font-bold text-violet">{cmp.throughputGainPct >= 0 ? "+" : ""}{cmp.throughputGainPct}%</div><div className="text-xs text-muted-foreground">throughput</div></div>
                </div>
                <ResponsiveContainer width="100%" height={200} className="mt-3">
                  <BarChart data={chart}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="metric" {...axisProps} />
                    <YAxis {...axisProps} width={36} />
                    <Tooltip {...tooltipProps} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="fixed" name="Traditional fixed" fill={SERIES[3]} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="adaptive" name="AI-optimized" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <KV k="Vehicles processed" v={`${cmp.fixed.processed} → ${cmp.adaptive.processed}`} />
                <KV k="Max queue" v={`${cmp.fixed.maxQueue} → ${cmp.adaptive.maxQueue}`} />
              </>
            )}
            <div className="mt-2"><SignInPrompt what="save simulation results" /></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
