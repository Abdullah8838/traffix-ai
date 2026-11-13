import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon, Search, X, CircleCheckBig } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIncidents, type IncidentRow, isActive } from "@/hooks/use-traffic-data";
import { useAuth } from "@/hooks/use-auth";
import { INCIDENT_LABEL, INCIDENT_TYPES, compareReports } from "@/lib/traffic/incidents";
import { roadNameFor } from "@/lib/traffic/incidents";
import type { IncidentType } from "@/lib/traffic/conditions";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, KV } from "./ui";

const STATUS_VARIANT = { pending: "warning", verified: "danger", rejected: "muted", resolved: "success" } as const;

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status as keyof typeof STATUS_VARIANT] ?? "muted"} className="capitalize">{status}</Badge>;
}

function Detail({ row, onClose, isAdmin, act }: { row: IncidentRow; onClose: () => void; isAdmin: boolean; act: (r: IncidentRow, s: string) => void }) {
  const { data: incidents = [] } = useIncidents();
  const ver = useQuery({
    queryKey: ["verifications", row.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("incident_verifications").select("*").eq("incident_id", row.id).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const img = useQuery({
    queryKey: ["incident-img", row.image_url],
    enabled: !!row.image_url,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("incident-images").createSignedUrl(row.image_url!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const nearby = incidents
    .filter((x) => x.id !== row.id && isActive(x))
    .map((x) => compareReports({ type: row.type as IncidentType, lat: row.lat, lng: row.lng, description: row.description, createdAt: new Date(row.created_at).getTime() }, { id: x.id, type: x.type as IncidentType, lat: x.lat, lng: x.lng, description: x.description, createdAt: new Date(x.created_at).getTime(), status: x.status, locationName: x.location_name }))
    .filter((m) => m.isDuplicate);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-strong max-w-lg">
        <DialogHeader>
          <DialogTitle>{INCIDENT_LABEL[row.type as IncidentType]} · {row.location_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <div className="flex gap-2"><StatusBadge status={row.status} />{row.is_demo && <Badge variant="violet">demo</Badge>}</div>
          <p className="py-2 text-sm">{row.description || "No description."}</p>
          <KV k="Road" v={roadNameFor(row.road_code)} />
          <KV k="Coordinates" v={`${row.lat.toFixed(4)}, ${row.lng.toFixed(4)}`} />
          <KV k="Reported severity" v={`${row.severity}/5`} />
          <KV k="AI severity estimate" v={row.estimated_severity ? `${row.estimated_severity}/5` : "—"} />
          <KV k="Confidence" v={`${Math.round(Number(row.confidence) * 100)}%`} />
          <KV k="Reports" v={row.report_count} />
          <KV k="Reported" v={new Date(row.created_at).toLocaleString()} />
          {row.resolved_at && <KV k="Resolved" v={new Date(row.resolved_at).toLocaleString()} />}
          {row.image_url && (img.data ? <img src={img.data} alt="Incident" className="mt-2 max-h-56 w-full rounded-lg object-cover" /> : <div className="flex items-center gap-2 text-xs text-muted-foreground"><ImageIcon className="h-4 w-4" /> Loading photo…</div>)}
          <div className="pt-2 text-xs font-semibold">Verifications ({ver.data?.length ?? 0})</div>
          {ver.data?.map((v) => <div key={v.id} className="text-xs text-muted-foreground">+1 confirmation · {Math.round(Number(v.similarity) * 100)}% similar · {Number(v.distance_m)} m · {v.note}</div>)}
          {nearby.length > 0 && <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">Possible duplicate of: {nearby.map((m) => m.incident.locationName).join(", ")}</div>}
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="success" onClick={() => act(row, "verified")} disabled={row.status === "verified"}><Check /> Approve</Button>
            <Button size="sm" variant="outline" onClick={() => act(row, "rejected")} disabled={row.status === "rejected"}><X /> Reject</Button>
            <Button size="sm" onClick={() => act(row, "resolved")} disabled={row.status === "resolved"}><CircleCheckBig /> Resolve</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function IncidentTable({ adminMode = false }: { adminMode?: boolean }) {
  const { data = [], isLoading, error } = useIncidents();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [open, setOpen] = useState<IncidentRow | null>(null);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    const r = data.filter(
      (i) => (status === "all" || i.status === status) && (type === "all" || i.type === type) && (!s || i.location_name.toLowerCase().includes(s) || i.description.toLowerCase().includes(s)),
    );
    const by: Record<string, (a: IncidentRow, b: IncidentRow) => number> = {
      newest: (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      severity: (a, b) => Number(b.estimated_severity ?? b.severity) - Number(a.estimated_severity ?? a.severity),
      confidence: (a, b) => Number(b.confidence) - Number(a.confidence),
      reports: (a, b) => b.report_count - a.report_count,
    };
    return [...r].sort(by[sort]);
  }, [data, q, status, type, sort]);

  const act = async (r: IncidentRow, next: string) => {
    const { error: e } = await supabase.from("incidents").update({ status: next, resolved_at: next === "resolved" ? new Date().toISOString() : null }).eq("id", r.id);
    if (e) { toast.error("Update failed", { description: e.message }); return; }
    toast.success(`Incident marked ${next}`);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["incidents"] });
  };
  const canAct = isAdmin && adminMode;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_150px_170px_150px]">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search location or description" className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status filter"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "pending", "verified", "rejected", "resolved"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger aria-label="Type filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{INCIDENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger aria-label="Sort"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="severity">Highest severity</SelectItem>
            <SelectItem value="confidence">Highest confidence</SelectItem>
            <SelectItem value="reports">Most reports</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error ? (
        <EmptyState title="Couldn't load incidents" body={(error as Error).message} />
      ) : isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
      ) : rows.length === 0 ? (
        <EmptyState title="No incidents match these filters" />
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Incident</th><th className="px-2">Status</th><th className="px-2">Severity</th><th className="px-2">Confidence</th><th className="px-2">Reports</th><th className="px-2">Reported</th>{canAct && <th className="px-2 text-right">Actions</th>}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-accent/30" onClick={() => setOpen(r)}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{INCIDENT_LABEL[r.type as IncidentType]}</div>
                    <div className="max-w-[280px] truncate text-xs text-muted-foreground">{r.location_name}</div>
                  </td>
                  <td className="px-2"><StatusBadge status={r.status} /></td>
                  <td className="px-2 tabular">{r.estimated_severity ?? r.severity}/5</td>
                  <td className="px-2 tabular">{Math.round(Number(r.confidence) * 100)}%</td>
                  <td className="px-2 tabular">{r.report_count}</td>
                  <td className="px-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                  {canAct && (
                    <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label="Approve" onClick={() => act(r, "verified")} disabled={r.status === "verified"}><Check className="text-success" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Reject" onClick={() => act(r, "rejected")} disabled={r.status === "rejected"}><X className="text-danger" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Resolve" onClick={() => act(r, "resolved")} disabled={r.status === "resolved"}><CircleCheckBig className="text-cyan" /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <Detail row={open} onClose={() => setOpen(null)} isAdmin={isAdmin} act={act} />}
    </div>
  );
}
