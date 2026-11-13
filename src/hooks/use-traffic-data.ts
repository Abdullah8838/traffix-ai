import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { nearestEdge } from "@/lib/traffic/graph";
import type { ActiveIncident, IncidentStatus, IncidentType } from "@/lib/traffic/conditions";

export type IncidentRow = Tables<"incidents">;
export type ClosureRow = Tables<"road_closures">;

export const incidentsQuery = {
  queryKey: ["incidents"],
  queryFn: async (): Promise<IncidentRow[]> => {
    const { data, error } = await supabase.from("incidents").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return data;
  },
  staleTime: 15_000,
};

export const closuresQuery = {
  queryKey: ["road_closures"],
  queryFn: async (): Promise<ClosureRow[]> => {
    const { data, error } = await supabase.from("road_closures").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  staleTime: 15_000,
};

export function useIncidents() {
  return useQuery(incidentsQuery);
}
export function useClosures() {
  return useQuery(closuresQuery);
}

export function toActiveIncident(r: IncidentRow): ActiveIncident {
  return {
    id: r.id,
    type: r.type as IncidentType,
    lat: r.lat,
    lng: r.lng,
    severity: Number(r.estimated_severity ?? r.severity),
    status: r.status as IncidentStatus,
    edgeId: r.road_code ?? nearestEdge({ lat: r.lat, lng: r.lng }).edge.id,
    locationName: r.location_name,
    confidence: Number(r.confidence),
    reportCount: r.report_count,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export const isActive = (r: { status: string }) => r.status === "pending" || r.status === "verified";
