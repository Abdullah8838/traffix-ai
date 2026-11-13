import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Ambulance, BrainCircuit, Clock, Gauge, Route as RouteIcon, Server, TriangleAlert, Waypoints } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, StatCard, SimTag, CongestionBadge, EmptyState } from "@/components/app/ui";
import { TrafficMap } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { congestionMap, formatClock } from "@/lib/traffic/conditions";
import { EDGES, EDGE_MAP } from "@/lib/traffic/graph";
import { earlyWarnings } from "@/lib/traffic/prediction";
import { dailyProfileSeries, hotspotTrend, networkKpis, routeEfficiencySeries } from "@/lib/traffic/metrics";
import { compare, ratesForDensity } from "@/lib/traffic/signals";
import { INCIDENT_LABEL, INCIDENT_TYPES } from "@/lib/traffic/incidents";
import { isActive } from "@/hooks/use-traffic-data";
import { axisProps, gridProps, tooltipProps, SERIES } from "@/components/app/chart-theme";
import { PALETTE } from "@/lib/palette";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IncidentType } from "@/lib/traffic/conditions";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Command Center — TRAFFIX AI" },
      { name: "description", content: "Live overview of Bengaluru's simulated traffic network: congestion, incidents, predictions and system status." },
      { property: "og:title", content: "Command Center — TRAFFIX AI" },
      { property: "og:description", content: "Smart city traffic overview dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const SIGNAL_CMP = [2, 4, 6, 8].map((d) => {
  const c = compare(ratesForDensity(d), 600);
  return { density: `L${d}`, fixed: c.fixed.avgWait, adaptive: c.adaptive.avgWait };
});

function Dashboard() {
  const { state, incidents, closures, loading, error } = useNetworkState();
  const { user } = useAuth();
  const cong = useMemo(() => congestionMap(state), [state]);
  const kpis = useMemo(() => networkKpis(state), [state]);
  const warnings = useMemo(() => earlyWarnings(state, 4), [state]);
  const profile = useMemo(() => dailyProfileSeries(state.dayOfWeek), [state.dayOfWeek]);
  const trend = useMemo(() => hotspotTrend(state), [state]);
  const efficiency = useMemo(() => routeEfficiencySeries(state), [state]);
  const active = incidents.filter(isActive);
  const dist = INCIDENT_TYPES.map((t) => ({ name: t.label, value: incidents.filter((i) => i.type === t.value).length })).filter((d) => d.value > 0);
  const emergencyCount = useQuery({
    queryKey: ["emergency-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase.from("emergency_routes").select("id", { count: "exact", head: true });
      return count ?? 0;
    },
  });
  const nowHour = Math.floor((((state.minutesOfDay % 1440) + 1440) % 1440) / 60);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Bengaluru · ${formatClock(state.minutesOfDay)}`}
        title="Command Center"
        description="Network-wide view of the simulated Bengaluru demonstration grid. Incidents and closures come from the database; traffic flow is simulated."
        actions={<SimTag>Demo data · simulated traffic</SimTag>}
      />
      {error && <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">Couldn't load incidents from the database. Showing simulated traffic only.</div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Monitored roads" value={EDGES.length} icon={Waypoints} hint={`${state.closedEdges.size} closed`} />
        <StatCard label="Active incidents" value={loading ? "…" : active.length} icon={TriangleAlert} tone="red" hint={`${incidents.filter((i) => i.status === "pending").length} awaiting review`} />
        <StatCard label="Avg congestion" value={`${Math.round(kpis.avgCongestion * 100)}%`} icon={Gauge} tone="amber" hint={`${kpis.heavyRoads} heavy roads`} />
        <StatCard label="Predicted alerts" value={warnings.length} icon={BrainCircuit} tone="violet" hint="next 30 min" />
        <StatCard label="Avg travel time" value={`${kpis.avgTripMin.toFixed(0)} min`} icon={Clock} tone="blue" hint="8 commuter corridors" />
        <StatCard label="Emergency routes" value={user ? emergencyCount.data ?? "…" : "—"} icon={Ambulance} tone="red" hint={user ? "dispatched by you" : "sign in to track"} />
        <StatCard label="Efficiency score" value={kpis.efficiency} icon={Activity} tone="green" hint="free-flow vs actual" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Traffic map preview" icon={RouteIcon} className="xl:col-span-2" actions={<Button asChild size="sm" variant="ghost"><Link to="/app/map">Open map</Link></Button>}>
          <TrafficMap className="h-[460px]" congestion={cong} closedEdges={state.closedEdges} markers={active.map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, color: PALETTE.red, label: INCIDENT_LABEL[i.type as IncidentType], detail: i.location_name }))} />
        </Panel>
        <Panel title="AI recommendations" icon={BrainCircuit}>
          {warnings.length === 0 ? (
            <EmptyState title="No congestion risks detected" body="The forecast engine sees no roads tipping into heavy congestion in the next 30 minutes." />
          ) : (
            <ul className="space-y-3">
              {warnings.map((w) => (
                <li key={w.edge.id} className="rounded-lg border bg-background/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={w.riskLevel === "Critical" ? "danger" : "warning"}>{w.riskLevel}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">in ~{w.inMinutes} min</span>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold">{w.edge.name}</div>
                  {w.alternative && <div className="mt-1 text-xs text-muted-foreground">Divert via {w.alternative}</div>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Traffic density over the day" icon={Activity} actions={<SimTag>Historical profile</SimTag>}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={profile}>
              <defs>
                <linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.5} /><stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hour" {...axisProps} interval={3} />
              <YAxis {...axisProps} unit="%" width={36} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="weekday" stroke={SERIES[0]} fill="url(#gw)" strokeWidth={2} />
              <Area type="monotone" dataKey="weekend" stroke={SERIES[2]} fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
          <p className="mt-1 text-xs text-muted-foreground">Now: {String(nowHour).padStart(2, "0")}:00 · weekday peaks near 09:30 and 18:45.</p>
        </Panel>
        <Panel title="Congestion trends at hotspots" icon={Gauge}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hour" {...axisProps} interval={3} />
              <YAxis {...axisProps} unit="%" width={36} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => EDGE_MAP[v as string]?.name.replace("Outer Ring Road", "ORR") ?? v} />
              {["e05", "e07", "e11", "e23"].map((id, i) => <Line key={id} type="monotone" dataKey={id} stroke={SERIES[i]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Incident distribution" icon={TriangleAlert}>
          {dist.length === 0 ? (
            <EmptyState title="No incidents recorded" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="none">
                  {dist.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                </Pie>
                <Tooltip {...tooltipProps} />
                <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="Signal waiting time: fixed vs AI" icon={Clock} actions={<SimTag />}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={SIGNAL_CMP}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="density" {...axisProps} />
              <YAxis {...axisProps} unit="s" width={40} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="fixed" name="Fixed timer" fill={SERIES[3]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="adaptive" name="AI adaptive" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Route efficiency by corridor" icon={RouteIcon} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={efficiency}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="pair" {...axisProps} />
              <YAxis {...axisProps} unit="m" width={40} />
              <Tooltip {...tooltipProps} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="shortest" name="Shortest route ETA" fill={SERIES[3]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="ai" name="AI route ETA" fill={SERIES[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Recent incidents" icon={TriangleAlert} className="lg:col-span-2" actions={<Button asChild size="sm" variant="ghost"><Link to="/app/incidents">View all</Link></Button>}>
          {incidents.length === 0 ? (
            <EmptyState title="No incidents yet" action={<Button asChild size="sm"><Link to="/app/report">Report one</Link></Button>} />
          ) : (
            <div className="divide-y">
              {incidents.slice(0, 6).map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{INCIDENT_LABEL[i.type as IncidentType]} · {i.location_name}</div>
                    <div className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()} · {i.report_count} report(s){i.is_demo ? " · demo" : ""}</div>
                  </div>
                  <Badge variant={i.status === "verified" ? "danger" : i.status === "pending" ? "warning" : i.status === "resolved" ? "success" : "muted"}>{i.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Notifications" icon={TriangleAlert}>
            <ul className="space-y-2 text-xs">
              {closures.filter((c) => c.active).map((c) => (
                <li key={c.id} className="rounded-md border border-warning/30 bg-warning/10 p-2 text-warning">Closure: {EDGE_MAP[c.road_code]?.name} — {c.reason}</li>
              ))}
              {warnings.slice(0, 2).map((w) => (
                <li key={w.edge.id} className="rounded-md border border-violet/30 bg-violet/10 p-2 text-violet">{w.message}</li>
              ))}
              {closures.length === 0 && warnings.length === 0 && <li className="text-muted-foreground">All clear.</li>}
            </ul>
          </Panel>
          <Panel title="System status" icon={Server}>
            <ul className="space-y-2 text-sm">
              {[
                ["Database", error ? "Degraded" : "Connected", !error],
                ["Prediction engine", "Running · heuristic", true],
                ["Route optimizer", "Dijkstra + A*", true],
                ["Signal simulator", "Online · simulated", true],
                ["Hottest road", Object.entries(cong).sort((a, b) => b[1] - a[1])[0] ? EDGE_MAP[Object.entries(cong).sort((a, b) => b[1] - a[1])[0][0]].name : "—", true],
              ].map(([k, v, ok]) => (
                <li key={k as string} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-danger"}`} />{k}</span>
                  <span className="truncate text-right text-xs font-medium">{v}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3"><CongestionBadge value={kpis.avgCongestion} /></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
