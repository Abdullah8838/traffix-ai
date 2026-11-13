// Network impact analysis for incidents and road closures.
import { EDGES, EDGE_MAP, OD_PAIRS, connectedEdges, type NodeId, type RoadEdge } from "./graph";
import { congestion, type NetworkState } from "./conditions";
import { describePath, fastestPath } from "./routing";

export interface AffectedRoad {
  edge: RoadEdge;
  hop: 1 | 2;
  before: number;
  after: number;
}

export interface OdImpact {
  from: NodeId;
  to: NodeId;
  beforeMin: number;
  afterMin: number | null;
  extraMin: number | null;
  rerouted: boolean;
  beforePath: string;
  afterPath: string | null;
  afterNodes: NodeId[] | null;
}

export interface ImpactReport {
  closed: RoadEdge[];
  affectedRoads: AffectedRoad[];
  od: OdImpact[];
  totalExtraMin: number;
  disconnected: number;
  diversions: string[];
}

export function analyzeImpact(closedIds: string[], s: NetworkState): ImpactReport {
  const after: NetworkState = { ...s, closedEdges: new Set([...s.closedEdges, ...closedIds]) };
  const closed = closedIds.map((id) => EDGE_MAP[id]).filter(Boolean);

  const hop1 = new Map<string, RoadEdge>();
  for (const c of closed) for (const e of connectedEdges(c.id)) if (!closedIds.includes(e.id)) hop1.set(e.id, e);
  const hop2 = new Map<string, RoadEdge>();
  for (const e of hop1.values())
    for (const n of connectedEdges(e.id)) if (!hop1.has(n.id) && !closedIds.includes(n.id)) hop2.set(n.id, n);

  const affectedRoads: AffectedRoad[] = [
    ...[...hop1.values()].map((edge) => ({ edge, hop: 1 as const, before: congestion(edge, s), after: congestion(edge, after) })),
    ...[...hop2.values()].map((edge) => ({ edge, hop: 2 as const, before: congestion(edge, s), after: congestion(edge, after) })),
  ].sort((a, b) => b.after - b.before - (a.after - a.before));

  const od: OdImpact[] = [];
  for (const [from, to] of OD_PAIRS) {
    const b = fastestPath(from, to, s);
    const a = fastestPath(from, to, after);
    if (!b) continue;
    const touched = b.edges.some((e) => closedIds.includes(e.id) || hop1.has(e.id));
    if (!touched) continue;
    od.push({
      from,
      to,
      beforeMin: +b.cost.toFixed(1),
      afterMin: a ? +a.cost.toFixed(1) : null,
      extraMin: a ? +(a.cost - b.cost).toFixed(1) : null,
      rerouted: !!a && a.nodes.join() !== b.nodes.join(),
      beforePath: describePath(b.nodes),
      afterPath: a ? describePath(a.nodes) : null,
      afterNodes: a ? a.nodes : null,
    });
  }
  const totalExtraMin = +od.reduce((acc, o) => acc + Math.max(0, o.extraMin ?? 0), 0).toFixed(1);

  const diversions: string[] = [];
  for (const c of closed) {
    const alt = fastestPath(c.from, c.to, after);
    diversions.push(
      alt
        ? `Divert ${c.name} traffic via ${describePath(alt.nodes)} (+${(alt.cost - (fastestPath(c.from, c.to, s)?.cost ?? alt.cost)).toFixed(1)} min).`
        : `No alternative path exists for ${c.name}; hold traffic upstream.`,
    );
  }
  return { closed, affectedRoads, od, totalExtraMin, disconnected: od.filter((o) => o.afterMin === null).length, diversions };
}

export function networkAverageCongestion(s: NetworkState) {
  const open = EDGES.filter((e) => !s.closedEdges.has(e.id));
  return open.reduce((a, e) => a + congestion(e, s), 0) / Math.max(1, open.length);
}
