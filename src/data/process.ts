export interface ProcessStats {
  pid: number;
  cpuPercent: number;
  memMB: number;
}

export async function getProcessStats(
  pids: number[]
): Promise<Map<number, ProcessStats>> {
  const result = new Map<number, ProcessStats>();
  if (pids.length === 0) return result;

  try {
    const pidList = pids.join(",");
    const proc = Bun.spawn(["ps", "-o", "pid=,pcpu=,rss=", "-p", pidList], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    for (const line of output.trim().split("\n")) {
      if (!line.trim()) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const pid = parseInt(parts[0], 10);
        const cpuPercent = parseFloat(parts[1]) || 0;
        const rssKB = parseInt(parts[2], 10) || 0;
        result.set(pid, {
          pid,
          cpuPercent,
          memMB: rssKB / 1024,
        });
      }
    }
  } catch {
    // ps may fail if all PIDs are dead
  }

  return result;
}
