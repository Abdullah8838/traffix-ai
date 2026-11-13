import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Database, Radar as RadarIcon, Siren } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, SimTag, KV, Meter, CongestionBadge } from "@/components/app/ui";
import { Radar } from "@/components/app/Radar";
import { TrafficMap } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { HORIZONS, alternativeFor, earlyWarnings, predictEdge, predictNetwork, predictLevel } from "@/lib/traffic/prediction";
import { EDGES, EDGE_MAP, connectedEdges, NODE_MAP } from "@/lib/traffic/graph";
import { congestionLabel, formatClock } from "@/lib/traffic/conditions";
import { describePath } from "@/lib/traffic/routing";
import { simStore } from "@/lib/traffic/store";
import { ROUTE_COLORS } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { axisProps, gridProps, tooltipProps, SERIES } from "@/components/app/chart-theme";

export const Route = createFileRoute("/app/prediction")({
  head: () => ({
    meta: [
      { title: "AI Congestion Prediction — TRAFFIX AI" },
      { name: "description", content: "15–30 minute congestion forecasts with probability, risk score and confidence for every Bengaluru road." },
      { property: "og:title", content: "AI Congestion Prediction — TRAFFIX AI" },
      { property: "og:description", content: "Forecast traffic before it happens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Prediction,
});

function Prediction() {
  const { state, settings } = useNetworkState();
  const { isAdmin, user } = useAuth();
  const horizon = settings.forecastOffset;
  const [selected, setSelected] = useState<string>("e05");
  const [saving, setSaving] = useState(false);

  const preds = useMemo(() => predictNetwork(horizon, state), [horizon, state]);
  const predMap = useMemo(() => Object.fromEntries(EDGES.map((e) => [e.id, predictLevel(e, horizon, state)])), [horizon, state]);
  const warnings = useMemo(() => earlyWarnings(state), [state]);
  const sel = EDGE_MAP[selected];
  const detail = useMemo(() => predictEdge(sel, horizon || 15, state), [sel, horizon, state]);
  const alt = useMemo(() => alternativeFor(sel, state), [sel, state]);
  const curve = useMemo(() => Array.from({ length: 13 }, (_, i) => ({ t: `+${i * 5}`, level: Math.round(predictLevel(sel, i * 5, state) * 100) })), [sel, state]);

  const shown = useRef(new Set<string>());
  useEffect(() => {
    for (const w of warnings.slice(0, 2)) {
      if (shown.current.has(w.edge.id)) continue;
      shown.current.add(w.edge.id);
      toast.warning(w.message, { description: w.alternative ? `Alternative: ${w.alternative}` : undefined });
    }
  }, [warnings]);

  const snapshot = async () => {
    setSaving(true);
    const rows = HORIZONS.slice(1).flatMap((h) =>
      predictNetwork(h, state).slice(0, 10).map((p) => ({
        road_code: p.edge.id, horizon_min: h, predicted_level: +p.predicted.toFixed(3), probability: +p.probability.toFixed(3),
        confidence: +p.confidence.toFixed(3), risk_score: p.riskScore, created_by: user?.id,
      })),
    );
    const { error } = await supabase.from("congestion_predictions").insert(rows);
    setSaving(false);
    if (error) toast.error("Snapshot failed", { description: error.message });
    else toast.success(`Recorded ${rows.length} predictions`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Mandatory feature 1"
        title="AI Congestion Prediction"
        description="A transparent forecasting heuristic combining historical demand profiles, time and day, road capacity, vehicle density, incidents, current congestion and weather. It is not a trained ML model."
        actions={<>{isAdmin && <Button variant="outline" onClick={snapshot} disabled={saving}><Database /> Record snapshot</Button>}<SimTag>Heuristic model</SimTag></>}
      />

      <Panel bodyClassName="flex flex-wrap items-center gap-2">
        <span className="mr-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">Future timeline</span>
        {HORIZONS.map((h) => (
          <button key={h} onClick={() => simStore.set({ forecastOffset: h })} className={cn("rounded-lg border px-3 py-1.5 font-mono text-sm transition", horizon === h ? "border-cyan bg-cyan/15 text-cyan shadow-glow" : "hover:bg-accent")}>
            {h === 0 ? "NOW" : `+${h} MIN`}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Showing {formatClock(state.minutesOfDay + horizon)} Bengaluru time</span>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <TrafficMap className="h-[52vh] min-h-[400px]" congestion={predMap} closedEdges={state.closedEdges} onEdgeClick={setSelected} routes={alt ? [{ id: "alt", nodes: alt.nodes, color: ROUTE_COLORS.fastest, dashed: true, weight: 4, label: "Suggested alternative" }] : []} />
        <Panel title="AI early warning radar" icon={RadarIcon}>
          <Radar warnings={warnings} onSelect={(w) => setSelected(w.edge.id)} />
          <ul className="mt-3 space-y-2">
            {warnings.length === 0 && <li className="text-xs text-muted-foreground">No roads predicted to tip into heavy congestion in the next 30 minutes.</li>}
            {warnings.slice(0, 4).map((w) => (
              <li key={w.edge.id}>
                <button onClick={() => setSelected(w.edge.id)} className="w-full rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-left text-xs hover:bg-warning/10">
                  <div className="flex items-center gap-1.5 font-semibold text-warning"><Siren className="h-3.5 w-3.5" /> {w.message}</div>
                  <div className="mt-1 text-muted-foreground">Road: {w.edge.name} · P={Math.round(w.probability * 100)}%</div>
                  {w.affected.length > 0 && <div className="text-muted-foreground">Affected: {w.affected.join(", ")}</div>}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title={`Highest-risk roads at ${horizon === 0 ? "now" : `+${horizon} min`}`} icon={BrainCircuit} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b"><th className="px-4 py-2">Road</th><th className="px-2">Predicted</th><th className="px-2">Probability</th><th className="px-2">Risk</th><th className="px-2">Confidence</th><th className="px-2">Heavy in</th></tr>
              </thead>
              <tbody>
                {preds.slice(0, 10).map((p) => (
                  <tr key={p.edge.id} onClick={() => setSelected(p.edge.id)} className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/40", selected === p.edge.id && "bg-cyan/10")}>
                    <td className="px-4 py-2 font-medium">{p.edge.name}</td>
                    <td className="px-2"><CongestionBadge value={p.predicted} /></td>
                    <td className="px-2 tabular">{Math.round(p.probability * 100)}%</td>
                    <td className="px-2 font-semibold tabular">{p.riskScore}</td>
                    <td className="px-2 tabular">{Math.round(p.confidence * 100)}%</td>
                    <td className="px-2 text-xs">{p.expectedInMin === null ? "—" : p.expectedInMin === 0 ? "now" : `${p.expectedInMin} min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={sel.name}>
          <div className="flex items-center gap-2">
            <Badge variant={detail.trend === "rising" ? "danger" : detail.trend === "easing" ? "success" : "muted"}>{detail.trend}</Badge>
            <span className="text-xs text-muted-foreground">forecast for +{detail.horizonMin} min</span>
          </div>
          <KV k="Current" v={`${Math.round(detail.current * 100)}% · ${congestionLabel(detail.current)}`} />
          <KV k="Predicted" v={`${Math.round(detail.predicted * 100)}% · ${congestionLabel(detail.predicted)}`} />
          <KV k="Congestion probability" v={`${Math.round(detail.probability * 100)}%`} />
          <KV k="Risk score" v={`${detail.riskScore}/100`} />
          <KV k="Confidence" v={`${Math.round(detail.confidence * 100)}%`} />
          <Meter value={detail.confidence} />
          <KV k="Expected heavy congestion" v={detail.expectedInMin === null ? "Not expected" : detail.expectedInMin === 0 ? "Already heavy" : `in ~${detail.expectedInMin} min`} />
          <div className="mt-2 text-xs text-muted-foreground">Affected roads: {connectedEdges(sel.id).map((e) => e.name).join(", ")}</div>
          <div className="mt-1 text-xs text-muted-foreground">Alternative: {alt ? describePath(alt.nodes) : "none available"}</div>
          <ResponsiveContainer width="100%" height={120} className="mt-3">
            <LineChart data={curve}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="t" {...axisProps} />
              <YAxis {...axisProps} domain={[0, 100]} width={28} />
              <Tooltip {...tooltipProps} />
              <ReferenceLine y={70} stroke="var(--color-danger)" strokeDasharray="3 3" />
              <Line dataKey="level" stroke={SERIES[0]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 rounded-lg border bg-background/30 p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Model inputs</div>
            {detail.factors.map((f) => <KV key={f.label} k={f.label} v={f.value} className="py-0.5 text-xs" />)}
            <KV k="Near" v={`${NODE_MAP[sel.from].name} ↔ ${NODE_MAP[sel.to].name}`} className="py-0.5 text-xs" />
          </div>
        </Panel>
      </div>
    </div>
  );
}
