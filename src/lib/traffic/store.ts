// Client-side demo simulation settings shared across every page.
import { useSyncExternalStore } from "react";
import type { Weather } from "./conditions";

export interface SimSettings {
  densityMultiplier: number;
  weather: Weather;
  signalsOptimized: boolean;
  /** Use the real Bengaluru clock; otherwise `fixedMinutes`/`fixedDay`. */
  liveClock: boolean;
  fixedMinutes: number;
  fixedDay: number;
  /** Closures simulated locally (not saved), on top of admin-managed closures. */
  simulatedClosures: string[];
  /** Future offset selected on the prediction timeline (minutes). */
  forecastOffset: number;
  showDemoBadge: boolean;
}

export const DEFAULT_SETTINGS: SimSettings = {
  densityMultiplier: 1,
  weather: "clear",
  signalsOptimized: false,
  liveClock: false,
  fixedMinutes: 9 * 60 + 15,
  fixedDay: 2,
  simulatedClosures: [],
  forecastOffset: 0,
  showDemoBadge: true,
};

const KEY = "traffix-sim-settings-v1";
let state: SimSettings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = { ...DEFAULT_SETTINGS, ...JSON.parse(raw), forecastOffset: 0 };
  } catch {
    state = DEFAULT_SETTINGS;
  }
}

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }
  listeners.forEach((l) => l());
}

export const simStore = {
  get: () => {
    load();
    return state;
  },
  set(patch: Partial<SimSettings>) {
    load();
    state = { ...state, ...patch };
    emit();
  },
  toggleClosure(edgeId: string) {
    const has = state.simulatedClosures.includes(edgeId);
    this.set({
      simulatedClosures: has ? state.simulatedClosures.filter((x) => x !== edgeId) : [...state.simulatedClosures, edgeId],
    });
  },
  reset() {
    state = { ...DEFAULT_SETTINGS };
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSimSettings(): SimSettings {
  return useSyncExternalStore(simStore.subscribe, simStore.get, () => DEFAULT_SETTINGS);
}
