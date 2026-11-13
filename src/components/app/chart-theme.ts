export const axisProps = {
  stroke: "var(--color-muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: "var(--color-border)", strokeDasharray: "3 3", vertical: false } as const;

export const tooltipProps = {
  contentStyle: {
    background: "var(--surface-strong)",
    border: "1px solid var(--color-border)",
    borderRadius: 10,
    fontSize: 12,
    color: "var(--color-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
  cursor: { fill: "var(--color-accent)", opacity: 0.3 },
} as const;

export const SERIES = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-success)"];
