// Vehicle simulation for the 3D digital twin. Pure TypeScript: vehicles move
// along graph edges, queue behind each other and obey junction signals.
import { ADJACENCY, EDGES, NODES, type NodeId, type RoadEdge } from "./graph";

export const UNITS_PER_KM = 3.2;
const LAT0 = 12.955;
const LNG0 = 77.648;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180);
const KZ = 110.57;

export function project(lat: number, lng: number): [number, number] {
  return [(lng - LNG0) * KX * UNITS_PER_KM, -(lat - LAT0) * KZ * UNITS_PER_KM];
}

export const NODE_XZ: Record<NodeId, [number, number]> = Object.fromEntries(
  NODES.map((n) => [n.id, project(n.lat, n.lng)]),
) as Record<NodeId, [number, number]>;

export interface EdgeGeom {
  edge: RoadEdge;
  a: [number, number];
  b: [number, number];
  len: number;
  ux: number;
  uz: number;
  angle: number;
}

export const EDGE_GEOM: EdgeGeom[] = EDGES.map((edge) => {
  const a = NODE_XZ[edge.from], b = NODE_XZ[edge.to];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  return { edge, a, b, len, ux: dx / len, uz: dz / len, angle: Math.atan2(dx, dz) };
});
const GEOM_INDEX: Record<string, number> = Object.fromEntries(EDGE_GEOM.map((g, i) => [g.edge.id, i]));

export type Axis = "NS" | "EW";
export type Light = "green" | "yellow" | "red";

export interface CityVehicle {
  id: number;
  edge: number; // EDGE_GEOM index
  dir: 1 | -1;
  s: number;
  v: number;
  color: number; // palette index
  kind: "car" | "ambulance";
  route?: NodeId[];
  routeIdx?: number;
  done?: boolean;
}

export interface SignalNode {
  axis: Axis;
  t: number;
  yellow: number; // remaining yellow seconds
  priority: boolean;
}

export interface CityWorld {
  vehicles: CityVehicle[];
  signals: Record<NodeId, SignalNode>;
  time: number;
  rng: number;
  nextId: number;
}

export interface CityConditions {
  congestion: Record<string, number>;
  closed: Set<string>;
  signalsOptimized: boolean;
}

export const FIXED_GREEN_S = 9;
export const YELLOW_S = 1.4;
const STOP_OFFSET = 1.0;
const MIN_GAP = 0.55;

function rand(w: CityWorld) {
  let t = (w.rng = (w.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function approachAxis(g: EdgeGeom): Axis {
  return Math.abs(g.ux) > Math.abs(g.uz) ? "EW" : "NS";
}

export function endNode(v: CityVehicle): NodeId {
  const e = EDGE_GEOM[v.edge].edge;
  return v.dir === 1 ? e.to : e.from;
}

export function lightAt(w: CityWorld, node: NodeId, axis: Axis): Light {
  const s = w.signals[node];
  if (!s) return "green";
  if (s.axis !== axis) return "red";
  return s.yellow > 0 ? "yellow" : "green";
}

export function createWorld(seed: number, count: number, cond: CityConditions): CityWorld {
  const w: CityWorld = { vehicles: [], signals: {} as Record<NodeId, SignalNode>, time: 0, rng: seed >>> 0 || 1, nextId: 1 };
  NODES.forEach((n, i) => {
    w.signals[n.id] = { axis: i % 2 ? "NS" : "EW", t: (i * 2.3) % FIXED_GREEN_S, yellow: 0, priority: false };
  });
  const open = EDGE_GEOM.map((g, i) => ({ g, i })).filter(({ g }) => !cond.closed.has(g.edge.id));
  const weights = open.map(({ g }) => g.len * (0.35 + (cond.congestion[g.edge.id] ?? 0.4)));
  const total = weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < count; k++) {
    let r = rand(w) * total, idx = 0;
    while (r > weights[idx] && idx < weights.length - 1) r -= weights[idx++];
    const { g, i } = open[idx];
    w.vehicles.push({
      id: w.nextId++,
      edge: i,
      dir: rand(w) < 0.5 ? 1 : -1,
      s: rand(w) * (g.len - 1.5),
      v: 0,
      color: Math.floor(rand(w) * 6),
      kind: "car",
    });
  }
  return w;
}

export function addAmbulance(w: CityWorld, route: NodeId[]): CityVehicle | null {
  if (route.length < 2) return null;
  const from = route[0], to = route[1];
  const ed = ADJACENCY[from].find((a) => a.node === to)?.edge;
  if (!ed) return null;
  const v: CityVehicle = {
    id: w.nextId++,
    edge: GEOM_INDEX[ed.id],
    dir: ed.from === from ? 1 : -1,
    s: 0.2,
    v: 0,
    color: 0,
    kind: "ambulance",
    route,
    routeIdx: 1,
  };
  w.vehicles = w.vehicles.filter((x) => x.kind !== "ambulance");
  w.vehicles.push(v);
  return v;
}

function chooseNext(w: CityWorld, v: CityVehicle, node: NodeId, cond: CityConditions): { edge: number; dir: 1 | -1 } | null {
  if (v.kind === "ambulance" && v.route && v.routeIdx !== undefined) {
    const nextNode = v.route[v.routeIdx + 1];
    if (!nextNode) return null;
    const ed = ADJACENCY[node].find((a) => a.node === nextNode)?.edge;
    if (!ed) return null;
    v.routeIdx += 1;
    return { edge: GEOM_INDEX[ed.id], dir: ed.from === node ? 1 : -1 };
  }
  const cur = EDGE_GEOM[v.edge].edge.id;
  let opts = ADJACENCY[node].filter((a) => !cond.closed.has(a.edge.id) && a.edge.id !== cur);
  if (!opts.length) opts = ADJACENCY[node].filter((a) => !cond.closed.has(a.edge.id));
  if (!opts.length) return null;
  const pick = opts[Math.floor(rand(w) * opts.length)];
  return { edge: GEOM_INDEX[pick.edge.id], dir: pick.edge.from === node ? 1 : -1 };
}

function updateSignals(w: CityWorld, dt: number, cond: CityConditions, waiting: Map<string, number>) {
  // Green-corridor priority for an approaching ambulance (simulated).
  const amb = w.vehicles.find((v) => v.kind === "ambulance" && !v.done);
  let prioNode: NodeId | null = null;
  let prioAxis: Axis | null = null;
  if (amb) {
    const g = EDGE_GEOM[amb.edge];
    if (g.len - amb.s < 7) {
      prioNode = endNode(amb);
      prioAxis = approachAxis(g);
    }
  }
  for (const n of NODES) {
    const s = w.signals[n.id];
    s.priority = n.id === prioNode;
    if (s.yellow > 0) {
      s.yellow -= dt;
      if (s.yellow <= 0) {
        s.yellow = 0;
        s.axis = s.axis === "NS" ? "EW" : "NS";
        s.t = 0;
      }
      continue;
    }
    s.t += dt;
    if (s.priority && prioAxis) {
      if (s.axis !== prioAxis) s.yellow = 0.5;
      continue;
    }
    if (cond.signalsOptimized) {
      const g = waiting.get(`${n.id}:${s.axis}`) ?? 0;
      const o = waiting.get(`${n.id}:${s.axis === "NS" ? "EW" : "NS"}`) ?? 0;
      if (s.t > 3 && ((g === 0 && o > 0) || o > g + 2 || s.t > 14)) s.yellow = YELLOW_S;
    } else if (s.t >= FIXED_GREEN_S) {
      s.yellow = YELLOW_S;
    }
  }
}

export function stepWorld(w: CityWorld, dt: number, cond: CityConditions) {
  w.time += dt;
  // Bucket vehicles by directed edge for leader lookup.
  const buckets = new Map<string, CityVehicle[]>();
  for (const v of w.vehicles) {
    if (v.done) continue;
    const k = `${v.edge}:${v.dir}`;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(v);
  }
  const waiting = new Map<string, number>();
  for (const list of buckets.values()) list.sort((a, b) => b.s - a.s);

  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const g = EDGE_GEOM[v.edge];
      if (cond.closed.has(g.edge.id) && v.kind === "car") {
        // Closed road: vehicles hold at the barrier in the middle.
        const barrier = g.len / 2 - 0.8;
        if (v.s < barrier) v.s = Math.min(barrier, v.s + dt * 0.8);
        continue;
      }
      const cong = cond.congestion[g.edge.id] ?? 0.4;
      const vmax = v.kind === "ambulance" ? 5.2 * (1 - 0.15 * cong) : 2.8 * (1 - 0.68 * cong);
      const remaining = g.len - v.s;
      const node = endNode(v);
      const axis = approachAxis(g);
      const light = lightAt(w, node, axis);
      let room = Infinity;
      if (light !== "green" && remaining > STOP_OFFSET - 0.15) room = remaining - STOP_OFFSET;
      if (i > 0 && v.kind !== "ambulance") room = Math.min(room, list[i - 1].s - v.s - MIN_GAP);
      const target = room < 1.6 ? Math.max(0, room) * 1.8 : vmax;
      v.v += (Math.min(vmax, target) - v.v) * Math.min(1, dt * 4);
      if (v.v < 0.05 && room < 0.4) {
        v.v = 0;
        const key = `${node}:${axis}`;
        waiting.set(key, (waiting.get(key) ?? 0) + 1);
      }
      v.s += Math.max(0, Math.min(v.v * dt, Math.max(0, room)));
      if (v.s >= g.len) {
        const next = chooseNext(w, v, node, cond);
        if (!next) {
          if (v.kind === "ambulance") v.done = true;
          else {
            v.dir = v.dir === 1 ? -1 : 1;
            v.s = 0;
          }
          continue;
        }
        v.s -= g.len;
        v.edge = next.edge;
        v.dir = next.dir;
      }
    }
  }
  updateSignals(w, dt, cond, waiting);
}

export function vehiclePose(v: CityVehicle): { x: number; z: number; angle: number } {
  const g = EDGE_GEOM[v.edge];
  const dx = g.ux * v.dir, dz = g.uz * v.dir;
  const t = v.dir === 1 ? v.s : g.len - v.s;
  const off = 0.2;
  return { x: g.a[0] + g.ux * t + dz * off, z: g.a[1] + g.uz * t - dx * off, angle: Math.atan2(dx, dz) };
}

export function edgeVehicleCount(w: CityWorld, edgeId: string) {
  const idx = GEOM_INDEX[edgeId];
  return w.vehicles.filter((v) => v.edge === idx && !v.done).length;
}
