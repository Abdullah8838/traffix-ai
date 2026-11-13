import type { NodeId } from "@/lib/traffic/graph";

export interface MapRoute {
  id: string;
  nodes: NodeId[];
  color: string;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
  label?: string;
  onClick?: () => void;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  radius?: number;
  detail?: string;
  onClick?: () => void;
}

export interface TrafficMapProps {
  congestion?: Record<string, number>;
  closedEdges?: Set<string>;
  routes?: MapRoute[];
  markers?: MapMarker[];
  showNodes?: boolean;
  showEdges?: boolean;
  selected?: { source?: NodeId | null; destination?: NodeId | null };
  highlightNodes?: NodeId[];
  onNodeClick?: (id: NodeId) => void;
  onEdgeClick?: (edgeId: string) => void;
  onMapClick?: (p: { lat: number; lng: number }) => void;
  fitTo?: NodeId[] | null;
  focus?: { lat: number; lng: number; zoom?: number } | null;
  className?: string;
  zoom?: number;
}
