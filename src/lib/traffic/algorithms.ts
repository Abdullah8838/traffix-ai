// Graph search: Dijkstra and A* over the road graph.
import { ADJACENCY, NODE_MAP, haversineKm, type NodeId, type RoadEdge } from "./graph";

export interface PathResult {
  nodes: NodeId[];
  edges: RoadEdge[];
  cost: number;
  visited: number;
  algorithm: "dijkstra" | "astar";
}

export type EdgeWeight = (edge: RoadEdge, from: NodeId, to: NodeId) => number;

class MinHeap<T> {
  private a: { k: number; v: T }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, v: T) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): { k: number; v: T } | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

function search(
  src: NodeId,
  dst: NodeId,
  weight: EdgeWeight,
  heuristic: (n: NodeId) => number,
  algorithm: PathResult["algorithm"],
): PathResult | null {
  const g = new Map<NodeId, number>([[src, 0]]);
  const prev = new Map<NodeId, { node: NodeId; edge: RoadEdge }>();
  const closed = new Set<NodeId>();
  const heap = new MinHeap<NodeId>();
  heap.push(heuristic(src), src);
  let visited = 0;
  while (heap.size) {
    const { v: u } = heap.pop()!;
    if (closed.has(u)) continue;
    closed.add(u);
    visited++;
    if (u === dst) break;
    for (const { node: v, edge } of ADJACENCY[u]) {
      if (closed.has(v)) continue;
      const w = weight(edge, u, v);
      if (!Number.isFinite(w)) continue;
      const nd = g.get(u)! + w;
      if (nd < (g.get(v) ?? Infinity)) {
        g.set(v, nd);
        prev.set(v, { node: u, edge });
        heap.push(nd + heuristic(v), v);
      }
    }
  }
  if (!g.has(dst) || !closed.has(dst)) return null;
  const nodes: NodeId[] = [dst];
  const edges: RoadEdge[] = [];
  let cur = dst;
  while (cur !== src) {
    const p = prev.get(cur)!;
    edges.unshift(p.edge);
    nodes.unshift(p.node);
    cur = p.node;
  }
  return { nodes, edges, cost: g.get(dst)!, visited, algorithm };
}

/** Dijkstra's shortest path for any non-negative edge weight. */
export function dijkstra(src: NodeId, dst: NodeId, weight: EdgeWeight) {
  return search(src, dst, weight, () => 0, "dijkstra");
}

/**
 * A* search. `minutesPerKm` converts straight-line distance into an admissible
 * lower bound on the weight (e.g. 60/80 for travel time at top speed 80 km/h).
 */
export function astar(src: NodeId, dst: NodeId, weight: EdgeWeight, minutesPerKm = 0) {
  const goal = NODE_MAP[dst];
  return search(src, dst, weight, (n) => haversineKm(NODE_MAP[n], goal) * minutesPerKm, "astar");
}
