import { useEffect, useMemo, useState } from "react";
import { bengaluruNow, type NetworkState } from "@/lib/traffic/conditions";
import { useSimSettings } from "@/lib/traffic/store";
import { isActive, toActiveIncident, useClosures, useIncidents } from "./use-traffic-data";

/** Live minute tick (client only). */
export function useNowTick(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The combined simulated network: demo settings + database incidents and
 * closures. `offsetMin` shifts the clock for forecasts.
 */
export function useNetworkState(offsetMin = 0) {
  const settings = useSimSettings();
  const incidents = useIncidents();
  const closures = useClosures();
  const now = useNowTick();

  const state = useMemo<NetworkState>(() => {
    const clock = settings.liveClock
      ? bengaluruNow(new Date(now))
      : { minutesOfDay: settings.fixedMinutes, dayOfWeek: settings.fixedDay };
    const closed = new Set<string>(settings.simulatedClosures);
    for (const c of closures.data ?? []) if (c.active) closed.add(c.road_code);
    return {
      minutesOfDay: clock.minutesOfDay + offsetMin,
      dayOfWeek: clock.dayOfWeek,
      densityMultiplier: settings.densityMultiplier,
      weather: settings.weather,
      closedEdges: closed,
      incidents: (incidents.data ?? []).filter(isActive).map(toActiveIncident),
      signalsOptimized: settings.signalsOptimized,
    };
  }, [settings, incidents.data, closures.data, now, offsetMin]);

  return {
    state,
    settings,
    loading: incidents.isLoading || closures.isLoading,
    error: incidents.error ?? closures.error,
    incidents: incidents.data ?? [],
    closures: closures.data ?? [],
  };
}
