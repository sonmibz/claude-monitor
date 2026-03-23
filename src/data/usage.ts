import { readFile, readdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { todayStr } from "../utils/format.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = join(process.env.HOME || "", ".claude", "projects");
const RATE_LIMITS_FILE = join(
  __dirname,
  "..",
  "..",
  ".data",
  "rate-limits-latest.json"
);

// UTC offset for KST (hours)
const KST_OFFSET = 9;

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface RateLimitWindow {
  usedPercentage: number | null;
  resetsAt: number | null; // unix epoch seconds
}

export interface RateLimits {
  model: string | null;
  fiveHour: RateLimitWindow;
  sevenDay: RateLimitWindow;
  sonnetOnly: RateLimitWindow;
  timestamp: string | null;
}

export interface LongestSession {
  sessionId: string;
  duration: number; // ms
  messageCount: number;
  timestamp: string;
}

export interface DailyModelTokens {
  date: string;
  tokensByModel: Record<string, number>;
}

export interface UsageData {
  todayActivity: DailyActivity | null;
  recentDays: DailyActivity[];
  modelUsage: ModelUsage[];
  totalSessions: number;
  totalMessages: number;
  totalToolCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  latestVersion: string | null;
  rateLimits: RateLimits | null;
  hourCounts: Record<string, number>;
  longestSession: LongestSession | null;
  dailyModelTokens: DailyModelTokens[];
  firstSessionDate: string | null;
  lastComputedDate: string | null;
}

export async function loadRateLimits(): Promise<RateLimits | null> {
  try {
    const raw = await readFile(RATE_LIMITS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return {
      model: data.model || null,
      fiveHour: {
        usedPercentage: data.five_hour?.used_percentage ?? null,
        resetsAt: data.five_hour?.resets_at ?? null,
      },
      sevenDay: {
        usedPercentage: data.seven_day?.used_percentage ?? null,
        resetsAt: data.seven_day?.resets_at ?? null,
      },
      sonnetOnly: {
        usedPercentage: data.sonnet_only?.used_percentage ?? null,
        resetsAt: data.sonnet_only?.resets_at ?? null,
      },
      timestamp: data.timestamp || null,
    };
  } catch {
    return null;
  }
}

/** Convert a UTC ISO timestamp to a KST date string (YYYY-MM-DD) */
function utcToKstDate(isoTs: string): string {
  const d = new Date(isoTs);
  d.setHours(d.getUTCHours() + KST_OFFSET);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Convert a UTC ISO timestamp to KST hour (0-23) */
function utcToKstHour(isoTs: string): number {
  const d = new Date(isoTs);
  return (d.getUTCHours() + KST_OFFSET) % 24;
}

/** Collect all .jsonl files under PROJECTS_DIR recursively */
async function collectJsonlFiles(): Promise<string[]> {
  const files: string[] = [];
  try {
    const projectDirs = await readdir(PROJECTS_DIR);
    for (const dir of projectDirs) {
      const projectPath = join(PROJECTS_DIR, dir);
      try {
        const st = await stat(projectPath);
        if (!st.isDirectory()) continue;
        const entries = await readdir(projectPath);
        for (const entry of entries) {
          if (entry.endsWith(".jsonl")) {
            files.push(join(projectPath, entry));
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // projects dir may not exist
  }
  return files;
}

interface SessionStats {
  sessionId: string;
  messageCount: number;
  toolCallCount: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  dailyMessages: Record<string, number>;
  dailyTools: Record<string, number>;
  hourlyMessages: Record<string, number>;
  modelTokens: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }>;
  version: string | null;
}

/** Parse a single JSONL file and extract stats */
async function parseSessionFile(filePath: string): Promise<SessionStats> {
  const sessionId = filePath.split("/").pop()?.replace(".jsonl", "") || "";
  const result: SessionStats = {
    sessionId,
    messageCount: 0,
    toolCallCount: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    dailyMessages: {},
    dailyTools: {},
    hourlyMessages: {},
    modelTokens: {},
    version: null,
  };

  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      try {
        const d = JSON.parse(line);
        const type = d.type;
        const ts: string = d.timestamp || "";

        if (type === "user") {
          const role = d.message?.role;
          if (role !== "user") return;
          // Skip tool_result messages (these are automatic, not user prompts)
          const content = d.message?.content;
          if (Array.isArray(content)) {
            const hasToolResult = content.some(
              (c: any) => c?.type === "tool_result"
            );
            if (hasToolResult) return;
          }

          result.messageCount++;
          if (ts) {
            if (!result.firstTimestamp || ts < result.firstTimestamp)
              result.firstTimestamp = ts;
            if (!result.lastTimestamp || ts > result.lastTimestamp)
              result.lastTimestamp = ts;

            const day = utcToKstDate(ts);
            result.dailyMessages[day] = (result.dailyMessages[day] || 0) + 1;

            const hour = String(utcToKstHour(ts));
            result.hourlyMessages[hour] =
              (result.hourlyMessages[hour] || 0) + 1;
          }
        } else if (type === "assistant") {
          const content = d.message?.content;
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c?.type === "tool_use") {
                result.toolCallCount++;
                if (ts) {
                  const day = utcToKstDate(ts);
                  result.dailyTools[day] = (result.dailyTools[day] || 0) + 1;
                }
              }
            }
          }
          // Token usage
          const usage = d.message?.usage;
          const model: string = d.message?.model || "";
          if (usage && model) {
            if (!result.modelTokens[model]) {
              result.modelTokens[model] = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
            }
            const mt = result.modelTokens[model];
            mt.input += usage.input_tokens || 0;
            mt.output += usage.output_tokens || 0;
            mt.cacheRead += usage.cache_read_input_tokens || 0;
            mt.cacheCreate += usage.cache_creation_input_tokens || 0;
          }
        }

        // Version (take the latest seen)
        const ver: string = d.version || "";
        if (ver && (!result.version || ver > result.version)) {
          result.version = ver;
        }
      } catch {
        // skip malformed lines
      }
    });

    rl.on("close", () => resolve(result));
    rl.on("error", () => resolve(result));
  });
}

// Simple in-memory cache to avoid re-parsing all files every 30s
let cachedUsage: UsageData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 25_000; // 25s (polled every 30s)

export async function loadUsage(): Promise<UsageData> {
  const now = Date.now();
  if (cachedUsage && now - cacheTimestamp < CACHE_TTL_MS) {
    // Refresh rate limits even from cache
    cachedUsage.rateLimits = await loadRateLimits();
    return cachedUsage;
  }

  const result: UsageData = {
    todayActivity: null,
    recentDays: [],
    modelUsage: [],
    totalSessions: 0,
    totalMessages: 0,
    totalToolCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheCreateTokens: 0,
    latestVersion: null,
    rateLimits: null,
    hourCounts: {},
    longestSession: null,
    dailyModelTokens: [],
    firstSessionDate: null,
    lastComputedDate: null,
  };

  result.rateLimits = await loadRateLimits();

  const files = await collectJsonlFiles();
  result.totalSessions = files.length;

  // Parse all files concurrently (batched to avoid fd exhaustion)
  const BATCH = 50;
  const allStats: SessionStats[] = [];
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(parseSessionFile));
    allStats.push(...results);
  }

  // Aggregate
  const dailyMap: Record<string, DailyActivity> = {};
  const dailySessions: Record<string, Set<string>> = {};
  const modelMap: Record<string, ModelUsage> = {};
  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (const ss of allStats) {
    result.totalMessages += ss.messageCount;
    result.totalToolCalls += ss.toolCallCount;

    // Version (keep latest)
    if (ss.version && (!result.latestVersion || ss.version > result.latestVersion)) {
      result.latestVersion = ss.version;
    }

    // Daily messages & tools
    for (const [day, count] of Object.entries(ss.dailyMessages)) {
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, messageCount: 0, sessionCount: 0, toolCallCount: 0 };
        dailySessions[day] = new Set();
      }
      dailyMap[day].messageCount += count;
      dailySessions[day].add(ss.sessionId);
    }
    for (const [day, count] of Object.entries(ss.dailyTools)) {
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, messageCount: 0, sessionCount: 0, toolCallCount: 0 };
        dailySessions[day] = new Set();
      }
      dailyMap[day].toolCallCount += count;
    }

    // Hourly
    for (const [hour, count] of Object.entries(ss.hourlyMessages)) {
      result.hourCounts[hour] = (result.hourCounts[hour] || 0) + count;
    }

    // Model usage
    for (const [model, tokens] of Object.entries(ss.modelTokens)) {
      if (!modelMap[model]) {
        modelMap[model] = { model, inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
      }
      modelMap[model].inputTokens += tokens.input;
      modelMap[model].outputTokens += tokens.output;
      modelMap[model].cacheReadInputTokens += tokens.cacheRead;
      modelMap[model].cacheCreationInputTokens += tokens.cacheCreate;
    }

    // First/last date
    if (ss.firstTimestamp) {
      const day = utcToKstDate(ss.firstTimestamp);
      if (!firstDate || day < firstDate) firstDate = day;
    }
    if (ss.lastTimestamp) {
      const day = utcToKstDate(ss.lastTimestamp);
      if (!lastDate || day > lastDate) lastDate = day;
    }

    // Longest session
    if (ss.firstTimestamp && ss.lastTimestamp && ss.messageCount > 0) {
      const duration =
        new Date(ss.lastTimestamp).getTime() -
        new Date(ss.firstTimestamp).getTime();
      if (
        !result.longestSession ||
        duration > result.longestSession.duration
      ) {
        result.longestSession = {
          sessionId: ss.sessionId,
          duration,
          messageCount: ss.messageCount,
          timestamp: ss.firstTimestamp,
        };
      }
    }
  }

  // Finalize daily session counts
  for (const [day, sessions] of Object.entries(dailySessions)) {
    if (dailyMap[day]) {
      dailyMap[day].sessionCount = sessions.size;
    }
  }

  // Today
  const today = todayStr();
  result.todayActivity = dailyMap[today] || null;

  // Recent 7 days
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - 14);
  const cutoff = daysAgo.toISOString().slice(0, 10);
  result.recentDays = Object.values(dailyMap)
    .filter((d) => d.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  result.modelUsage = Object.values(modelMap);
  for (const mu of result.modelUsage) {
    result.totalInputTokens += mu.inputTokens;
    result.totalOutputTokens += mu.outputTokens;
    result.totalCacheReadTokens += mu.cacheReadInputTokens;
    result.totalCacheCreateTokens += mu.cacheCreationInputTokens;
  }
  result.firstSessionDate = firstDate;
  result.lastComputedDate = lastDate;

  // Cache result
  cachedUsage = result;
  cacheTimestamp = Date.now();

  return result;
}
