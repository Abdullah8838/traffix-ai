import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, BrainCircuit, Construction, Copy, FlaskConical, Lock, Plus, ShieldCheck, Trash2, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, EdgeSelect, StatCard, EmptyState } from "@/components/app/ui";
import { IncidentTable } from "@/components/app/IncidentTable";
import { useAuth } from "@/hooks/use-auth";
import { useClosures, useIncidents, isActive } from "@/hooks/use-traffic-data";
import { EDGE_MAP } from "@/lib/traffic/graph";
import { compareReports, INCIDENT_LABEL } from "@/lib/traffic/incidents";
import type { IncidentType } from "@/lib/traffic/conditions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/admin")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — TRAFFIX AI" },
      { name: "description", content: "Administer incidents, road closures, prediction snapshots and simulations." },
      { property: "og:title", content: "Admin Dashboard — TRAFFIX AI" },
      { property: "og:description", content: "City administrator controls for TRAFFIX AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Admin,
});

function Closures() {
  const { data = [] } = useClosures();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [road, setRoad] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["road_closures"] });
  const add = async () => {
    if (!road) return;
    const { error } = await supabase.from("road_closures").insert({ road_code: road, reason: reason.slice(0, 300), created_by: user?.id });
    if (error) { toast.error("Couldn't add closure", { description: error.message }); return; }
    toast.success("Closure added — routing now avoids this road");
    setReason("");
    refresh();
  };
  const end = async (id: string, active: boolean) => {
    const { error } = await supabase.from("road_closures").update({ active: !active, ended_at: active ? new Date().toISOString() : null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("road_closures").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <EdgeSelect id="croad" label="Road" value={road} onChange={setRoad} />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. metro works)" maxLength={300} />
        <Button onClick={add} disabled={!road}><Plus /> Close road</Button>
      </div>
      {data.length === 0 ? <EmptyState title="No closures" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Road</th><th>Reason</th><th>Status</th><th>Since</th><th className="text-right pr-3">Actions</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{EDGE_MAP[c.road_code]?.name}</td>
                  <td className="text-muted-foreground">{c.reason}</td>
                  <td><Badge variant={c.active ? "danger" : "muted"}>{c.active ? "active" : "ended"}</Badge></td>
                  <td className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="pr-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => end(c.id, c.active)}>{c.active ? "Reopen road" : "Re-close"}</Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => del(c.id)}><Trash2 /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Duplicates() {
  const { data = [] } = useIncidents();
  const pairs = useMemo(() => {
    const act = data.filter(isActive);
    const out: { a: (typeof act)[number]; b: (typeof act)[number]; sim: number; d: number }[] = [];
    for (let i = 0; i < act.length; i++)
      for (let j = i + 1; j < act.length; j++) {
        const A = act[i], B = act[j];
        const m = compareReports(
          { type: A.type as IncidentType, lat: A.lat, lng: A.lng, description: A.description, createdAt: +new Date(A.created_at) },
          { id: B.id, type: B.type as IncidentType, lat: B.lat, lng: B.lng, description: B.description, createdAt: +new Date(B.created_at), status: B.status, locationName: B.location_name },
        );
        if (m.isDuplicate) out.push({ a: A, b: B, sim: m.similarity, d: m.distanceM });
      }
    return out;
  }, [data]);
  const qc = useQueryClient();
  const reject = async (id: string) => {
    const { error } = await supabase.from("incidents").update({ status: "rejected" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Duplicate rejected");
    qc.invalidateQueries({ queryKey: ["incidents"] });
  };
  if (!pairs.length) return <EmptyState title="No duplicate pairs among active incidents" body="New reports are merged automatically when they match an existing incident." />;
  return (
    <ul className="space-y-2">
      {pairs.map((p) => (
        <li key={p.a.id + p.b.id} className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{INCIDENT_LABEL[p.a.type as IncidentType]} · {p.a.location_name} <span className="text-muted-foreground">≈</span> {INCIDENT_LABEL[p.b.type as IncidentType]} · {p.b.location_name}</span>
            <Badge variant="warning">{Math.round(p.sim * 100)}% · {p.d} m</Badge>
          </div>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => reject(p.b.id)}><Ban /> Reject newer</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Predictions() {
  const q = useQuery({
    queryKey: ["predictions-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("congestion_predictions").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
  const qc = useQueryClient();
  const clear = async () => {
    const ids = (q.data ?? []).map((r) => r.id);
    if (!ids.length) return;
    const { error } = await supabase.from("congestion_predictions").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["predictions-admin"] });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Snapshots recorded from the AI Congestion Prediction page.</p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline"><Link to="/app/prediction">Record new snapshot</Link></Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={!q.data?.length}><Trash2 /> Clear shown</Button>
        </div>
      </div>
      {!q.data?.length ? <EmptyState title="No prediction snapshots yet" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Road</th><th>Horizon</th><th>Predicted</th><th>Probability</th><th>Risk</th><th>Confidence</th><th>Recorded</th></tr></thead>
            <tbody>{q.data.map((p) => (
              <tr key={p.id} className="border-t"><td className="px-3 py-1.5">{EDGE_MAP[p.road_code]?.name}</td><td>+{p.horizon_min}m</td><td className="tabular">{Math.round(Number(p.predicted_level) * 100)}%</td><td className="tabular">{Math.round(Number(p.probability) * 100)}%</td><td className="tabular">{p.risk_score}</td><td className="tabular">{Math.round(Number(p.confidence) * 100)}%</td><td className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString()}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Simulations() {
  const q = useQuery({
    queryKey: ["scenarios-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("simulation_scenarios").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const [filter, setFilter] = useState("");
  const qc = useQueryClient();
  const del = async (id: string) => {
    const { error } = await supabase.from("simulation_scenarios").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["scenarios-admin"] });
  };
  const rows = (q.data ?? []).filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()) || s.scenario_type.includes(filter.toLowerCase()));
  return (
    <div className="space-y-3">
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or type" className="max-w-xs" />
      {!rows.length ? <EmptyState title="No saved simulations" /> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Name</th><th>Type</th><th>Result</th><th>Created</th><th /></tr></thead>
            <tbody>{rows.map((s) => (
              <tr key={s.id} className="border-t"><td className="px-3 py-1.5 font-medium">{s.name}</td><td><Badge variant="muted">{s.scenario_type}</Badge></td><td className="max-w-xs truncate text-xs text-muted-foreground">{(s.results as { verdict?: string })?.verdict}</td><td className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()}</td><td><Button size="icon" variant="ghost" aria-label="Delete" onClick={() => del(s.id)}><Trash2 /></Button></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Admin() {
  const { user, isAdmin, loading } = useAuth();
  const { data: incidents = [] } = useIncidents();
  const { data: closures = [] } = useClosures();
  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-muted/40" />;
  if (!user || !isAdmin)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Administrators only</h1>
        <p className="mt-2 text-sm text-muted-foreground">{user ? "Your account doesn't have the administrator role. Approving, rejecting and resolving incidents is restricted on the server." : "Sign in with an administrator account to manage incidents and closures."}</p>
        {!user && <Button asChild className="mt-4"><Link to="/auth">Sign in</Link></Button>}
      </div>
    );
  return (
    <div className="space-y-4">
      <PageHeader title="Admin Dashboard" description="Every action here is enforced by database access rules — non-admin accounts cannot change incidents or closures." actions={<Badge variant="info" className="gap-1"><ShieldCheck className="h-3 w-3" /> Administrator</Badge>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending review" value={incidents.filter((i) => i.status === "pending").length} icon={TriangleAlert} tone="amber" />
        <StatCard label="Active closures" value={closures.filter((c) => c.active).length} icon={Construction} tone="red" />
        <StatCard label="Citizen reports" value={incidents.filter((i) => !i.is_demo).length} icon={Users} tone="cyan" />
        <StatCard label="Total reports incl. confirmations" value={incidents.reduce((a, i) => a + i.report_count, 0)} icon={Copy} tone="violet" />
      </div>
      <Tabs defaultValue="incidents">
        <TabsList className="flex-wrap">
          <TabsTrigger value="incidents"><TriangleAlert className="mr-1.5 h-3.5 w-3.5" />Incidents</TabsTrigger>
          <TabsTrigger value="duplicates"><Copy className="mr-1.5 h-3.5 w-3.5" />Duplicates</TabsTrigger>
          <TabsTrigger value="closures"><Construction className="mr-1.5 h-3.5 w-3.5" />Road closures</TabsTrigger>
          <TabsTrigger value="predictions"><BrainCircuit className="mr-1.5 h-3.5 w-3.5" />Predictions</TabsTrigger>
          <TabsTrigger value="simulations"><FlaskConical className="mr-1.5 h-3.5 w-3.5" />Simulations</TabsTrigger>
        </TabsList>
        <TabsContent value="incidents"><Panel><IncidentTable adminMode /></Panel></TabsContent>
        <TabsContent value="duplicates"><Panel><Duplicates /></Panel></TabsContent>
        <TabsContent value="closures"><Panel><Closures /></Panel></TabsContent>
        <TabsContent value="predictions"><Panel><Predictions /></Panel></TabsContent>
        <TabsContent value="simulations"><Panel><Simulations /></Panel></TabsContent>
      </Tabs>
    </div>
  );
}
