/**
 * ASCII sparkline using characters: . _ - ~ = ^ * #
 * Maps values to 8 height levels.
 */
const CHARS = [".", "_", "-", "~", "=", "^", "*", "#"];

export function sparkline(values: number[], width?: number): string {
  if (values.length === 0) return "";

  const data = width && values.length > width ? values.slice(-width) : values;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;

  return data
    .map((v) => {
      if (range === 0) return CHARS[3]; // flat line -> middle char
      const level = Math.round(((v - min) / range) * (CHARS.length - 1));
      return CHARS[level];
    })
    .join("");
}

export function sparklineWithLabel(
  label: string,
  values: number[],
  peakValue: number,
  peakLabel: string,
  width: number = 30
): string {
  const line = sparkline(values, width);
  const padded = line.padEnd(width, " ");
  return `${label} ${padded}  Peak: ${peakLabel}`;
}
