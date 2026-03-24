import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { DATA_DIR } from "../utils/paths.js";

const CONTEXTS_DIR = join(DATA_DIR, "contexts");

export interface SessionContext {
  sessionId: string;
  pid: number | null;
  usedPercentage: number | null;
  remainingPercentage: number | null;
  contextWindowSize: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  model: string | null;
  timestamp: string | null;
}

/**
 * Load session context data.
 * Returns a Map keyed by BOTH session_id AND "pid:{pid}" so the TUI
 * can look up context by either key. This handles the --resume case
 * where the conversation session_id differs from the sessionId in
 * ~/.claude/sessions/{PID}.json.
 */
export async function loadSessionContexts(): Promise<
  Map<string, SessionContext>
> {
  const result = new Map<string, SessionContext>();

  try {
    const files = await readdir(CONTEXTS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(CONTEXTS_DIR, file), "utf-8");
        const data = JSON.parse(raw);
        const ctx = data.context_window || {};
        const entry: SessionContext = {
          sessionId: data.session_id,
          pid: data.pid ?? null,
          usedPercentage: ctx.used_percentage ?? null,
          remainingPercentage: ctx.remaining_percentage ?? null,
          contextWindowSize: ctx.context_window_size ?? null,
          totalInputTokens: ctx.total_input_tokens ?? null,
          totalOutputTokens: ctx.total_output_tokens ?? null,
          model: data.model || null,
          timestamp: data.timestamp || null,
        };
        // Key by session_id (conversation ID)
        result.set(data.session_id, entry);
        // Also key by PID for --resume fallback matching.
        // If multiple context files share the same PID (e.g. after /clear),
        // keep only the most recent one so stale data doesn't linger.
        if (data.pid) {
          const pidKey = `pid:${data.pid}`;
          const existing = result.get(pidKey);
          if (
            !existing ||
            !existing.timestamp ||
            (entry.timestamp && entry.timestamp > existing.timestamp)
          ) {
            result.set(pidKey, entry);
          }
        }
      } catch {
        // skip malformed
      }
    }
  } catch {
    // dir may not exist yet
  }

  return result;
}
