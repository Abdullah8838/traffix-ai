// Incident intelligence: duplicate detection, severity estimation, confidence.
import { EDGE_MAP, haversineKm, nearestEdge } from "./graph";
import { clamp, type IncidentType } from "./conditions";

export const INCIDENT_TYPES: { value: IncidentType; label: string; baseSeverity: number }[] = [
  { value: "accident", label: "Accident", baseSeverity: 4 },
  { value: "roadblock", label: "Roadblock", baseSeverity: 3 },
  { value: "congestion", label: "Heavy congestion", baseSeverity: 3 },
  { value: "construction", label: "Construction", baseSeverity: 2 },
  { value: "flooding", label: "Flooded road", baseSeverity: 4 },
  { value: "signal_failure", label: "Broken traffic signal", baseSeverity: 2 },
];

export const INCIDENT_LABEL: Record<IncidentType, string> = Object.fromEntries(
  INCIDENT_TYPES.map((t) => [t.value, t.label]),
) as Record<IncidentType, string>;

/** Types that often describe the same real-world event. */
const RELATED: Partial<Record<IncidentType, IncidentType[]>> = {
  accident: ["roadblock", "congestion"],
  roadblock: ["accident", "construction"],
  congestion: ["accident", "signal_failure", "flooding"],
  flooding: ["congestion", "roadblock"],
  signal_failure: ["congestion"],
  construction: ["roadblock"],
};

export interface ReportInput {
  type: IncidentType;
  lat: number;
  lng: number;
  description: string;
  createdAt: number;
}

export interface ExistingIncident extends ReportInput {
  id: string;
  status: string;
  locationName: string;
}

export interface DuplicateMatch {
  incident: ExistingIncident;
  similarity: number;
  distanceM: number;
  breakdown: { proximity: number; type: number; time: number; text: number };
  isDuplicate: boolean;
}

export const DUPLICATE_RADIUS_M = 400;
export const DUPLICATE_THRESHOLD = 0.62;

const STOP = new Set(["the", "a", "an", "near", "at", "on", "in", "of", "and", "to", "is", "road", "with"]);
function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function textSimilarity(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export function compareReports(r: ReportInput, x: ExistingIncident): DuplicateMatch {
  const distanceM = haversineKm(r, x) * 1000;
  const proximity = clamp(1 - distanceM / 500, 0, 1);
  const type = r.type === x.type ? 1 : RELATED[r.type]?.includes(x.type) ? 0.5 : 0;
  const minutes = Math.abs(r.createdAt - x.createdAt) / 60000;
  const time = clamp(1 - minutes / 180, 0, 1);
  const text = textSimilarity(r.description, x.description);
  const similarity = +(0.45 * proximity + 0.25 * type + 0.15 * time + 0.15 * text).toFixed(3);
  return {
    incident: x,
    similarity,
    distanceM: Math.round(distanceM),
    breakdown: { proximity, type, time, text },
    isDuplicate: similarity >= DUPLICATE_THRESHOLD && distanceM <= DUPLICATE_RADIUS_M,
  };
}

/** Matches against active incidents, most similar first. */
export function findDuplicates(r: ReportInput, existing: ExistingIncident[]): DuplicateMatch[] {
  return existing
    .filter((x) => x.status === "pending" || x.status === "verified")
    .map((x) => compareReports(r, x))
    .filter((m) => m.distanceM <= 1500)
    .sort((a, b) => b.similarity - a.similarity);
}

const SEVERE_WORDS = ["injur", "fire", "overturn", "blocked", "pile", "fatal", "collapsed", "deep", "stuck", "ambulance"];
const MILD_WORDS = ["minor", "slow", "partial", "one lane", "cleared", "small"];

export function estimateSeverity(type: IncidentType, description: string, userSeverity: number, lat: number, lng: number) {
  const base = INCIDENT_TYPES.find((t) => t.value === type)?.baseSeverity ?? 3;
  const d = description.toLowerCase();
  let s = base;
  s += SEVERE_WORDS.filter((w) => d.includes(w)).length * 0.6;
  s -= MILD_WORDS.filter((w) => d.includes(w)).length * 0.5;
  const { edge, distanceKm } = nearestEdge({ lat, lng });
  if (distanceKm < 0.6 && edge.lanes >= 6) s += 0.5; // arterial road impact
  const combined = 0.6 * s + 0.4 * userSeverity;
  return +clamp(combined, 1, 5).toFixed(1);
}

export function confidenceScore(opts: { reportCount: number; descriptionLength: number; hasImage: boolean; distanceToRoadKm: number }) {
  let c = 0.45;
  c += Math.min(0.3, (opts.reportCount - 1) * 0.12);
  c += Math.min(0.1, opts.descriptionLength / 600);
  if (opts.hasImage) c += 0.08;
  if (opts.distanceToRoadKm > 1) c -= 0.15;
  return +clamp(c, 0.1, 0.98).toFixed(3);
}

export function roadNameFor(edgeId: string | null | undefined) {
  return edgeId ? EDGE_MAP[edgeId]?.name ?? "Unknown road" : "Unknown road";
}
