import { DIRS, lightsFor, type Dir, type SignalSim } from "@/lib/traffic/signals";

const VISIBLE = 13;
const CAR = 10, GAP = 4;

function queuePos(d: Dir, i: number): { x: number; y: number; w: number; h: number } {
  const o = i * (CAR + GAP);
  switch (d) {
    case "N": return { x: 204, y: 140 - o - CAR, w: 8, h: CAR };
    case "S": return { x: 188, y: 260 + o, w: 8, h: CAR };
    case "E": return { x: 260 + o, y: 204, w: CAR, h: 8 };
    case "W": return { x: 140 - o - CAR, y: 188, w: CAR, h: 8 };
  }
}

const LIGHT_POS: Record<Dir, [number, number]> = { N: [228, 132], S: [172, 268], E: [268, 228], W: [132, 172] };
const LIGHT_COLOR = { green: "var(--color-success)", yellow: "var(--color-warning)", red: "var(--color-danger)" } as const;

export interface Crossing { id: number; dir: Dir; t0: number }

function crossPos(dir: Dir, p: number) {
  const t = -10 + p * 220;
  switch (dir) {
    case "N": return { x: 204, y: 140 + t, w: 8, h: CAR };
    case "S": return { x: 188, y: 260 - t - CAR, w: 8, h: CAR };
    case "E": return { x: 260 - t - CAR, y: 204, w: CAR, h: 8 };
    case "W": return { x: 140 + t, y: 188, w: CAR, h: 8 };
  }
}

export function Intersection({ sim, crossings, now, priority }: { sim: SignalSim; crossings: Crossing[]; now: number; priority?: Dir | null }) {
  const lights = lightsFor(sim.phase);
  return (
    <svg viewBox="0 0 400 400" className="h-full w-full">
      <rect width={400} height={400} fill="var(--color-ink)" />
      <rect x={140} y={0} width={120} height={400} fill="var(--color-secondary)" />
      <rect x={0} y={140} width={400} height={120} fill="var(--color-secondary)" />
      <rect x={140} y={140} width={120} height={120} fill="var(--color-muted)" />
      {[0, 1].map((i) => (
        <g key={i} stroke="var(--color-muted-foreground)" strokeOpacity={0.4} strokeDasharray="8 8">
          <line x1={200} y1={i ? 260 : 0} x2={200} y2={i ? 400 : 140} />
          <line y1={200} x1={i ? 260 : 0} y2={200} x2={i ? 400 : 140} />
        </g>
      ))}
      <g stroke="var(--color-foreground)" strokeOpacity={0.7} strokeWidth={2}>
        <line x1={200} y1={140} x2={260} y2={140} />
        <line x1={140} y1={260} x2={200} y2={260} />
        <line x1={260} y1={200} x2={260} y2={260} />
        <line x1={140} y1={140} x2={140} y2={200} />
      </g>
      {DIRS.map((d) => {
        const q = sim.queues[d];
        const n = Math.min(VISIBLE, q.length);
        return (
          <g key={d}>
            {Array.from({ length: n }, (_, i) => {
              const p = queuePos(d, i);
              const wait = sim.t - q[i];
              return <rect key={i} {...p} rx={2} width={p.w} height={p.h} fill={wait > 60 ? "var(--color-danger)" : wait > 25 ? "var(--color-warning)" : "var(--color-cyan)"} />;
            })}
            {q.length > VISIBLE && (
              <text {...(() => { const p = queuePos(d, VISIBLE); return { x: p.x - 4, y: p.y + 10 }; })()} fontSize={11} fill="var(--color-foreground)" fontFamily="var(--font-mono)">+{q.length - VISIBLE}</text>
            )}
            <circle cx={LIGHT_POS[d][0]} cy={LIGHT_POS[d][1]} r={8} fill={LIGHT_COLOR[lights[d]]} stroke={priority === d ? "var(--color-foreground)" : "none"} strokeWidth={2} />
            <text x={LIGHT_POS[d][0]} y={LIGHT_POS[d][1] + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--color-ink)">{d}</text>
          </g>
        );
      })}
      {crossings.map((c) => {
        const p = Math.min(1, (now - c.t0) / 900);
        const r = crossPos(c.dir, p);
        return <rect key={c.id} {...r} rx={2} fill="var(--color-success)" opacity={1 - p * 0.4} />;
      })}
    </svg>
  );
}
