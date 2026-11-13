// Transparent, deterministic traffic condition model (simulated data, not live feeds).
import { ADJACENCY, EDGES, EDGE_MAP, connectedEdges, type NodeId, type RoadEdge } from "./graph";

export type IncidentType =
  | "accident"
  | "roadblock"
  | "congestion"
  | "construction"
  | "flooding"
  | "signal_failure";

export type IncidentStatus = "pending" | "verified" | "rejected" | "resolved";

export interface ActiveIncident {
  id: string;
  type: IncidentType;
  lat: number;
  lng: number;
  severity: number;
  status: IncidentStatus;
  edgeId: string;
  locationName: string;
  confidence: number;
  reportCount: number;
  createdAt: number; // epoch ms
}

export type Weather = "clear" | "rain" | "heavy_rain";

export interface NetworkState {
  minutesOfDay: number; // Bengaluru local time, 0..1440
  dayOfWeek: number; // 0 = Sunday
  densityMultiplier: number; // 1 = normal demand
  weather: Weather;
  closedEdges: Set<string>;
  incidents: ActiveIncident[]; // only pending/verified
  signalsOptimized: boolean;
  /** Extra additive congestion per edge (scenario overrides). */
  edgeAdjust?: Record<string, number>;
}

export const WEATHER_FACTOR: Record<Weather, number> = { clear: 1, rain: 1.12, heavy_rain: 1.26 };

export interface VehicleProfile {
  label: string;
  speedFactor: number;
  fuelPer100Km: number; // litres
}

export const VEHICLES: Record<string, VehicleProfile> = {
  car: { label: "Car", speedFactor: 1, fuelPer100Km: 7.5 },
  bike: { label: "Two-wheeler", speedFactor: 1.08, fuelPer100Km: 2.6 },
  bus: { label: "Bus", speedFactor: 0.85, fuelPer100Km: 32 },
  truck: { label: "Truck", speedFactor: 0.8, fuelPer100Km: 28 },
};
export type VehicleType = keyof typeof VEHICLES;

const gauss = (x: number, m: number, s: number) => Math.exp(-((x - m) ** 2) / (2 * s * s));
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** City-wide demand profile 0..1 by time of day (historical-pattern stand-in). */
export function demandProfile(minutesOfDay: number, dayOfWeek: number): number {
  const h = (((minutesOfDay % 1440) + 1440) % 1440) / 60;
  const p = 0.16 + 0.62 * gauss(h, 9.5, 1.5) + 0.72 * gauss(h, 18.75, 1.7) + 0.2 * gauss(h, 13.5, 1.8);
  const weekend = dayOfWeek === 0 || dayOfWeek === 6 ? 0.72 : 1;
  return clamp(p * weekend, 0.05, 1);
}

const edgeIndex: Record<string, number> = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));

function incidentWeight(i: ActiveIncident) {
  return i.severity * 0.07 * (i.status === "verified" ? 1 : 0.7);
}

/** Congestion level 0..1 for an edge under the given network state. */
export function congestion(edge: RoadEdge, s: NetworkState): number {
  if (s.closedEdges.has(edge.id)) return 1;
  const idx = edgeIndex[edge.id] ?? 0;
  const profile = demandProfile(s.minutesOfDay, s.dayOfWeek);
  let c = edge.baseLoad * profile * 1.3 * s.densityMultiplier * WEATHER_FACTOR[s.weather];
  c += 0.05 * Math.sin(s.minutesOfDay / 37 + idx * 1.7);
  for (const inc of s.incidents) {
    if (inc.edgeId === edge.id) c += incidentWeight(inc);
  }
  // Spillover from incidents and closures on connected roads.
  for (const n of connectedEdges(edge.id)) {
    if (s.closedEdges.has(n.id)) c += 0.12 * (n.lanes / 6);
    for (const inc of s.incidents) if (inc.edgeId === n.id) c += incidentWeight(inc) * 0.3;
  }
  if (s.signalsOptimized) c *= 0.9;
  c += s.edgeAdjust?.[edge.id] ?? 0;
  return clamp(c, 0.03, 0.99);
}

export function congestionMap(s: NetworkState): Record<string, number> {
  return Object.fromEntries(EDGES.map((e) => [e.id, congestion(e, s)]));
}

export function edgeSpeedKmh(edge: RoadEdge, cong: number, vehicle: VehicleType = "car") {
  return Math.max(6, edge.speedLimit * VEHICLES[vehicle].speedFactor * (1 - 0.78 * cong));
}

/** Minutes to traverse an edge including the junction delay at its end. */
export function edgeTravelMin(edge: RoadEdge, s: NetworkState, vehicle: VehicleType = "car", cong?: number) {
  if (s.closedEdges.has(edge.id)) return Infinity;
  const c = cong ?? congestion(edge, s);
  const junction = (s.signalsOptimized ? 0.35 : 0.5) * c * 2;
  return (edge.lengthKm / edgeSpeedKmh(edge, c, vehicle)) * 60 + junction;
}

export function edgeFuelL(edge: RoadEdge, cong: number, vehicle: VehicleType = "car") {
  return (edge.lengthKm * VEHICLES[vehicle].fuelPer100Km * (1 + 0.7 * cong)) / 100;
}

export function congestionLabel(c: number): "Free flow" | "Moderate" | "Heavy" | "Severe" {
  if (c < 0.4) return "Free flow";
  if (c < 0.6) return "Moderate";
  if (c < 0.8) return "Heavy";
  return "Severe";
}

/** Vehicles per km per lane implied by congestion (jam density ~ 120). */
export function vehicleDensity(edge: RoadEdge, cong: number) {
  return Math.round(cong * 120 * edge.lanes * 0.5);
}

export function incidentsOnEdge(edgeId: string, s: NetworkState) {
  return s.incidents.filter((i) => i.edgeId === edgeId);
}

export function bengaluruNow(date = new Date()): { minutesOfDay: number; dayOfWeek: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    minutesOfDay: (parseInt(get("hour"), 10) % 24) * 60 + parseInt(get("minute"), 10),
    dayOfWeek: Math.max(0, days.indexOf(get("weekday"))),
  };
}

export function formatClock(minutesOfDay: number) {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function baseState(overrides: Partial<NetworkState> = {}): NetworkState {
  return {
    minutesOfDay: 9 * 60,
    dayOfWeek: 2,
    densityMultiplier: 1,
    weather: "clear",
    closedEdges: new Set(),
    incidents: [],
    signalsOptimized: false,
    ...overrides,
  };
}

export function degree(node: NodeId) {
  return ADJACENCY[node].length;
}

export { EDGE_MAP };
