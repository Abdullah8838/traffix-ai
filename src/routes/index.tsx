import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ambulance, ArrowRight, BrainCircuit, Box, Network, Radar, Route as RouteIcon, SlidersHorizontal, TrafficCone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CityScene } from "@/components/city/CityScene";
import { Logo } from "@/components/app/Logo";
import { CountUp } from "@/components/app/CountUp";
import { baseState, congestionMap } from "@/lib/traffic/conditions";
import { EDGES, NODES, OD_PAIRS } from "@/lib/traffic/graph";
import { HORIZONS } from "@/lib/traffic/prediction";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRAFFIX AI — Predict, Control & Optimize Urban Traffic" },
      { name: "description", content: "A 3D smart-city command center for Bengaluru: congestion prediction, smart routing, adaptive signals and emergency green corridors." },
      { property: "og:title", content: "TRAFFIX AI — The Future of Urban Mobility" },
      { property: "og:description", content: "Predict congestion before it happens. Optimize every journey. Build smarter cities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { to: "/app/prediction", icon: BrainCircuit, title: "AI congestion prediction", body: "15–30 minute forecasts with probability, risk and confidence for every road." },
  { to: "/app/impact", icon: Network, title: "Incident detection & network impact", body: "Duplicate-aware reporting and cascade analysis across connected roads." },
  { to: "/app/signals", icon: TrafficCone, title: "Adaptive traffic signals", body: "Queue- and wait-aware signal timing compared live against fixed cycles." },
  { to: "/app/emergency", icon: Ambulance, title: "Emergency priority routing", body: "Simulated green corridors that clear junctions ahead of ambulances." },
  { to: "/app/optimize", icon: SlidersHorizontal, title: "Multi-factor optimization", body: "Transparent 0–100 route scores across time, fuel, congestion and reliability." },
  { to: "/app/twin", icon: Box, title: "3D digital twin", body: "A living low-poly Bengaluru where vehicles queue, signals switch and jams form." },
] as const;

function Landing() {
  const congestion = useMemo(() => congestionMap(baseState({ minutesOfDay: 9 * 60 + 15 })), []);
  const closed = useMemo(() => new Set<string>(["e15"]), []);
  const incidents = useQuery({
    queryKey: ["landing-incidents"],
    queryFn: async () => {
      const { count, error } = await supabase.from("incidents").select("id", { count: "exact", head: true }).in("status", ["pending", "verified"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const stats = [
    { label: "Roads monitored", value: EDGES.length },
    { label: "Active incidents", value: incidents.data ?? 0 },
    { label: "AI predictions / cycle", value: EDGES.length * HORIZONS.length },
    { label: "Routes optimized / cycle", value: OD_PAIRS.length * 3 },
  ];

  return (
    <div className="min-h-screen bg-background">
      <section className="relative h-[100svh] min-h-[640px] overflow-hidden">
        <div className="absolute inset-0">
          <CityScene mode="showcase" congestion={congestion} closed={closed} incidents={[]} signalsOptimized={false} className="h-full w-full" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_45%,transparent,var(--background))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-fade-bottom" />

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild variant="glass" size="sm">
              <Link to="/app">
                Command center <ArrowRight />
              </Link>
            </Button>
          </div>
        </nav>

        <div className="relative z-10 mx-auto flex h-[calc(100%-80px)] max-w-7xl flex-col justify-center px-5 pb-28">
          <div className="animate-rise inline-flex w-fit items-center gap-2 rounded-full glass px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">
            <Radar className="h-3.5 w-3.5" /> PS 01 · Intelligent Traffic Management
          </div>
          <h1 className="animate-rise mt-5 max-w-4xl text-4xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl" style={{ animationDelay: "80ms" }}>
            THE FUTURE OF URBAN MOBILITY IS <span className="text-gradient">INTELLIGENT.</span>
          </h1>
          <p className="animate-rise mt-5 max-w-xl text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "160ms" }}>
            Predict congestion before it happens. Optimize every journey. Build smarter cities.
          </p>
          <div className="animate-rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            <Button asChild variant="hero" size="xl">
              <Link to="/app/twin">
                <Box /> Enter Smart City
              </Link>
            </Button>
            <Button asChild variant="glass" size="xl">
              <Link to="/app/prediction">
                <BrainCircuit /> Explore Traffic Intelligence
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl" className="bg-background/30">
              <Link to="/app">
                <RouteIcon /> Launch Command Center
              </Link>
            </Button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-6 z-10 mx-auto grid max-w-7xl grid-cols-2 gap-3 px-5 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-xl px-4 py-3">
              <div className="font-display text-2xl font-bold tabular sm:text-3xl">
                <CountUp to={s.value} />
              </div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20">
        <div className="max-w-2xl">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">Don't just navigate traffic</div>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Predict it. Control it. Optimize it.</h2>
          <p className="mt-3 text-muted-foreground">
            Every module runs on one road graph of {NODES.length} real Bengaluru locations, so a closure on the Outer Ring Road
            instantly changes predictions, routes, signals and the 3D city.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="group glass rounded-xl p-5 transition hover:-translate-y-1 hover:shadow-glow">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-cyan/10 text-cyan">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan">
                Open module <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-10 grid gap-4 rounded-xl border p-5 text-sm text-muted-foreground md:grid-cols-3">
          <div>
            <span className="font-semibold text-foreground">Algorithms:</span> Dijkstra, A* with an admissible time heuristic, penalty-based alternatives and
            weighted multi-factor scoring.
          </div>
          <div>
            <span className="font-semibold text-foreground">Honest data:</span> traffic, signals and corridors are simulated for demonstration; incidents and
            closures are stored in the database.
          </div>
          <div>
            <span className="font-semibold text-foreground">Open maps:</span> OpenStreetMap tiles with a graceful fallback to the local road graph.
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row">
          <Logo />
          <div className="font-display text-sm font-semibold tracking-[0.2em] text-foreground">ONE CITY. ONE INTELLIGENCE. SMARTER JOURNEYS.</div>
          <div>3D city geometry is generated · traffic is simulated</div>
        </div>
      </footer>
    </div>
  );
}
