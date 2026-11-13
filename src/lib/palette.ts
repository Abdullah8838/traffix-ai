// Hex mirrors of the design tokens in src/styles.css, for canvas/WebGL/Leaflet
// renderers that cannot read CSS variables.
export const PALETTE = {
  navy: "#07111F",
  ink: "#080D16",
  blue: "#2563EB",
  cyan: "#06B6D4",
  violet: "#8B5CF6",
  green: "#22C55E",
  amber: "#F59E0B",
  red: "#EF4444",
  slate: "#64748B",
  text: "#E6EDF7",
} as const;

export const ROUTE_COLORS = {
  shortest: PALETTE.amber,
  fastest: PALETTE.cyan,
  ai: PALETTE.violet,
  emergency: PALETTE.red,
  normal: PALETTE.slate,
} as const;

function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Congestion 0..1 → green → amber → red. */
export function congestionColor(c: number) {
  if (c < 0.45) return mix(PALETTE.green, PALETTE.amber, Math.max(0, (c - 0.15) / 0.3));
  if (c < 0.75) return mix(PALETTE.amber, PALETTE.red, (c - 0.45) / 0.3);
  return PALETTE.red;
}

/** Tailwind token class for a congestion level (text colour). */
export function congestionTone(c: number) {
  return c < 0.4 ? "text-success" : c < 0.6 ? "text-warning" : c < 0.8 ? "text-danger/90" : "text-danger";
}

export const SERIES_HEX = [PALETTE.cyan, PALETTE.violet, PALETTE.amber, PALETTE.green, PALETTE.blue, PALETTE.red];
