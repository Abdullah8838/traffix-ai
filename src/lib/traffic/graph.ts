// Bengaluru demo road graph. Node coordinates are real-world locations; the
// road network is a simplified, locally defined graph for reliable demos.

export type NodeId =
  | "EC" | "HR" | "SB" | "BTM" | "HSR" | "BEL" | "SAR" | "MAR" | "WF" | "KRP" | "TF"
  | "KAL" | "HEB" | "MAN" | "MEK" | "MAJ" | "MG" | "IND" | "DOM" | "KOR" | "JAY" | "BSK";

export interface RoadNode {
  id: NodeId;
  name: string;
  lat: number;
  lng: number;
  /** District character used to shape the 3D skyline. */
  kind: "tech" | "commercial" | "residential" | "junction";
}

export interface RoadEdge {
  id: string;
  name: string;
  from: NodeId;
  to: NodeId;
  lanes: number;
  speedLimit: number; // km/h
  baseLoad: number; // typical peak load 0..1
  lengthKm: number;
}

export const NODES: RoadNode[] = [
  { id: "EC", name: "Electronic City", lat: 12.8452, lng: 77.6602, kind: "tech" },
  { id: "HR", name: "Hosa Road", lat: 12.878, lng: 77.646, kind: "junction" },
  { id: "SB", name: "Silk Board", lat: 12.9177, lng: 77.6238, kind: "junction" },
  { id: "BTM", name: "BTM Layout", lat: 12.9166, lng: 77.6101, kind: "residential" },
  { id: "HSR", name: "HSR Layout", lat: 12.9121, lng: 77.6446, kind: "residential" },
  { id: "BEL", name: "Bellandur", lat: 12.926, lng: 77.6762, kind: "tech" },
  { id: "SAR", name: "Sarjapur Road", lat: 12.901, lng: 77.687, kind: "residential" },
  { id: "MAR", name: "Marathahalli", lat: 12.9569, lng: 77.7011, kind: "commercial" },
  { id: "WF", name: "Whitefield", lat: 12.9698, lng: 77.75, kind: "tech" },
  { id: "KRP", name: "KR Puram", lat: 13.005, lng: 77.696, kind: "junction" },
  { id: "TF", name: "Tin Factory", lat: 12.9967, lng: 77.668, kind: "junction" },
  { id: "KAL", name: "Kalyan Nagar", lat: 13.0221, lng: 77.6403, kind: "residential" },
  { id: "HEB", name: "Hebbal", lat: 13.0358, lng: 77.597, kind: "junction" },
  { id: "MAN", name: "Manyata Tech Park", lat: 13.046, lng: 77.62, kind: "tech" },
  { id: "MEK", name: "Mekhri Circle", lat: 13.014, lng: 77.583, kind: "junction" },
  { id: "MAJ", name: "Majestic", lat: 12.9767, lng: 77.5713, kind: "commercial" },
  { id: "MG", name: "MG Road", lat: 12.9756, lng: 77.6066, kind: "commercial" },
  { id: "IND", name: "Indiranagar", lat: 12.9784, lng: 77.6408, kind: "commercial" },
  { id: "DOM", name: "Domlur", lat: 12.961, lng: 77.6387, kind: "junction" },
  { id: "KOR", name: "Koramangala", lat: 12.9352, lng: 77.6245, kind: "commercial" },
  { id: "JAY", name: "Jayanagar", lat: 12.925, lng: 77.5938, kind: "residential" },
  { id: "BSK", name: "Banashankari", lat: 12.9255, lng: 77.5468, kind: "residential" },
];

type EdgeSpec = [string, string, NodeId, NodeId, number, number, number];

// Mirrors the seeded `roads` table (code, name, from, to, lanes, speed, base load).
const EDGE_SPECS: EdgeSpec[] = [
  ["e01", "Hosur Road Elevated Expressway", "EC", "HR", 6, 80, 0.35],
  ["e02", "Hosur Road (Bommanahalli)", "HR", "SB", 4, 50, 0.72],
  ["e03", "Outer Ring Road (Silk Board–BTM)", "SB", "BTM", 6, 50, 0.78],
  ["e04", "Outer Ring Road (BTM–Banashankari)", "BTM", "BSK", 4, 50, 0.55],
  ["e05", "Outer Ring Road (Silk Board–HSR)", "SB", "HSR", 6, 50, 0.82],
  ["e06", "Outer Ring Road (HSR–Bellandur)", "HSR", "BEL", 6, 60, 0.7],
  ["e07", "Outer Ring Road (Bellandur–Marathahalli)", "BEL", "MAR", 6, 60, 0.76],
  ["e08", "Outer Ring Road (Marathahalli–KR Puram)", "MAR", "KRP", 6, 60, 0.6],
  ["e09", "Outer Ring Road (KR Puram–Kalyan Nagar)", "KRP", "KAL", 6, 60, 0.55],
  ["e10", "Outer Ring Road (Kalyan Nagar–Manyata)", "KAL", "MAN", 6, 60, 0.58],
  ["e11", "Outer Ring Road (Manyata–Hebbal)", "MAN", "HEB", 6, 60, 0.66],
  ["e12", "ITPL / Varthur Road", "MAR", "WF", 4, 50, 0.65],
  ["e13", "Old Madras Road (KR Puram–Whitefield)", "KRP", "WF", 4, 50, 0.52],
  ["e14", "Sarjapur Road", "BEL", "SAR", 4, 40, 0.55],
  ["e15", "Haralur Road", "SAR", "HR", 2, 40, 0.45],
  ["e16", "Sarjapur Main Road (HSR–Koramangala)", "HSR", "KOR", 4, 40, 0.55],
  ["e17", "Hosur Road (Silk Board–Koramangala)", "SB", "KOR", 4, 50, 0.7],
  ["e18", "Inner Ring Road", "KOR", "DOM", 6, 50, 0.55],
  ["e19", "100 Feet Road", "DOM", "IND", 4, 40, 0.5],
  ["e20", "Old Airport Road", "DOM", "MAR", 4, 50, 0.65],
  ["e21", "CMH Road – MG Road", "IND", "MG", 4, 40, 0.55],
  ["e22", "Old Madras Road (Indiranagar–Tin Factory)", "IND", "TF", 6, 50, 0.6],
  ["e23", "Old Madras Road (Tin Factory–KR Puram)", "TF", "KRP", 6, 50, 0.72],
  ["e24", "KG Road", "MG", "MAJ", 4, 40, 0.65],
  ["e25", "Richmond – Hosur Road", "MG", "KOR", 4, 40, 0.6],
  ["e26", "Lalbagh Road", "MAJ", "JAY", 4, 40, 0.5],
  ["e27", "Bannerghatta Road", "JAY", "BTM", 4, 40, 0.55],
  ["e28", "Kanakapura Road", "JAY", "BSK", 4, 40, 0.45],
  ["e29", "Seshadri – Palace Road", "MAJ", "MEK", 4, 40, 0.5],
  ["e30", "Bellary Road", "MEK", "HEB", 6, 60, 0.6],
  ["e31", "Cunningham Road", "MG", "MEK", 4, 40, 0.48],
  ["e32", "Banaswadi Main Road", "KAL", "TF", 4, 40, 0.5],
];

/** Road length / straight-line ratio for Bengaluru's winding roads. */
export const ROAD_CURVATURE = 1.25;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const NODE_MAP: Record<NodeId, RoadNode> = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<
  NodeId,
  RoadNode
>;

export const EDGES: RoadEdge[] = EDGE_SPECS.map(([id, name, from, to, lanes, speedLimit, baseLoad]) => ({
  id,
  name,
  from,
  to,
  lanes,
  speedLimit,
  baseLoad,
  lengthKm: +(haversineKm(NODE_MAP[from], NODE_MAP[to]) * ROAD_CURVATURE).toFixed(2),
}));

export const EDGE_MAP: Record<string, RoadEdge> = Object.fromEntries(EDGES.map((e) => [e.id, e]));

export interface Adjacent {
  node: NodeId;
  edge: RoadEdge;
}

export const ADJACENCY: Record<NodeId, Adjacent[]> = (() => {
  const adj = Object.fromEntries(NODES.map((n) => [n.id, [] as Adjacent[]])) as Record<NodeId, Adjacent[]>;
  for (const e of EDGES) {
    adj[e.from].push({ node: e.to, edge: e });
    adj[e.to].push({ node: e.from, edge: e });
  }
  return adj;
})();

export function otherEnd(edge: RoadEdge, node: NodeId): NodeId {
  return edge.from === node ? edge.to : edge.from;
}

/** Edges sharing a junction with the given edge. */
export function connectedEdges(edgeId: string): RoadEdge[] {
  const e = EDGE_MAP[edgeId];
  if (!e) return [];
  const out = new Map<string, RoadEdge>();
  for (const n of [e.from, e.to]) for (const a of ADJACENCY[n]) if (a.edge.id !== edgeId) out.set(a.edge.id, a.edge);
  return [...out.values()];
}

export function findEdgeBetween(a: NodeId, b: NodeId): RoadEdge | undefined {
  return ADJACENCY[a].find((x) => x.node === b)?.edge;
}

/** Distance in km from point p to segment ab, using a local equirectangular projection. */
export function pointToSegmentKm(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111.32;
  const ax = a.lng * k, ay = a.lat * 110.57;
  const bx = b.lng * k, by = b.lat * 110.57;
  const px = p.lng * k, py = p.lat * 110.57;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function nearestEdge(p: { lat: number; lng: number }): { edge: RoadEdge; distanceKm: number } {
  let best = { edge: EDGES[0], distanceKm: Infinity };
  for (const e of EDGES) {
    const d = pointToSegmentKm(p, NODE_MAP[e.from], NODE_MAP[e.to]);
    if (d < best.distanceKm) best = { edge: e, distanceKm: d };
  }
  return best;
}

export function nearestNode(p: { lat: number; lng: number }): RoadNode {
  let best = NODES[0];
  let bd = Infinity;
  for (const n of NODES) {
    const d = haversineKm(p, n);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** Common commuter origin–destination pairs used for network-wide metrics. */
export const OD_PAIRS: [NodeId, NodeId][] = [
  ["EC", "MG"],
  ["WF", "KOR"],
  ["HEB", "SB"],
  ["MAR", "MAJ"],
  ["BSK", "BEL"],
  ["MAN", "HSR"],
  ["KRP", "JAY"],
  ["IND", "EC"],
];
