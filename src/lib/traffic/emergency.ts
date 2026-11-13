// Emergency vehicle priority routing with a simulated green corridor.
import { astar } from "./algorithms";
import { NODE_MAP, type NodeId, type RoadEdge } from "./graph";
import { congestion, edgeTravelMin, type NetworkState } from "./conditions";
import { ASTAR_MIN_PER_KM, describePath } from "./routing";

export type EmergencyVehicle = "ambulance" | "fire" | "response";
export const EMERGENCY_VEHICLES: Record<EmergencyVehicle, { label: string; speed: number }> = {
  ambulance: { label: "Ambulance", speed: 1.15 },
  fire: { label: "Fire brigade", speed: 1.0 },
  response: { label: "Emergency response vehicle", speed: 1.2 },
};

/** Minutes on an edge for an emergency vehicle with a green corridor (simulated). */
export function corridorEdgeMin(edge: RoadEdge, s: NetworkState, vehicle: EmergencyVehicle) {
  if (s.closedEdges.has(edge.id)) return Infinity;
  const c = congestion(edge, s);
  // Traffic yields: congestion impact reduced by ~60%, signals pre-cleared.
  const speed = Math.max(15, edge.speedLimit * 1.1 * EMERGENCY_VEHICLES[vehicle].speed * (1 - 0.32 * c));
  const incidentPenalty = s.incidents
    .filter((i) => i.edgeId === edge.id && i.severity >= 3)
    .reduce((a, i) => a + i.severity * 1.6, 0);
  return (edge.lengthKm / speed) * 60 + 0.05 + incidentPenalty;
}

export interface EmergencyPlan {
  normal: { nodes: NodeId[]; edges: RoadEdge[]; etaMin: number };
  emergency: { nodes: NodeId[]; edges: RoadEdge[]; etaMin: number; distanceKm: number };
  timeSavedMin: number;
  priorityJunctions: { id: NodeId; name: string; atMin: number }[];
  avoidedIncidents: string[];
  summary: string;
}

export function planEmergency(src: NodeId, dst: NodeId, vehicle: EmergencyVehicle, s: NetworkState): EmergencyPlan | null {
  if (src === dst) return null;
  const normal = astar(src, dst, (e) => edgeTravelMin(e, s, "car"), ASTAR_MIN_PER_KM);
  const em = astar(src, dst, (e) => corridorEdgeMin(e, s, vehicle), 60 / 100);
  if (!normal || !em) return null;
  // Normal ETA: the same vehicle without priority (stuck in regular traffic).
  const normalEta = normal.edges.reduce((a, e) => a + edgeTravelMin(e, s, "car"), 0);
  const emEta = em.edges.reduce((a, e) => a + corridorEdgeMin(e, s, vehicle), 0);
  let t = 0;
  const priorityJunctions = em.nodes.slice(1).map((id, i) => {
    t += corridorEdgeMin(em.edges[i], s, vehicle);
    return { id, name: NODE_MAP[id].name, atMin: +t.toFixed(1) };
  });
  const emEdges = new Set(em.edges.map((e) => e.id));
  const avoidedIncidents = s.incidents
    .filter((i) => normal.edges.some((e) => e.id === i.edgeId) && !emEdges.has(i.edgeId))
    .map((i) => i.locationName);
  const saved = Math.max(0, normalEta - emEta);
  return {
    normal: { nodes: normal.nodes, edges: normal.edges, etaMin: +normalEta.toFixed(1) },
    emergency: {
      nodes: em.nodes,
      edges: em.edges,
      etaMin: +emEta.toFixed(1),
      distanceKm: +em.edges.reduce((a, e) => a + e.lengthKm, 0).toFixed(2),
    },
    timeSavedMin: +saved.toFixed(1),
    priorityJunctions,
    avoidedIncidents,
    summary: `${EMERGENCY_VEHICLES[vehicle].label} via ${describePath(em.nodes)} — ${saved.toFixed(1)} min faster with a simulated green corridor.`,
  };
}

export type CorridorState = "normal" | "detecting" | "green" | "restored";

/** Corridor state of a junction given vehicle progress in minutes along the route. */
export function junctionCorridorState(atMin: number, progressMin: number): CorridorState {
  if (progressMin >= atMin + 0.4) return "restored";
  if (progressMin >= atMin - 0.6) return "green";
  if (progressMin >= atMin - 1.8) return "detecting";
  return "normal";
}
