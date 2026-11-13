// Network-level KPIs shared by dashboard and analytics.
import { EDGES, OD_PAIRS, EDGE_MAP } from "./graph";
import { baseState, congestion, demandProfile, type NetworkState } from "./conditions";
import { fastestPath, planRoutes } from "./routing";

export function networkKpis(s: NetworkState) {
  const open = EDGES.filter((e) => !s.closedEdges.has(e.id));
  const cs = open.map((e) => congestion(e, s));
  const free = baseState({ minutesOfDay: 3 * 60, dayOfWeek: s.dayOfWeek });
  let actual = 0, ff = 0, trips = 0;
  for (const [a, b] of OD_PAIRS) {
    const p = fastestPath(a, b, s);
    const f = fastestPath(a, b, free);
    if (p && f) {
      actual += p.cost;
      ff += f.cost;
      trips++;
    }
  }
  return {
    avgCongestion: cs.reduce((x, y) => x + y, 0) / Math.max(1, cs.length),
    heavyRoads: cs.filter((c) => c >= 0.7).length,
    avgTripMin: trips ? actual / trips : 0,
    efficiency: actual ? Math.round((ff / actual) * 100) : 0,
  };
}

export function dailyProfileSeries(dayOfWeek: number) {
  return Array.from({ length: 25 }, (_, h) => ({
    hour: `${String(h % 24).padStart(2, "0")}:00`,
    weekday: Math.round(demandProfile(h * 60, dayOfWeek === 0 || dayOfWeek === 6 ? 2 : dayOfWeek) * 100),
    weekend: Math.round(demandProfile(h * 60, 0) * 100),
  }));
}

export function hotspotTrend(s: NetworkState, ids = ["e05", "e07", "e11", "e23"]) {
  return Array.from({ length: 24 }, (_, h) => {
    const st = { ...s, minutesOfDay: h * 60 };
    const row: Record<string, number | string> = { hour: `${String(h).padStart(2, "0")}h` };
    for (const id of ids) row[id] = Math.round(congestion(EDGE_MAP[id], st) * 100);
    return row;
  });
}

export function routeEfficiencySeries(s: NetworkState) {
  return OD_PAIRS.map(([a, b]) => {
    const p = planRoutes(a, b, s);
    return {
      pair: `${a}→${b}`,
      shortest: p ? p.shortest.metrics.etaMin : 0,
      ai: p ? p.ai.metrics.etaMin : 0,
      score: p?.ai.score ?? 0,
    };
  });
}
