import { readFile } from "fs/promises";
import { join } from "path";

const HISTORY_FILE = join(process.env.HOME || "", ".claude", "history.jsonl");

export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId: string;
}

export async function loadRecentHistory(
  count: number = 10
): Promise<HistoryEntry[]> {
  try {
    const raw = await readFile(HISTORY_FILE, "utf-8");
    const lines = raw.trim().split("\n");
    const recent = lines.slice(-count);
    const entries: HistoryEntry[] = [];

    for (const line of recent) {
      try {
        const data = JSON.parse(line);
        // Take first line of display, truncate
        const firstLine = (data.display || "").split("\n")[0].trim();
        entries.push({
          display: firstLine,
          timestamp: data.timestamp || 0,
          project: data.project || "",
          sessionId: data.sessionId || "",
        });
      } catch {
        // skip malformed lines
      }
    }

    return entries.reverse(); // newest first
  } catch {
    return [];
  }
}
