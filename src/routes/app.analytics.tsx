import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, History } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, SimTag, SignInPrompt, EmptyState } from "@/components/app/ui";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { congestion, formatClock } from "@/lib/traffic/conditions";
import { EDGES, NODE_MAP, type NodeId } from "@/lib/traffic/graph";
import { hotspotTrend, networkKpis, routeEfficiencySeries } from "@/lib/traffic/metrics";
import { compare, ratesForDensity } from "@/lib/traffic/signals";
import { INCIDENT_TYPES } from "@/lib/traffic/incidents";
import { axisProps, gridProps, tooltipProps, SERIES } from "@/components/app/chart-theme";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Reports — TRAFFIX AI" },
      { name: "description", content: "Traffic, incident, route and signal analytics with downloadable reports." },
      { property: "og:title", content: "Analytics & Reports — TRAFFIX AI" },
      { property: "og:description", content: "Smart city traffic analytics and CSV reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Analytics,
});

const SIGNAL_SWEEP = Array.from({ length: 10 }, (_, i) => {
  const c = compare(ratesForDensity(i + 1), 600);
  return { level: i + 1, improvement: c.waitImprovementPct, fixed: c.fixed.throughput, adaptive: c.adaptive.throughput };
});

function download(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Analytics() {
  const { state, incidents } = useNetworkState();
  const { user } = useAuth();
  const kpis = useMemo(() => networkKpis(state), [state]);
  const trend = useMemo(() => hotspotTrend(state, ["e03", "e05", "e07", "e08", "e30"]), [state]);
  const eff = useMemo(() => routeEfficiencySeries(state), [state]);
  const byType = INCIDENT_TYPES.map((t) => ({
    type: t.label,
    pending: incidents.filter((i) => i.type === t.value && i.status === "pending").length,
    verified: incidents.filter((i) => i.type === t.value && i.status === "verified").length,
    resolved: incidents.filter((i) => i.type === t.value && i.status === "resolved").length,
  }));
  const history = useQuery({
    queryKey: ["route_history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("route_history").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });
  const sims = useQuery({
    queryKey: ["signal_sims", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("signal_simulations").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });

  const exportNetwork = () =>
    download(`traffix-network-${formatClock(state.minutesOfDay).replace(":", "")}.csv`, [
      ["road_code", "road", "lanes", "length_km", "congestion_pct", "closed"],
      ...EDGES.map((e) => [e.id, e.name, e.lanes, e.lengthKm, Math.round(congestion(e, state) * 100), state.closedEdges.has(e.id) ? "yes" : "no"]),
    ]);
  const exportIncidents = () =>
    download("traffix-incidents.csv", [
      ["id", "type", "location", "status", "severity", "estimated_severity", "confidence", "reports", "created_at"],
      ...incidents.map((i) => [i.id, i.type, i.location_name, i.status, i.severity, i.estimated_severity ?? "", i.confidence, i.report_count, i.created_at]),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics & Reports"
        description={`Network efficiency ${kpis.efficiency}/100 · average congestion ${Math.round(kpis.avgCongestion * 100)}% at ${formatClock(state.minutesOfDay)}.`}
        actions={<><Button variant="outline" onClick={exportNetwork}><Download /> Network CSV</Button><Button variant="outline" onClick={exportIncidents}><Download /> Incidents CSV</Button><SimTag /></>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Daily congestion at key corridors" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hour" {...axisProps} interval={3} />
              <YAxis {...axisProps} unit="%" width={36} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => EDGES.find((e) => e.id === v)?.name.replace("Outer Ring Road", "ORR") ?? v} />
              {["e03", "e05", "e07", "e08", "e30"].map((id, i) => <Line key={id} dataKey={id} stroke={SERIES[i]} dot={false} strokeWidth={2} />)}
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Incidents by type & status">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byType}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="type" {...axisProps} interval={0} fontSize={10} />
              <YAxis {...axisProps} allowDecimals={false} width={28} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="pending" stackId="a" fill={SERIES[3]} />
              <Bar dataKey="verified" stackId="a" fill={SERIES[4]} />
              <Bar dataKey="resolved" stackId="a" fill={SERIES[5]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="AI signal gain by demand level">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={SIGNAL_SWEEP}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="level" {...axisProps} />
              <YAxis {...axisProps} unit="%" width={36} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="improvement" name="Wait time reduction" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="AI route score by corridor">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={eff}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="pair" {...axisProps} />
              <YAxis {...axisProps} domain={[0, 100]} width={30} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="score" name="AI route score" fill={SERIES[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <SignInPrompt what="see your saved routes and simulations" />
      {user && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Your route history" icon={History} bodyClassName="p-0">
            {!history.data?.length ? <div className="p-4"><EmptyState title="No saved routes" body="Save a route from the Smart Route Planner." /></div> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2">Trip</th><th>Type</th><th>ETA</th><th>Score</th></tr></thead>
                <tbody>{history.data.map((h) => (
                  <tr key={h.id} className="border-b last:border-0"><td className="px-4 py-1.5">{NODE_MAP[h.source as NodeId]?.name} → {NODE_MAP[h.destination as NodeId]?.name}</td><td className="capitalize">{h.route_kind}</td><td className="tabular">{h.eta_min} min</td><td className="tabular">{h.score}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
          <Panel title="Your signal simulations" bodyClassName="p-0">
            {!sims.data?.length ? <div className="p-4"><EmptyState title="No saved simulations" body="Run Compare on Adaptive Traffic Signals and save." /></div> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground"><tr className="border-b"><th className="px-4 py-2">Junction</th><th>Density</th><th>Wait fixed → AI</th><th>Gain</th></tr></thead>
                <tbody>{sims.data.map((s) => (
                  <tr key={s.id} className="border-b last:border-0"><td className="px-4 py-1.5">{s.junction}</td><td>L{s.density_level}</td><td className="tabular">{s.fixed_avg_wait}s → {s.adaptive_avg_wait}s</td><td className="tabular text-success">{s.improvement_pct}%</td></tr>
                ))}</tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
