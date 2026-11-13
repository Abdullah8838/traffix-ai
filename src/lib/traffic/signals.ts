// Four-way intersection simulation: fixed-time vs adaptive signal control.
// A simulation only — it does not control real traffic signals.

export type Dir = "N" | "S" | "E" | "W";
export const DIRS: Dir[] = ["N", "S", "E", "W"];
export type Axis = "NS" | "EW";
export type Phase = "NS_GREEN" | "NS_YELLOW" | "EW_GREEN" | "EW_YELLOW" | "ALL_RED";
export type Light = "green" | "yellow" | "red";
export type SignalMode = "fixed" | "adaptive";

export const FIXED_GREEN = 30;
export const YELLOW = 3;
export const ALL_RED = 2;
export const MIN_GREEN = 8;
export const MAX_GREEN = 50;
/** Saturation flow: one vehicle leaves each green approach every 2 s. */
export const DISCHARGE_INTERVAL = 2;

export interface SignalConfig {
  mode: SignalMode;
  /** Arrivals per minute for each approach. */
  rates: Record<Dir, number>;
  seed: number;
  /** When set, this approach is forced green as soon as safely possible (emergency). */
  priority?: Dir | null;
}

export interface SignalSim {
  t: number;
  phase: Phase;
  phaseTime: number;
  nextAxis: Axis;
  queues: Record<Dir, number[]>; // arrival timestamps
  discharge: Record<Dir, number>;
  processed: number;
  processedBy: Record<Dir, number>;
  totalWait: number;
  queueSum: number;
  maxQueue: number;
  rng: number;
}

export function axisOf(d: Dir): Axis {
  return d === "N" || d === "S" ? "NS" : "EW";
}

/** Light per approach. Conflicting axes can never be green together. */
export function lightsFor(phase: Phase): Record<Dir, Light> {
  const ns: Light = phase === "NS_GREEN" ? "green" : phase === "NS_YELLOW" ? "yellow" : "red";
  const ew: Light = phase === "EW_GREEN" ? "green" : phase === "EW_YELLOW" ? "yellow" : "red";
  return { N: ns, S: ns, E: ew, W: ew };
}

export function createSim(seed = 7): SignalSim {
  return {
    t: 0,
    phase: "NS_GREEN",
    phaseTime: 0,
    nextAxis: "EW",
    queues: { N: [], S: [], E: [], W: [] },
    discharge: { N: 0, S: 0, E: 0, W: 0 },
    processed: 0,
    processedBy: { N: 0, S: 0, E: 0, W: 0 },
    totalWait: 0,
    queueSum: 0,
    maxQueue: 0,
    rng: seed >>> 0 || 1,
  };
}

function rand(sim: SignalSim) {
  // mulberry32
  let t = (sim.rng = (sim.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const axisQueue = (sim: SignalSim, a: Axis) => (a === "NS" ? sim.queues.N.length + sim.queues.S.length : sim.queues.E.length + sim.queues.W.length);

function axisWait(sim: SignalSim, a: Axis) {
  const dirs: Dir[] = a === "NS" ? ["N", "S"] : ["E", "W"];
  let w = 0;
  for (const d of dirs) for (const at of sim.queues[d]) w += sim.t - at;
  return w;
}

/** Adaptive policy: should the current green axis end now? */
export function adaptiveShouldSwitch(sim: SignalSim, green: Axis, priority?: Dir | null): boolean {
  const other: Axis = green === "NS" ? "EW" : "NS";
  if (priority) return axisOf(priority) !== green;
  if (sim.phaseTime < MIN_GREEN) return false;
  if (sim.phaseTime >= MAX_GREEN) return axisQueue(sim, other) > 0;
  const g = axisQueue(sim, green);
  const o = axisQueue(sim, other);
  if (g === 0) return o > 0;
  // Pressure = queue length + accumulated waiting (vehicle-seconds / 30).
  const pg = g + axisWait(sim, green) / 30;
  const po = o + axisWait(sim, other) / 30;
  return po > pg * 1.6 + 2;
}

/** Advance the simulation by one second. */
export function step(sim: SignalSim, cfg: SignalConfig): SignalSim {
  const s = sim;
  s.t += 1;
  s.phaseTime += 1;
  // Arrivals (Bernoulli per second, up to two per approach).
  for (const d of DIRS) {
    let p = cfg.rates[d] / 60;
    while (p > 0) {
      if (rand(s) < Math.min(1, p)) s.queues[d].push(s.t);
      p -= 1;
    }
  }
  // Discharge on green.
  const lights = lightsFor(s.phase);
  for (const d of DIRS) {
    if (lights[d] !== "green") {
      s.discharge[d] = 0;
      continue;
    }
    s.discharge[d] += 1;
    if (s.discharge[d] >= DISCHARGE_INTERVAL && s.queues[d].length) {
      s.discharge[d] = 0;
      const at = s.queues[d].shift()!;
      s.totalWait += s.t - at;
      s.processed += 1;
      s.processedBy[d] += 1;
    }
  }
  // Phase controller.
  const priority = cfg.priority ?? null;
  switch (s.phase) {
    case "NS_GREEN":
    case "EW_GREEN": {
      const axis: Axis = s.phase === "NS_GREEN" ? "NS" : "EW";
      const end =
        cfg.mode === "fixed" && !priority ? s.phaseTime >= FIXED_GREEN : adaptiveShouldSwitch(s, axis, priority);
      if (end) {
        s.phase = axis === "NS" ? "NS_YELLOW" : "EW_YELLOW";
        s.phaseTime = 0;
        s.nextAxis = axis === "NS" ? "EW" : "NS";
      }
      break;
    }
    case "NS_YELLOW":
    case "EW_YELLOW":
      if (s.phaseTime >= YELLOW) {
        s.phase = "ALL_RED";
        s.phaseTime = 0;
      }
      break;
    case "ALL_RED":
      if (s.phaseTime >= ALL_RED) {
        s.phase = s.nextAxis === "NS" ? "NS_GREEN" : "EW_GREEN";
        s.phaseTime = 0;
      }
      break;
  }
  const q = DIRS.reduce((a, d) => a + s.queues[d].length, 0);
  s.queueSum += q;
  s.maxQueue = Math.max(s.maxQueue, q);
  return s;
}

export interface SignalMetrics {
  avgWait: number; // seconds per processed vehicle
  avgQueue: number;
  maxQueue: number;
  processed: number;
  throughput: number; // vehicles per minute
}

export function metrics(sim: SignalSim): SignalMetrics {
  // Count waiting time of vehicles still queued too, so starving one approach is penalised.
  let pending = 0;
  for (const d of DIRS) for (const at of sim.queues[d]) pending += sim.t - at;
  const queued = DIRS.reduce((a, d) => a + sim.queues[d].length, 0);
  return {
    avgWait: +((sim.totalWait + pending) / Math.max(1, sim.processed + queued)).toFixed(1),
    avgQueue: +(sim.queueSum / Math.max(1, sim.t)).toFixed(1),
    maxQueue: sim.maxQueue,
    processed: sim.processed,
    throughput: +(sim.processed / Math.max(1 / 60, sim.t / 60)).toFixed(1),
  };
}

export function run(cfg: SignalConfig, seconds: number): SignalSim {
  const sim = createSim(cfg.seed);
  for (let i = 0; i < seconds; i++) step(sim, cfg);
  return sim;
}

/** Arrival rates for a density level 1..10 with a realistic directional imbalance. */
export function ratesForDensity(level: number): Record<Dir, number> {
  const base = 3 + level * 2.2;
  return { N: +(base * 1.45).toFixed(1), S: +(base * 1.15).toFixed(1), E: +(base * 0.7).toFixed(1), W: +(base * 0.45).toFixed(1) };
}

export interface Comparison {
  fixed: SignalMetrics;
  adaptive: SignalMetrics;
  waitImprovementPct: number;
  queueImprovementPct: number;
  throughputGainPct: number;
}

export function compare(rates: Record<Dir, number>, seconds = 900, seed = 11): Comparison {
  const fixed = metrics(run({ mode: "fixed", rates, seed }, seconds));
  const adaptive = metrics(run({ mode: "adaptive", rates, seed }, seconds));
  const pct = (a: number, b: number) => (a === 0 ? 0 : +(((a - b) / a) * 100).toFixed(1));
  return {
    fixed,
    adaptive,
    waitImprovementPct: pct(fixed.avgWait, adaptive.avgWait),
    queueImprovementPct: pct(fixed.avgQueue, adaptive.avgQueue),
    throughputGainPct: fixed.throughput === 0 ? 0 : +(((adaptive.throughput - fixed.throughput) / fixed.throughput) * 100).toFixed(1),
  };
}
