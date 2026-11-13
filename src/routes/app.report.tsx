import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Copy, MapPin, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, SignInPrompt, KV, Meter } from "@/components/app/ui";
import { TrafficMap } from "@/components/map/TrafficMap";
import { useNetworkState } from "@/hooks/use-network";
import { useAuth } from "@/hooks/use-auth";
import { isActive } from "@/hooks/use-traffic-data";
import { INCIDENT_LABEL, INCIDENT_TYPES, confidenceScore, estimateSeverity, findDuplicates } from "@/lib/traffic/incidents";
import { NODES, nearestEdge, nearestNode } from "@/lib/traffic/graph";
import type { IncidentType } from "@/lib/traffic/conditions";
import { PALETTE } from "@/lib/palette";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/report")({
  head: () => ({
    meta: [
      { title: "Report an Incident — TRAFFIX AI" },
      { name: "description", content: "Report accidents, roadblocks, flooding and signal failures with automatic duplicate detection." },
      { property: "og:title", content: "Report an Incident — TRAFFIX AI" },
      { property: "og:description", content: "Crowd-sourced incident reporting with AI duplicate detection." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Report,
});

function Report() {
  const { incidents } = useNetworkState();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [type, setType] = useState<IncidentType>("accident");
  const [point, setPoint] = useState({ lat: 12.9175, lng: 77.6292 });
  const [severity, setSeverity] = useState(3);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [forceNew, setForceNew] = useState(false);

  const road = useMemo(() => nearestEdge(point), [point]);
  const node = useMemo(() => nearestNode(point), [point]);
  const locationName = `${road.edge.name} near ${node.name}`;
  const existing = useMemo(
    () => incidents.filter(isActive).map((i) => ({ id: i.id, type: i.type as IncidentType, lat: i.lat, lng: i.lng, description: i.description, createdAt: new Date(i.created_at).getTime(), status: i.status, locationName: i.location_name })),
    [incidents],
  );
  const matches = useMemo(() => findDuplicates({ type, ...point, description, createdAt: Date.now() }, existing), [type, point, description, existing]);
  const dup = !forceNew ? matches.find((m) => m.isDuplicate) : undefined;
  const est = estimateSeverity(type, description, severity, point.lat, point.lng);
  const conf = confidenceScore({ reportCount: 1, descriptionLength: description.length, hasImage: !!file, distanceToRoadKm: road.distanceKm });

  const submit = async () => {
    if (!user) return;
    if (description.trim().length < 5) { toast.error("Add a short description (at least 5 characters)"); return; }
    if (file && file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setBusy(true);
    try {
      if (dup) {
        const { error } = await supabase.from("incident_verifications").insert({
          incident_id: dup.incident.id, user_id: user.id, similarity: dup.similarity, distance_m: dup.distanceM, note: description.slice(0, 1000),
        });
        if (error) throw new Error(error.code === "23505" ? "You have already confirmed this incident." : error.message);
        setDone(`Confirmed existing incident at ${dup.incident.locationName}. Its report count and confidence were increased.`);
      } else {
        let image_url: string | null = null;
        if (file) {
          const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
          const path = `${user.id}/${Date.now()}.${ext}`;
          const up = await supabase.storage.from("incident-images").upload(path, file, { contentType: file.type });
          if (up.error) throw up.error;
          image_url = path;
        }
        const { error } = await supabase.from("incidents").insert({
          reporter_id: user.id, type, lat: point.lat, lng: point.lng, location_name: locationName, road_code: road.edge.id,
          severity, estimated_severity: est, confidence: conf, description: description.trim().slice(0, 1000), image_url,
        });
        if (error) throw error;
        setDone("Incident submitted. It now feeds predictions and routing as a pending report until an administrator reviews it.");
      }
      qc.invalidateQueries({ queryKey: ["incidents"] });
      setDescription("");
      setFile(null);
      setForceNew(false);
    } catch (e) {
      toast.error("Couldn't submit report", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Mandatory feature 2" title="Incident Reporting" description="Click the map to pin the exact location. Reports are compared against active incidents for duplicates before saving." />
      <SignInPrompt what="submit incident reports" />
      {done && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {done}</span>
          <span className="flex gap-2"><Button asChild size="sm" variant="outline"><Link to="/app/incidents">View incidents</Link></Button><Button size="sm" variant="ghost" onClick={() => setDone(null)}>Dismiss</Button></span>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <TrafficMap
            className="h-[48vh] min-h-[360px]"
            onMapClick={setPoint}
            onNodeClick={(id) => { const n = NODES.find((x) => x.id === id)!; setPoint({ lat: n.lat, lng: n.lng }); }}
            focus={null}
            markers={[
              ...existing.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, color: PALETTE.amber, radius: 6, label: INCIDENT_LABEL[e.type], detail: e.locationName })),
              { id: "new", lat: point.lat, lng: point.lng, color: PALETTE.cyan, radius: 11, label: "Your report", detail: locationName },
            ]}
          />
          <Panel title="Duplicate & similarity analysis" icon={Copy}>
            {matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active incidents within 1.5 km. This will be a new report.</p>
            ) : (
              <ul className="space-y-2">
                {matches.slice(0, 4).map((m) => (
                  <li key={m.incident.id} className={`rounded-lg border p-3 text-sm ${m.isDuplicate ? "border-warning/50 bg-warning/10" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{INCIDENT_LABEL[m.incident.type]} · {m.incident.locationName}</span>
                      {m.isDuplicate ? <Badge variant="warning">Likely duplicate</Badge> : <Badge variant="muted">Distinct</Badge>}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-muted-foreground sm:grid-cols-5">
                      <span>Similarity <b className="text-foreground">{Math.round(m.similarity * 100)}%</b></span>
                      <span>Distance <b className="text-foreground">{m.distanceM} m</b></span>
                      <span>Proximity {Math.round(m.breakdown.proximity * 100)}%</span>
                      <span>Type {Math.round(m.breakdown.type * 100)}%</span>
                      <span>Text {Math.round(m.breakdown.text * 100)}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Similarity = 45% proximity (within 500 m) + 25% type match + 15% recency + 15% description overlap. ≥62% within 400 m counts as a duplicate.</p>
          </Panel>
        </div>
        <Panel title="Report details" icon={ShieldAlert}>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Incident type</Label>
              <Select value={type} onValueChange={(v) => setType(v as IncidentType)}>
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>{INCIDENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Location</Label>
              <div className="rounded-md border bg-background/30 px-3 py-2 text-sm">{locationName}</div>
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label="Latitude" type="number" step="0.0001" value={point.lat} onChange={(e) => setPoint((p) => ({ ...p, lat: +e.target.value }))} />
                <Input aria-label="Longitude" type="number" step="0.0001" value={point.lng} onChange={(e) => setPoint((p) => ({ ...p, lng: +e.target.value }))} />
              </div>
              {road.distanceKm > 1 && <p className="text-[11px] text-warning">This point is {road.distanceKm.toFixed(1)} km from the nearest monitored road.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label>Severity: {severity}/5</Label>
              <Slider min={1} max={5} step={1} value={[severity]} onValueChange={([v]) => setSeverity(v)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Two-wheeler collision blocking the left lane" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="img" className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" /> Photo (optional)</Label>
              <Input id="img" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <KV k="Timestamp" v={new Date().toLocaleString()} />
            <div className="rounded-lg border bg-background/30 p-3">
              <KV k="AI severity estimate" v={`${est} / 5`} />
              <KV k="Confidence score" v={`${Math.round(conf * 100)}%`} />
              <Meter value={conf} />
            </div>
            {dup && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                This matches an existing incident ({Math.round(dup.similarity * 100)}% similar, {dup.distanceM} m away). Submitting will confirm it instead of creating a duplicate.
                <button className="mt-1 block underline" onClick={() => setForceNew(true)}>It's a different incident — create a new report</button>
              </div>
            )}
            <Button onClick={submit} disabled={!user || busy} size="lg">
              <Send /> {busy ? "Submitting…" : dup ? "Confirm existing incident" : "Submit report"}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
