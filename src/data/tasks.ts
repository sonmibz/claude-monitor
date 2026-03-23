import { readdir, readFile } from "fs/promises";
import { join } from "path";

export interface TaskItem {
  id: string;
  subject: string;
  status: string;
  description: string;
  sessionId: string;
}

const TASKS_DIR = join(process.env.HOME || "", ".claude", "tasks");

export async function scanTasks(): Promise<TaskItem[]> {
  const tasks: TaskItem[] = [];

  try {
    const sessionDirs = await readdir(TASKS_DIR);
    for (const sessionId of sessionDirs) {
      const sessionPath = join(TASKS_DIR, sessionId);
      try {
        const files = await readdir(sessionPath);
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const raw = await readFile(join(sessionPath, file), "utf-8");
            const data = JSON.parse(raw);
            tasks.push({
              id: data.id || file.replace(".json", ""),
              subject: data.subject || "",
              status: data.status || "unknown",
              description: data.description || "",
              sessionId,
            });
          } catch {
            // skip malformed files
          }
        }
      } catch {
        // skip non-directories or unreadable
      }
    }
  } catch {
    // tasks dir may not exist
  }

  // Sort: in_progress first, then pending, then completed
  const order: Record<string, number> = {
    in_progress: 0,
    pending: 1,
    completed: 2,
  };
  tasks.sort(
    (a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3)
  );

  return tasks;
}
