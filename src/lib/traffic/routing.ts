// Route planner + transparent multi-factor ranking engine.
import { astar, dijkstra, type PathResult } from "./algorithms";
import { ADJACENCY, NODE_MAP, type NodeId, type RoadEdge } from "./graph";
import {
  clamp,
  congestion,
  edgeFuelL,
  edgeTravelMin,
  incidentsOnEdge,
  type NetworkState,
  type VehicleType,
} from "./conditions";

/** Admissible A* bound: fastest possible vehicle (80 km/h × 1.08) in minutes per km. */
export const ASTAR_MIN_PER_KM = 60 / (80 * 1.08);

export type RouteKind = "shortest" | "fastest" | "ai";

export interface RouteMetrics {
  distanceKm: number;
  etaMin: number;
  avgCongestion: number;
  maxCongestion: number;
  fuelL: number;
  incidentCount: number;
  closureWarnings: string[];
  reliability: number;
}

export interface FactorScores {
  distance: number;
  time: number;
  congestion: number;
  closures: number;
  fuel: number;
  reliability: number;
}

export type Weights = FactorScores;

export const DEFAULT_WEIGHTS: Weights = {
  distance: 15,
  time: 30,
  congestion: 20,
  closures: 10,
  fuel: 10,
  reliability: 15,
};

export const FACTOR_LABELS: Record<keyof FactorScores, string> = {
  distance: "Distance",
  time: "Travel time",
  congestion: "Congestion",
  closures: "Closures & incidents",
  fuel: "Fuel",
  reliability: "Reliability",
};

export interface Route {
  key: string;
  nodes: NodeId[];
  edges: RoadEdge[];
  metrics: RouteMetrics;
  factors: FactorScores;
  score: number;
  algorithm: PathResult["algorithm"];
  visited: number;
}

export interface PlanResult {
  shortest: Route;
  fastest: Route;
  ai: Route;
  candidates: Route[];
  explanation: string[];
}

export function routeMetrics(edges: RoadEdge[], nodes: NodeId[], s: NetworkState, vehicle: VehicleType): RouteMetrics {
  let distanceKm = 0, etaMin = 0, fuelL = 0, wc = 0, maxC = 0, incidents = 0, lanes = 0;
  for (const e of edges) {
    const c = congestion(e, s);
    distanceKm += e.lengthKm;
    etaMin += edgeTravelMin(e, s, vehicle, c);
    fuelL += edgeFuelL(e, c, vehicle);
    wc += c * e.lengthKm;
    maxC = Math.max(maxC, c);
    incidents += incidentsOnEdge(e.id, s).length;
    lanes += e.lanes * e.lengthKm;
  }
  const closureWarnings = new Set<string>();
  for (const n of nodes)
    for (const a of ADJACENCY[n]) if (s.closedEdges.has(a.edge.id)) closureWarnings.add(a.edge.name);
  const avg = distanceKm ? wc / distanceKm : 0;
  const avgLanes = distanceKm ? lanes / distanceKm : 4;
  const reliability = clamp(
    Math.round(100 - 45 * avg - 9 * incidents - (maxC > 0.85 ? 12 : 0) + 3 * (avgLanes - 4) - 4 * closureWarnings.size),
    10,
    99,
  );
  return {
    distanceKm: +distanceKm.toFixed(2),
    etaMin: +etaMin.toFixed(1),
    avgCongestion: +avg.toFixed(3),
    maxCongestion: +maxC.toFixed(3),
    fuelL: +fuelL.toFixed(2),
    incidentCount: incidents,
    closureWarnings: [...closureWarnings],
    reliability,
  };
}

/** Score candidates 0–100 against each other using user weights. */
export function scoreRoutes(routes: Omit<Route, "factors" | "score">[], weights: Weights): Route[] {
  const minD = Math.min(...routes.map((r) => r.metrics.distanceKm));
  const minT = Math.min(...routes.map((r) => r.metrics.etaMin));
  const minF = Math.min(...routes.map((r) => r.metrics.fuelL));
  const wSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return routes.map((r) => {
    const m = r.metrics;
    const factors: FactorScores = {
      distance: Math.round((100 * minD) / m.distanceKm),
      time: Math.round((100 * minT) / m.etaMin),
      congestion: Math.round(100 * (1 - m.avgCongestion)),
      closures: clamp(Math.round(100 - 30 * m.closureWarnings.length - 15 * m.incidentCount), 0, 100),
      fuel: Math.round((100 * minF) / m.fuelL),
      reliability: m.reliability,
    };
    const score = Math.round(
      (Object.keys(factors) as (keyof FactorScores)[]).reduce((acc, k) => acc + factors[k] * weights[k], 0) / wSum,
    );
    return { ...r, factors, score };
  });
}

const pathKey = (nodes: NodeId[]) => nodes.join(">");

function build(p: PathResult, s: NetworkState, vehicle: VehicleType) {
  return {
    key: pathKey(p.nodes),
    nodes: p.nodes,
    edges: p.edges,
    metrics: routeMetrics(p.edges, p.nodes, s, vehicle),
    algorithm: p.algorithm,
    visited: p.visited,
  };
}

export function shortestPath(src: NodeId, dst: NodeId, s: NetworkState) {
  return dijkstra(src, dst, (e) => (s.closedEdges.has(e.id) ? Infinity : e.lengthKm));
}

export function fastestPath(src: NodeId, dst: NodeId, s: NetworkState, vehicle: VehicleType = "car") {
  return astar(src, dst, (e) => edgeTravelMin(e, s, vehicle), ASTAR_MIN_PER_KM);
}

export function planRoutes(
  src: NodeId,
  dst: NodeId,
  s: NetworkState,
  vehicle: VehicleType = "car",
  weights: Weights = DEFAULT_WEIGHTS,
): PlanResult | null {
  if (src === dst) return null;
  const sp = shortestPath(src, dst, s);
  const fp = fastestPath(src, dst, s, vehicle);
  if (!sp || !fp) return null;

  const raw = [build(sp, s, vehicle), build(fp, s, vehicle)];
  // Alternative candidates via iterative edge penalties.
  const penalty = new Map<string, number>();
  for (let i = 0; i < 4; i++) {
    for (const r of raw) for (const e of r.edges) penalty.set(e.id, (penalty.get(e.id) ?? 1) * 1.35);
    const alt = astar(src, dst, (e) => edgeTravelMin(e, s, vehicle) * (penalty.get(e.id) ?? 1), ASTAR_MIN_PER_KM);
    if (alt && !raw.some((r) => r.key === pathKey(alt.nodes))) raw.push(build(alt, s, vehicle));
  }
  const unique = raw.filter((r, i) => raw.findIndex((x) => x.key === r.key) === i);
  const scored = scoreRoutes(unique, weights);
  const byKey = (k: string) => scored.find((r) => r.key === k)!;
  const shortest = byKey(pathKey(sp.nodes));
  const fastest = byKey(pathKey(fp.nodes));
  const ai = [...scored].sort((a, b) => b.score - a.score || a.metrics.etaMin - b.metrics.etaMin)[0];
  return { shortest, fastest, ai, candidates: scored, explanation: explain(ai, scored, weights) };
}

export function explain(ai: Route, all: Route[], weights: Weights): string[] {
  const out: string[] = [];
  const others = all.filter((r) => r.key !== ai.key);
  const top = (Object.keys(weights) as (keyof Weights)[]).sort((a, b) => weights[b] - weights[a]).slice(0, 2);
  out.push(
    `Highest combined score (${ai.score}/100) with your priorities weighted most on ${top
      .map((k) => FACTOR_LABELS[k].toLowerCase())
      .join(" and ")}.`,
  );
  if (!others.length) {
    out.push("Only one viable path exists between these points under current conditions.");
    return out;
  }
  const slowest = Math.max(...others.map((r) => r.metrics.etaMin));
  if (slowest - ai.metrics.etaMin > 0.5)
    out.push(`Saves up to ${(slowest - ai.metrics.etaMin).toFixed(1)} min compared with the alternatives.`);
  const worstCong = Math.max(...others.map((r) => r.metrics.avgCongestion));
  if (worstCong - ai.metrics.avgCongestion > 0.03)
    out.push(
      `Average congestion is ${Math.round((worstCong - ai.metrics.avgCongestion) * 100)} points lower than the most congested option.`,
    );
  const maxInc = Math.max(...others.map((r) => r.metrics.incidentCount));
  if (maxInc > ai.metrics.incidentCount)
    out.push(`Avoids ${maxInc - ai.metrics.incidentCount} reported incident(s) found on other routes.`);
  if (ai.metrics.reliability >= Math.max(...others.map((r) => r.metrics.reliability)))
    out.push(`Most reliable option (${ai.metrics.reliability}/100) — fewer bottlenecks and wider roads.`);
  const shortestD = Math.min(...all.map((r) => r.metrics.distanceKm));
  if (ai.metrics.distanceKm - shortestD > 0.3)
    out.push(`Accepts ${(ai.metrics.distanceKm - shortestD).toFixed(1)} km extra distance to gain the benefits above.`);
  return out;
}

export function describePath(nodes: NodeId[]) {
  return nodes.map((n) => NODE_MAP[n].name).join(" → ");
}
