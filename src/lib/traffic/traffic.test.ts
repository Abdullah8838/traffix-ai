import { describe, expect, it } from "vitest";
import { dijkstra, astar } from "./algorithms";
import { baseState, edgeTravelMin } from "./conditions";
import { EDGES } from "./graph";
import { ASTAR_MIN_PER_KM, planRoutes, shortestPath } from "./routing";
import { compare, createSim, lightsFor, ratesForDensity, step } from "./signals";
import { findDuplicates } from "./incidents";
import { planEmergency } from "./emergency";
import { predictEdge } from "./prediction";
import { analyzeImpact } from "./impact";

const s = baseState({ minutesOfDay: 9 * 60 + 30 });

describe("route algorithms", () => {
  it("A* finds the same optimal travel time as Dijkstra", () => {
    const w = (e: (typeof EDGES)[number]) => edgeTravelMin(e, s);
    for (const [a, b] of [["EC", "MG"], ["WF", "BSK"], ["HEB", "SB"]] as const) {
      const d = dijkstra(a, b, w)!;
      const x = astar(a, b, w, ASTAR_MIN_PER_KM)!;
      expect(x.cost).toBeCloseTo(d.cost, 6);
      expect(x.visited).toBeLessThanOrEqual(d.visited);
    }
  });

  it("never routes over a closed road", () => {
    const closed = baseState({ closedEdges: new Set(["e05", "e17"]) });
    const plan = planRoutes("SB", "BEL", closed)!;
    for (const r of plan.candidates) expect(r.edges.some((e) => e.id === "e05" || e.id === "e17")).toBe(false);
  });

  it("shortest route has the minimum distance and AI route the top score", () => {
    const plan = planRoutes("EC", "MG", s)!;
    const minD = Math.min(...plan.candidates.map((r) => r.metrics.distanceKm));
    expect(plan.shortest.metrics.distanceKm).toBe(minD);
    expect(plan.ai.score).toBe(Math.max(...plan.candidates.map((r) => r.score)));
    expect(shortestPath("EC", "MG", s)!.cost).toBeCloseTo(minD, 1);
  });
});

describe("adaptive signals", () => {
  it("never gives conflicting directions green at the same time", () => {
    const sim = createSim(3);
    for (const mode of ["fixed", "adaptive"] as const)
      for (let i = 0; i < 2000; i++) {
        step(sim, { mode, rates: ratesForDensity(7), seed: 3 });
        const l = lightsFor(sim.phase);
        expect((l.N === "green" || l.S === "green") && (l.E === "green" || l.W === "green")).toBe(false);
      }
  });

  it("adaptive control lowers average waiting time under imbalanced demand", () => {
    const c = compare(ratesForDensity(6));
    expect(c.adaptive.avgWait).toBeLessThan(c.fixed.avgWait);
  });
});

describe("incident duplicate detection", () => {
  const existing = [
    { id: "a", type: "accident" as const, lat: 12.9172, lng: 77.63, description: "car collision blocking lane", createdAt: Date.now() - 10 * 60000, status: "verified", locationName: "Silk Board" },
  ];
  it("flags a nearby report of the same type as a duplicate", () => {
    const m = findDuplicates({ type: "accident", lat: 12.9178, lng: 77.6305, description: "collision blocking left lane", createdAt: Date.now() }, existing);
    expect(m[0].isDuplicate).toBe(true);
  });
  it("does not flag a report 2 km away", () => {
    const m = findDuplicates({ type: "accident", lat: 12.935, lng: 77.63, description: "collision", createdAt: Date.now() }, existing);
    expect(m.every((x) => !x.isDuplicate)).toBe(true);
  });
});

describe("emergency, prediction and impact", () => {
  it("emergency corridor ETA is never slower than the normal ETA", () => {
    const p = planEmergency("EC", "MG", "ambulance", s)!;
    expect(p.emergency.etaMin).toBeLessThanOrEqual(p.normal.etaMin);
  });
  it("prediction confidence falls as the horizon grows", () => {
    const e = EDGES[4];
    expect(predictEdge(e, 30, s).confidence).toBeLessThan(predictEdge(e, 5, s).confidence);
  });
  it("closing a road raises congestion on connected roads", () => {
    const r = analyzeImpact(["e05"], s);
    expect(r.affectedRoads.filter((a) => a.hop === 1).every((a) => a.after >= a.before)).toBe(true);
    expect(r.diversions.length).toBe(1);
  });
});
