import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudRain, Clock, RotateCcw, Save, Settings2, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, SignInPrompt } from "@/components/app/ui";
import { simStore, useSimSettings } from "@/lib/traffic/store";
import { formatClock, type Weather } from "@/lib/traffic/conditions";
import { useAuth } from "@/hooks/use-auth";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — TRAFFIX AI" },
      { name: "description", content: "Configure the TRAFFIX AI demo simulation: clock, demand, weather and signals." },
      { property: "og:title", content: "Settings — TRAFFIX AI" },
      { property: "og:description", content: "Simulation and profile settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SettingsPage() {
  const s = useSimSettings();
  const { user } = useAuth();
  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [name, setName] = useState("");
  useEffect(() => setName(profile.data?.display_name ?? ""), [profile.data]);

  const saveName = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ display_name: name.trim().slice(0, 60) }).eq("id", user.id);
    if (error) toast.error("Couldn't save", { description: error.message });
    else toast.success("Profile updated");
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Settings" description="These controls shape the simulated network everywhere in the app. They are stored on this device." actions={<Button variant="outline" onClick={() => { simStore.reset(); toast.success("Demo reset"); }}><RotateCcw /> Reset demo</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Clock" icon={Clock}>
          <div className="flex items-center justify-between py-1">
            <Label htmlFor="live">Use real Bengaluru time</Label>
            <Switch id="live" checked={s.liveClock} onCheckedChange={(v) => simStore.set({ liveClock: v })} />
          </div>
          {!s.liveClock && (
            <div className="mt-3 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Simulated time: {formatClock(s.fixedMinutes)}</Label>
                <Slider min={0} max={1435} step={15} value={[s.fixedMinutes]} onValueChange={([v]) => simStore.set({ fixedMinutes: v })} />
              </div>
              <ToggleGroup type="single" value={String(s.fixedDay)} onValueChange={(v) => v && simStore.set({ fixedDay: +v })} className="flex flex-wrap justify-start">
                {DAYS.map((d, i) => <ToggleGroupItem key={d} value={String(i)} className="border px-2.5 text-xs">{d}</ToggleGroupItem>)}
              </ToggleGroup>
            </div>
          )}
        </Panel>
        <Panel title="Network conditions" icon={CloudRain}>
          <div className="space-y-2">
            <Label className="text-xs">Vehicle demand ×{s.densityMultiplier.toFixed(2)}</Label>
            <Slider min={0.5} max={1.6} step={0.05} value={[s.densityMultiplier]} onValueChange={([v]) => simStore.set({ densityMultiplier: v })} />
          </div>
          <div className="mt-4 space-y-2">
            <Label className="text-xs">Weather (manual — no live weather feed)</Label>
            <ToggleGroup type="single" value={s.weather} onValueChange={(v) => v && simStore.set({ weather: v as Weather })} className="justify-start">
              <ToggleGroupItem value="clear" className="border px-3 text-xs">Clear</ToggleGroupItem>
              <ToggleGroupItem value="rain" className="border px-3 text-xs">Rain</ToggleGroupItem>
              <ToggleGroupItem value="heavy_rain" className="border px-3 text-xs">Heavy rain</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Label htmlFor="opt">AI-optimized signals city-wide</Label>
            <Switch id="opt" checked={s.signalsOptimized} onCheckedChange={(v) => simStore.set({ signalsOptimized: v })} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Label htmlFor="badge">Show DEMO MODE indicator</Label>
            <Switch id="badge" checked={s.showDemoBadge} onCheckedChange={(v) => simStore.set({ showDemoBadge: v })} />
          </div>
          {s.simulatedClosures.length > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {s.simulatedClosures.length} simulated closure(s) active
              <Button size="sm" variant="ghost" onClick={() => simStore.set({ simulatedClosures: [] })}>Clear</Button>
            </div>
          )}
        </Panel>
        <Panel title="Profile" icon={User}>
          <SignInPrompt what="edit your profile" />
          {user && (
            <div className="space-y-2">
              <Label htmlFor="dn">Display name</Label>
              <div className="flex gap-2">
                <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                <Button onClick={saveName}><Save /> Save</Button>
              </div>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          )}
        </Panel>
        <Panel title="About the data" icon={Settings2}>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Locations use real Bengaluru coordinates; the road network is a simplified local graph.</li>
            <li>• Traffic flow, predictions, signals and green corridors are simulated — not live data.</li>
            <li>• Incidents, closures, routes and simulations you save are stored in the database.</li>
            <li>• Map tiles © OpenStreetMap contributors, © CARTO.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
