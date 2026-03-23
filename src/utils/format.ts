export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function formatBytes(mb: number): string {
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  return mb.toFixed(1) + " MB";
}

export function formatUptime(startedAtMs: number): string {
  const elapsed = Date.now() - startedAtMs;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function shortId(id: string): string {
  return id.substring(0, 8) + "...";
}

export function shortPath(p: string, maxLen: number = 30): string {
  if (p.length <= maxLen) return p;
  const home = process.env.HOME || "";
  let display = p.startsWith(home) ? "~" + p.slice(home.length) : p;
  if (display.length <= maxLen) return display;
  return display.substring(0, maxLen - 3) + "...";
}

export function timestamp(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join(":");
}

/** Get visual width of a string (CJK chars = 2, others = 1) */
export function visualWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) || 0;
    // CJK Unified Ideographs, Hangul, fullwidth, etc.
    if (
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0x303e) || // CJK radicals
      (code >= 0x3040 && code <= 0x9fff) || // Hiragana, Katakana, CJK
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility
      (code >= 0xfe30 && code <= 0xfe6f) || // CJK Forms
      (code >= 0xff01 && code <= 0xff60) || // Fullwidth
      (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
      (code >= 0x20000 && code <= 0x2ffff) || // CJK Extension B+
      (code >= 0x2500 && code <= 0x257f) || // Box drawing
      (code >= 0x2580 && code <= 0x259f)    // Block elements
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

/** Truncate string to fit within maxVisualWidth */
export function truncateVisual(str: string, maxW: number): string {
  let w = 0;
  let i = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) || 0;
    const cw =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3040 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2ffff) ||
      (code >= 0x2500 && code <= 0x257f) ||
      (code >= 0x2580 && code <= 0x259f)
        ? 2
        : 1;
    if (w + cw > maxW - 2) {
      return str.slice(0, i) + "..";
    }
    w += cw;
    i += ch.length;
  }
  return str;
}

export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
