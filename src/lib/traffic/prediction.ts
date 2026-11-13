// Short-horizon congestion forecast. A transparent heuristic over historical
// demand profiles, incidents and conditions — not a trained ML model.
import { EDGES, NODE_MAP, connectedEdges, type RoadEdge } from "./graph";
import { clamp, congestion, demandProfile, edgeTravelMin, type NetworkState } from "./conditions";
import { astar } from "./algorithms";
import { ASTAR_MIN_PER_KM } from "./routing";

export const HORIZONS = [0, 5, 10, 15, 20, 30] as const;

export interface EdgePrediction {
  edge: RoadEdge;
  horizonMin: number;
  current: number;
  predicted: number;
  probability: number; // P(heavy congestion ≥ 0.7)
  riskScore: number; // 0..100
  confidence: number; // 0..1
  expectedInMin: number | null; // first horizon reaching heavy congestion
  trend: "rising" | "steady" | "easing";
  factors: { label: string; value: string }[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function futureState(s: NetworkState, minutes: number): NetworkState {
  return { ...s, minutesOfDay: s.minutesOfDay + minutes };
}

/** Predicted congestion on an edge `horizon` minutes ahead. */
export function predictLevel(edge: RoadEdge, horizon: number, s: NetworkState): number {
  const base = congestion(edge, futureState(s, horizon));
  // Unresolved incidents build queues over time; neighbours fill up after ~10 minutes.
  let growth = 0;
  const h = Math.min(horizon, 30) / 10;
  for (const inc of s.incidents) {
    if (inc.edgeId === edge.id) growth += inc.severity * 0.022 * h;
  }
  if (horizon >= 10)
    for (const n of connectedEdges(edge.id))
      for (const inc of s.incidents) if (inc.edgeId === n.id) growth += inc.severity * 0.008 * (h - 1);
  return clamp(base + growth, 0.03, 0.99);
}

export function predictEdge(edge: RoadEdge, horizon: number, s: NetworkState): EdgePrediction {
  const current = congestion(edge, s);
  const predicted = predictLevel(edge, horizon, s);
  const probability = sigmoid((predicted - 0.65) * 10);
  const nearby = s.incidents.filter((i) => i.edgeId === edge.id || connectedEdges(edge.id).some((n) => n.id === i.edgeId)).length;
  const confidence = clamp(0.93 - horizon * 0.006 - nearby * 0.035 - (s.weather === "clear" ? 0 : 0.05), 0.4, 0.95);
  const riskScore = Math.round(clamp(100 * (0.6 * predicted + 0.4 * probability) * (0.85 + edge.lanes / 40), 0, 100));
  let expectedInMin: number | null = null;
  for (const t of HORIZONS) {
    if (predictLevel(edge, t, s) >= 0.7) {
      expectedInMin = t;
      break;
    }
  }
  const delta = predicted - current;
  const trend = delta > 0.03 ? "rising" : delta < -0.03 ? "easing" : "steady";
  const dp = demandProfile(s.minutesOfDay + horizon, s.dayOfWeek);
  return {
    edge,
    horizonMin: horizon,
    current,
    predicted,
    probability,
    riskScore,
    confidence,
    expectedInMin,
    trend,
    factors: [
      { label: "Historical demand", value: `${Math.round(dp * 100)}%` },
      { label: "Road capacity", value: `${edge.lanes} lanes · ${edge.speedLimit} km/h` },
      { label: "Incidents nearby", value: String(nearby) },
      { label: "Weather", value: s.weather.replace("_", " ") },
      { label: "Demand multiplier", value: `×${s.densityMultiplier.toFixed(2)}` },
    ],
  };
}

export function predictNetwork(horizon: number, s: NetworkState): EdgePrediction[] {
  return EDGES.filter((e) => !s.closedEdges.has(e.id))
    .map((e) => predictEdge(e, horizon, s))
    .sort((a, b) => b.riskScore - a.riskScore);
}

/** Alternative path that avoids the given edge, for diversions. */
export function alternativeFor(edge: RoadEdge, s: NetworkState) {
  const blocked = new Set(s.closedEdges);
  blocked.add(edge.id);
  const st = { ...s, closedEdges: blocked };
  return astar(edge.from, edge.to, (e) => edgeTravelMin(e, st), ASTAR_MIN_PER_KM);
}

export interface EarlyWarning {
  edge: RoadEdge;
  nearName: string;
  inMinutes: number;
  probability: number;
  riskLevel: "Elevated" | "High" | "Critical";
  affected: string[];
  alternative: string | null;
  message: string;
}

/** Roads not yet heavy now but likely to become heavy within 30 minutes. */
export function earlyWarnings(s: NetworkState, limit = 6): EarlyWarning[] {
  const out: EarlyWarning[] = [];
  for (const e of EDGES) {
    if (s.closedEdges.has(e.id)) continue;
    const now = congestion(e, s);
    let when: number | null = null;
    let prob = 0;
    for (const t of HORIZONS.slice(1)) {
      const p = predictEdge(e, t, s);
      if (p.predicted >= 0.7 && p.predicted > now + 0.02) {
        when = t;
        prob = p.probability;
        break;
      }
    }
    if (when === null) continue;
    const near = NODE_MAP[e.from].kind === "junction" ? NODE_MAP[e.from].name : NODE_MAP[e.to].name;
    const alt = alternativeFor(e, s);
    const riskLevel = prob > 0.85 ? "Critical" : prob > 0.7 ? "High" : "Elevated";
    out.push({
      edge: e,
      nearName: near,
      inMinutes: when,
      probability: prob,
      riskLevel,
      affected: connectedEdges(e.id).slice(0, 3).map((x) => x.name),
      alternative: alt ? alt.nodes.map((n) => NODE_MAP[n].name).join(" → ") : null,
      message: `AI WARNING: ${riskLevel} congestion risk detected near ${near} in approximately ${when} minutes.`,
    });
  }
  return out.sort((a, b) => a.inMinutes - b.inMinutes || b.probability - a.probability).slice(0, limit);
}
