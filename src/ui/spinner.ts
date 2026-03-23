/**
 * ASCII spinner and progress bar animations.
 */

const SPIN_FRAMES = ["|", "/", "-", "\\"];

export class Spinner {
  private frame: number = 0;

  tick(): string {
    const ch = SPIN_FRAMES[this.frame % SPIN_FRAMES.length];
    this.frame++;
    return ch;
  }

  reset(): void {
    this.frame = 0;
  }
}

/**
 * Animated progress bar that sweeps back and forth.
 * Returns: [===>        ] or [       <===]
 */
export class SweepBar {
  private pos: number = 0;
  private direction: number = 1;
  private width: number;

  constructor(width: number = 20) {
    this.width = width;
  }

  tick(): string {
    const arrow = this.direction > 0 ? "===>" : "<===";
    const arrowLen = arrow.length;
    const maxPos = this.width - arrowLen;

    const before = " ".repeat(this.pos);
    const after = " ".repeat(Math.max(0, maxPos - this.pos));
    const bar = `[${before}${arrow}${after}]`;

    this.pos += this.direction;
    if (this.pos >= maxPos) {
      this.pos = maxPos;
      this.direction = -1;
    } else if (this.pos <= 0) {
      this.pos = 0;
      this.direction = 1;
    }

    return bar;
  }
}

/**
 * Loading bar that fills up: [==>        ] 33%
 */
export function loadingBar(
  current: number,
  total: number,
  width: number = 20
): string {
  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar =
    "=".repeat(Math.max(0, filled - 1)) +
    (filled > 0 ? ">" : "") +
    " ".repeat(empty);
  const pct = Math.round(ratio * 100);
  return `[${bar}] ${pct}%`;
}
