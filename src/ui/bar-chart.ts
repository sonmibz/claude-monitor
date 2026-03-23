/**
 * Horizontal ASCII bar chart.
 */
export interface BarEntry {
  label: string;
  value: number;
  displayValue: string;
}

export function horizontalBarChart(
  entries: BarEntry[],
  maxBarWidth: number = 40,
  labelWidth: number = 14
): string[] {
  if (entries.length === 0) return ["  (no data)"];

  const maxVal = Math.max(...entries.map((e) => e.value));
  const lines: string[] = [];

  for (const entry of entries) {
    const ratio = maxVal > 0 ? entry.value / maxVal : 0;
    const barLen = Math.max(1, Math.round(ratio * maxBarWidth));
    const bar = "#".repeat(barLen);
    const padBar = bar.padEnd(maxBarWidth, " ");
    const lbl = entry.label.padEnd(labelWidth);
    lines.push(`  ${lbl}|${padBar}| ${entry.displayValue}`);
  }

  return lines;
}

/**
 * Daily activity mini chart (last 7 days).
 */
export function dailyChart(
  days: { date: string; value: number }[],
  maxBarWidth: number = 16
): string[] {
  if (days.length === 0) return ["  (no data)"];

  const maxVal = Math.max(...days.map((d) => d.value));
  const lines: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const day of days) {
    const ratio = maxVal > 0 ? day.value / maxVal : 0;
    const barLen = Math.max(0, Math.round(ratio * maxBarWidth));
    const bar = "#".repeat(barLen);
    const padBar = bar.padEnd(maxBarWidth, " ");
    const marker = day.date === today ? " <--" : "";
    const dayLabel = day.date.slice(5); // MM-DD
    lines.push(`  ${dayLabel} |${padBar}| ${String(day.value).padStart(5)}${marker}`);
  }

  return lines;
}
