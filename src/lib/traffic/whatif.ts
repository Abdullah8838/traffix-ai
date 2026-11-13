// What-if simulator: apply a scenario and compare network conditions.
import { EDGES, EDGE_MAP, OD_PAIRS, NODE_MAP, connectedEdges, type NodeId, type RoadEdge } from "./graph";
import { clamp, congestion, type ActiveIncident, type NetworkState } from "./conditions";
import { describePath, fastestPath } from "./routing";
import { planEmergency } from "./emergency";

export type ScenarioType = "closure" | "accident" | "density" | "emergency" | "signals";

export interface Scenario {
  type: ScenarioType;
  edgeId?: string;
  severity?: number;
  densityPct?: number;
  from?: NodeId;
  to?: NodeId;
}

export const SCENARIO_LABELS: Record<ScenarioType, string> = {
  closure: "Major road closure",
  accident: "Accident",
  density: "Increased vehicle density",
  emergency: "Emergency vehicle entry",
  signals: "AI signal optimization",
};

export function applyScenario(s: NetworkState, sc: Scenario): NetworkState {
  switch (sc.type) {
    case "closure":
      return sc.edgeId ? { ...s, closedEdges: new Set([...s.closedEdges, sc.edgeId]) } : s;
    case "accident": {
      if (!sc.edgeId) return s;
      const e = EDGE_MAP[sc.edgeId];
      const a = NODE_MAP[e.from], b = NODE_MAP[e.to];
      const inc: ActiveIncident = {
        id: "whatif",
        type: "accident",
        lat: (a.lat + b.lat) / 2,
        lng: (a.lng + b.lng) / 2,
        severity: sc.severity ?? 4,
        status: "verified",
        edgeId: e.id,
        locationName: e.name,
        confidence: 1,
        reportCount: 1,
        createdAt: Date.now(),
      };
      return { ...s, incidents: [...s.incidents, inc] };
    }
    case "density":
      return { ...s, densityMultiplier: s.densityMultiplier * (1 + (sc.densityPct ?? 30) / 100) };
    case "signals":
      return { ...s, signalsOptimized: true };
    case "emergency": {
      if (!sc.from || !sc.to) return s;
      const plan = planEmergency(sc.from, sc.to, "ambulance", s);
      if (!plan) return s;
      const adj: Record<string, number> = { ...(s.edgeAdjust ?? {}) };
      const onRoute = new Set(plan.emergency.edges.map((e) => e.id));
      // Cross traffic is held at red while the corridor is active.
      for (const n of plan.emergency.nodes)
        for (const e of EDGES)
          if ((e.from === n || e.to === n) && !onRoute.has(e.id)) adj[e.id] = (adj[e.id] ?? 0) + 0.07;
      for (const id of onRoute) adj[id] = (adj[id] ?? 0) + 0.04; // vehicles pulling over
      return { ...s, edgeAdjust: adj };
    }
  }
}

export interface NetworkSnapshot {
  avgCongestion: number;
  heavyRoads: number;
  odTotalMin: number;
  od: { from: NodeId; to: NodeId; minutes: number | null; path: string | null; nodes: NodeId[] | null }[];
}

export function snapshot(s: NetworkState): NetworkSnapshot {
  const open = EDGES.filter((e) => !s.closedEdges.has(e.id));
  const cs = open.map((e) => congestion(e, s));
  const od = OD_PAIRS.map(([from, to]) => {
    const p = fastestPath(from, to, s);
    return { from, to, minutes: p ? +p.cost.toFixed(1) : null, path: p ? describePath(p.nodes) : null, nodes: p?.nodes ?? null };
  });
  return {
    avgCongestion: +(cs.reduce((a, b) => a + b, 0) / Math.max(1, cs.length)).toFixed(3),
    heavyRoads: cs.filter((c) => c >= 0.7).length,
    odTotalMin: +od.reduce((a, o) => a + (o.minutes ?? 0), 0).toFixed(1),
    od,
  };
}

export interface WhatIfResult {
  before: NetworkSnapshot;
  after: NetworkSnapshot;
  affected: { edge: RoadEdge; before: number; after: number }[];
  delays: { from: NodeId; to: NodeId; deltaMin: number | null; rerouted: boolean; newPath: string | null }[];
  afterState: NetworkState;
  verdict: string;
}

export function runWhatIf(s: NetworkState, sc: Scenario): WhatIfResult {
  const afterState = applyScenario(s, sc);
  const before = snapshot(s);
  const after = snapshot(afterState);
  const affected = EDGES.map((edge) => ({ edge, before: congestion(edge, s), after: congestion(edge, afterState) }))
    .filter((r) => Math.abs(r.after - r.before) >= 0.03)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const delays = before.od.map((b, i) => {
    const a = after.od[i];
    return {
      from: b.from,
      to: b.to,
      deltaMin: a.minutes !== null && b.minutes !== null ? +(a.minutes - b.minutes).toFixed(1) : null,
      rerouted: a.path !== b.path,
      newPath: a.path !== b.path ? a.path : null,
    };
  });
  const delta = after.odTotalMin - before.odTotalMin;
  const verdict =
    Math.abs(delta) < 0.5
      ? "Network impact is negligible for the monitored commuter corridors."
      : delta > 0
        ? `Commuter corridors lose ${delta.toFixed(1)} min in total; ${delays.filter((d) => d.rerouted).length} trip(s) reroute.`
        : `Commuter corridors gain ${Math.abs(delta).toFixed(1)} min in total across monitored trips.`;
  return { before, after, affected, delays, afterState, verdict };
}

export function neighbourNames(edgeId: string) {
  return connectedEdges(edgeId).map((e) => e.name);
}

export const pct = (v: number) => `${Math.round(clamp(v, 0, 1) * 100)}%`;
