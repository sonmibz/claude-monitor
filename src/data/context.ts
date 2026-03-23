import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXTS_DIR = join(__dirname, "..", "..", ".data", "contexts");

export interface SessionContext {
  sessionId: string;
  usedPercentage: number | null;
  remainingPercentage: number | null;
  contextWindowSize: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  model: string | null;
  timestamp: string | null;
}

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
        result.set(data.session_id, {
          sessionId: data.session_id,
          usedPercentage: ctx.used_percentage ?? null,
          remainingPercentage: ctx.remaining_percentage ?? null,
          contextWindowSize: ctx.context_window_size ?? null,
          totalInputTokens: ctx.total_input_tokens ?? null,
          totalOutputTokens: ctx.total_output_tokens ?? null,
          model: data.model || null,
          timestamp: data.timestamp || null,
        });
      } catch {
        // skip malformed
      }
    }
  } catch {
    // dir may not exist yet
  }

  return result;
}
