import { readdir, readFile, unlink } from "fs/promises";
import { join } from "path";

export interface SessionInfo {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
  alive: boolean;
}

const SESSIONS_DIR = join(process.env.HOME || "", ".claude", "sessions");

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function scanSessions(): Promise<SessionInfo[]> {
  const sessions: SessionInfo[] = [];

  try {
    const files = await readdir(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(SESSIONS_DIR, file), "utf-8");
        const data = JSON.parse(raw);
        const alive = isProcessAlive(data.pid);
        sessions.push({
          pid: data.pid,
          sessionId: data.sessionId || "",
          cwd: data.cwd || "",
          startedAt: data.startedAt || 0,
          alive,
        });
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // sessions dir may not exist
  }

  // Sort: alive first, then by startedAt desc
  sessions.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.startedAt - a.startedAt;
  });

  return sessions;
}

/**
 * Remove session files whose PIDs are no longer alive.
 * Claude Code never cleans these up, so they accumulate as orphans.
 */
export async function purgeDeadSessions(): Promise<number> {
  let count = 0;
  try {
    const files = await readdir(SESSIONS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(SESSIONS_DIR, file), "utf-8");
        const data = JSON.parse(raw);
        if (!isProcessAlive(data.pid)) {
          await unlink(join(SESSIONS_DIR, file));
          count++;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // dir may not exist
  }
  return count;
}
