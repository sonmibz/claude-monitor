import { join } from "path";

const CLAUDE_DIR = join(process.env.HOME || "", ".claude");

/**
 * All runtime data lives under ~/.claude/claude-monitor/.
 * This makes both dev mode and compiled binary fully self-contained.
 */
export const DATA_DIR = join(CLAUDE_DIR, "claude-monitor", "data");
export const SCRIPTS_DIR = join(CLAUDE_DIR, "claude-monitor");
