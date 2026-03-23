/**
 * Renders an ASCII gauge bar like: [################............] 58.2%
 */
export function gaugeBar(
  value: number,
  max: number,
  width: number = 28,
  label?: string
): string {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = "#".repeat(filled) + ".".repeat(empty);
  const pct = (ratio * 100).toFixed(1) + "%";
  const prefix = label ? `${label} ` : "";
  return `${prefix}[${bar}] ${pct}`;
}

/**
 * Renders a simpler token gauge: [#####...] 1.2M
 */
export function tokenGauge(
  value: number,
  max: number,
  width: number = 10,
  displayValue: string
): string {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = "#".repeat(filled) + ".".repeat(empty);
  return `[${bar}] ${displayValue}`;
}
