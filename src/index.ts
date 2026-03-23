import blessed from "blessed";
import { LOGO, LOGO_HEIGHT, LOGO_WIDTH, CHARACTER } from "./ui/ascii-logo.js";
import { gaugeBar } from "./ui/gauge-bar.js";
import { Spinner, SweepBar, loadingBar } from "./ui/spinner.js";
import { dailyChart } from "./ui/bar-chart.js";
import { sparkline } from "./ui/sparkline.js";
import { scanAgents, watchAgentsDir, type AgentInfo } from "./data/agents.js";
import {
  scanSessions,
  purgeDeadSessions,
  type SessionInfo,
} from "./data/sessions.js";
import { getProcessStats, type ProcessStats } from "./data/process.js";
import { loadUsage, type UsageData, type ProjectUsage } from "./data/usage.js";
import { loadRecentHistory, type HistoryEntry } from "./data/history.js";
import { HistoryBuffer } from "./data/history-buffer.js";
import { loadSessionContexts, type SessionContext } from "./data/context.js";
import { scanTasks, type TaskItem } from "./data/tasks.js";
import {
  formatNumber,
  formatTokens,
  formatUptime,
  shortPath,
  timestamp,
  truncateVisual,
} from "./utils/format.js";
import { ensureStatuslineSetup } from "./setup-statusline.js";

// ── State ──────────────────────────────────────────────────────────────
let agents: AgentInfo[] = [];
let tasks: TaskItem[] = [];
let sessions: SessionInfo[] = [];
let processMap: Map<number, ProcessStats> = new Map();
let history: HistoryEntry[] = [];
let contextMap: Map<string, SessionContext> = new Map();
let usage: UsageData = {
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
  projectUsage: [],
};

// Per-session history buffers
const cpuHistory: Map<number, HistoryBuffer> = new Map();
const memHistory: Map<number, HistoryBuffer> = new Map();

const spinner = new Spinner();
const sweepBar = new SweepBar(20);
let isRefreshing = false;
let lastUpdate = timestamp();
let loadStep = 0;
const LOAD_TOTAL = 6;

// ── Layout constants ───────────────────────────────────────────────────
const LOGO_H = LOGO_HEIGHT + 2;
const RATELIMIT_H = 7; // border + model + 5h + 7d + tokens + border
let ROW2_H = 6; // dynamic, min height (sessions)
const STATUSBAR_H = 3;

// Dynamic heights — recalculated on resize
let MIDDLE_H = 28;  // Agents / Messages+Hourly row
let MESSAGES_H = 18;
let HOURLY_H = 10;
let AGENTS_H = 28;
let PROJECTS_H = 14;
let TASKS_H = 10;
let HISTORY_H = 12;

function recalcLayout(): void {
  const screenH = screen.height as number;
  // Fixed overhead: Logo + RateLimit + Sessions + StatusBar
  const fixedH = LOGO_H + RATELIMIT_H + ROW2_H + STATUSBAR_H;
  // Remaining space for: Middle(Agents/Stats/Hourly) + Projects + Tasks + History
  const remaining = Math.max(15, screenH - fixedH);

  // Distribute proportionally: middle 45%, projects 20%, tasks 15%, history 20%
  MIDDLE_H = Math.max(10, Math.floor(remaining * 0.45));
  PROJECTS_H = Math.max(5, Math.floor(remaining * 0.20));
  TASKS_H = Math.max(5, Math.floor(remaining * 0.15));
  HISTORY_H = Math.max(4, remaining - MIDDLE_H - PROJECTS_H - TASKS_H);

  // Split middle row: Messages takes 65%, Hourly gets the rest
  MESSAGES_H = Math.max(6, Math.floor(MIDDLE_H * 0.65));
  HOURLY_H = Math.max(4, MIDDLE_H - MESSAGES_H);
  AGENTS_H = MIDDLE_H; // left column matches full middle height
}

// ── Screen ─────────────────────────────────────────────────────────────
const screen = blessed.screen({
  smartCSR: true,
  title: "Claude Monitor",
  fullUnicode: true,
});

// Calculate initial layout based on actual terminal size
recalcLayout();

// ── Logo ───────────────────────────────────────────────────────────────
const logoBox = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: LOGO_H,
  border: { type: "line" },
  style: { border: { fg: "green" } },
  tags: false,
});

// Character placed at fixed position inside logo box
const characterBox = blessed.box({
  top: 0,
  left: 1,
  width: 12,
  height: CHARACTER.length,
  content: CHARACTER.join("\n"),
  style: {},
  tags: false,
});
logoBox.append(characterBox);

// ── Rate Limit Bar ─────────────────────────────────────────────────────
const rateLimitLine = blessed.box({
  top: LOGO_H,
  left: 0,
  width: "100%",
  height: RATELIMIT_H,
  border: { type: "line" },
  label: " Usage ",
  style: { border: { fg: "yellow" }, label: { fg: "yellow" }, fg: "yellow" },
  tags: false,
});

// ── Row 1: Sessions ───────────────────────────────────────────────────
const sessionPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H,
  left: 0,
  width: "100%",
  height: ROW2_H,
  label: " Sessions ",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  scrollable: true,
  keys: true,
  vi: true,
  tags: false,
});

// ── Bottom: Agents (left 50%) | Messages + Hourly (right 50%) | History (full)
const agentPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H + ROW2_H,
  left: 0,
  width: "50%",
  height: AGENTS_H,
  label: " Agents ",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  scrollable: true,
  keys: true,
  vi: true,
  tags: false,
});

const statsPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H + ROW2_H,
  left: "50%",
  width: "50%",
  height: MESSAGES_H,
  label: " Messages",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  tags: false,
});

const hourlyPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H + ROW2_H + MESSAGES_H,
  left: "50%",
  width: "50%",
  height: HOURLY_H,
  label: " Hourly Activity ",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  tags: false,
});

const projectPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H + ROW2_H + AGENTS_H,
  left: 0,
  width: "100%",
  height: PROJECTS_H,
  label: " Projects ",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  scrollable: true,
  keys: true,
  vi: true,
  tags: false,
});

const taskPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H + ROW2_H + AGENTS_H + PROJECTS_H,
  left: 0,
  width: "100%",
  height: TASKS_H,
  label: " Tasks ",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  scrollable: true,
  keys: true,
  vi: true,
  tags: false,
});

const historyPanel = blessed.box({
  top: LOGO_H + RATELIMIT_H + ROW2_H + AGENTS_H + PROJECTS_H + TASKS_H,
  left: 0,
  width: "100%",
  height: HISTORY_H,
  label: " Recent Prompts ",
  border: { type: "line" },
  style: { border: { fg: "green" }, label: { fg: "green" } },
  scrollable: true,
  keys: true,
  vi: true,
  tags: false,
});

// ── Status Bar ─────────────────────────────────────────────────────────
const statusBar = blessed.box({
  bottom: 0,
  left: 0,
  width: "100%",
  height: STATUSBAR_H,
  border: { type: "line" },
  style: { border: { fg: "green" } },
  tags: false,
});

screen.append(logoBox);
screen.append(rateLimitLine);
screen.append(sessionPanel);
screen.append(agentPanel);
screen.append(statsPanel);
screen.append(hourlyPanel);
screen.append(projectPanel);
screen.append(taskPanel);
screen.append(historyPanel);
screen.append(statusBar);

// ── Dynamic layout ─────────────────────────────────────────────────────
function repositionPanels(): void {
  recalcLayout();

  const sessionTop = LOGO_H + RATELIMIT_H;
  sessionPanel.top = sessionTop;
  sessionPanel.height = ROW2_H;

  const middleTop = sessionTop + ROW2_H;
  agentPanel.top = middleTop;
  agentPanel.height = AGENTS_H;

  statsPanel.top = middleTop;
  statsPanel.height = MESSAGES_H;
  hourlyPanel.top = middleTop + MESSAGES_H;
  hourlyPanel.height = HOURLY_H;

  const projectTop = middleTop + AGENTS_H;
  projectPanel.top = projectTop;
  projectPanel.height = PROJECTS_H;

  const taskTop = projectTop + PROJECTS_H;
  taskPanel.top = taskTop;
  taskPanel.height = TASKS_H;

  historyPanel.top = taskTop + TASKS_H;
  historyPanel.height = HISTORY_H;
}

// ── Logo centering ─────────────────────────────────────────────────────
function centerLogo(): void {
  const boxWidth = (screen.width as number) - 2;
  const charOffset = 14; // character box width + gap
  const totalWidth = charOffset + LOGO_WIDTH;
  const basePad = Math.max(0, Math.floor((boxWidth - totalWidth) / 2));

  // Position character box
  characterBox.left = basePad + 1;

  // Position text after character, append version to last line
  const textPad = basePad + charOffset;
  const lines = LOGO.split("\n");
  const ver = usage.latestVersion ? ` v${usage.latestVersion}` : "";
  const content = lines
    .map((line, i) =>
      " ".repeat(textPad) + line + (i === lines.length - 1 ? ver : "")
    )
    .join("\n");
  logoBox.setContent(content);
}

screen.on("resize", () => {
  repositionPanels();
  centerLogo();
  screen.render();
});

centerLogo();

// ── Helpers ────────────────────────────────────────────────────────────

function formatResetTime(epochSec: number | null): string {
  if (!epochSec) return "";
  const d = new Date(epochSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const mon = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  return `${mon} ${day} ${hh}:${mm}`;
}

function formatCountdown(epochSec: number | null): string {
  if (!epochSec) return "";
  const diff = epochSec * 1000 - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const d = Math.floor(hr / 24);
  if (d > 0) return `${d}d ${hr % 24}h ${min % 60}m`;
  if (hr > 0) return `${hr}h ${min % 60}m`;
  return `${min}m`;
}

// ── Render Functions ───────────────────────────────────────────────────

// Map agent color names to blessed color codes
const COLOR_MAP: Record<string, string> = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  pink: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  orange: "\x1b[38;5;208m",
};
const RESET = "\x1b[0m";

function renderAgents(): void {
  const lines: string[] = [];
  // Panel inner width = 50% of screen - 2 (border) - 2 (left indent)
  const panelW = Math.floor((screen.width as number) / 2) - 4;
  const typeW = 10;
  const colorW = 10;
  const nameW = Math.max(12, Math.floor(panelW * 0.45));
  const sourceW = Math.max(6, panelW - nameW - typeW - colorW);

  lines.push(
    `  ${"Name".padEnd(nameW)}${"Type".padEnd(typeW)}${"Color".padEnd(colorW)}${"Source".padEnd(sourceW)}`
  );

  for (const a of agents) {
    const name =
      a.name.length > nameW - 2
        ? a.name.slice(0, nameW - 4) + ".."
        : a.name;
    const tp = a.type.padEnd(typeW);
    const colorCode = COLOR_MAP[a.color] || "";
    const colorLabel = a.color
      ? `${colorCode}${"██ " + a.color}${RESET}`
      : "-";
    // Pad after reset: visible length = 3 + color name length
    const visibleLen = a.color ? 3 + a.color.length : 1;
    const colorCell = colorLabel + " ".repeat(Math.max(0, colorW - visibleLen));
    const src = a.source.length > sourceW - 2
      ? a.source.slice(0, sourceW - 4) + ".."
      : a.source;
    lines.push(`  ${name.padEnd(nameW)}${tp}${colorCell}${src.padEnd(sourceW)}`);
  }

  agentPanel.setLabel(` Agents (${agents.length}) `);
  agentPanel.setContent(lines.join("\n"));
}

function compactGauge(pct: number | null, width: number = 10): string {
  if (pct === null) return "[" + ".".repeat(width) + "] --%";
  const filled = Math.round((pct / 100) * width);
  const bar = "#".repeat(filled) + ".".repeat(width - filled);
  return `[${bar}] ${pct.toFixed(0).padStart(2)}%`;
}

function renderRateLimits(): void {
  const rl = usage.rateLimits;
  if (!rl) {
    rateLimitLine.setContent("  (waiting for first API response...)");
    return;
  }

  const lines: string[] = [];
  const innerW = (screen.width as number) - 4; // minus border + padding

  // Gauge bar width: total width - label - " []  | Resets ..." overhead
  // Label "  5h: " = 6, " [] " = 3, " xx%" = 4, "  | " = 4, reset text ~30
  const resetTextW = 35;
  const labelW = 10; // "  Sonnet: " is the longest
  const gaugeOverhead = labelW + 3 + 4 + 4 + resetTextW; // [] + pct + separator + reset
  const gaugeW = Math.max(8, innerW - gaugeOverhead);

  if (rl.model) lines.push(`  ${rl.model}`);

  // Session (5h)
  const fhGauge = compactGauge(rl.fiveHour.usedPercentage, gaugeW);
  const fhReset = rl.fiveHour.resetsAt
    ? `Resets ${formatResetTime(rl.fiveHour.resetsAt)} (${formatCountdown(rl.fiveHour.resetsAt)})`
    : "";
  lines.push(`  5h:     ${fhGauge}  | ${fhReset}`);

  // Week (all)
  const sdGauge = compactGauge(rl.sevenDay.usedPercentage, gaugeW);
  const sdReset = rl.sevenDay.resetsAt
    ? `Resets ${formatResetTime(rl.sevenDay.resetsAt)} (${formatCountdown(rl.sevenDay.resetsAt)})`
    : "";
  lines.push(`  7d:     ${sdGauge}  | ${sdReset}`);

  // Sonnet only
  if (rl.sonnetOnly.usedPercentage !== null) {
    const soGauge = compactGauge(rl.sonnetOnly.usedPercentage, gaugeW);
    const soReset = rl.sonnetOnly.resetsAt
      ? `Resets ${formatResetTime(rl.sonnetOnly.resetsAt)} (${formatCountdown(rl.sonnetOnly.resetsAt)})`
      : "";
    lines.push(`  Sonnet: ${soGauge}  | ${soReset}`);
  }

  // Total tokens
  const totalTokens = usage.totalInputTokens + usage.totalOutputTokens;
  const cacheTokens = usage.totalCacheReadTokens + usage.totalCacheCreateTokens;
  lines.push("");
  lines.push(
    `  Tokens: ${formatTokens(totalTokens)} (in: ${formatTokens(usage.totalInputTokens)} / out: ${formatTokens(usage.totalOutputTokens)})  |  Cache: ${formatTokens(cacheTokens)} (read: ${formatTokens(usage.totalCacheReadTokens)} / create: ${formatTokens(usage.totalCacheCreateTokens)})`
  );

  rateLimitLine.setContent(lines.join("\n"));
}

function renderSessions(): void {
  const lines: string[] = [];
  const aliveSessions = sessions.filter((s) => s.alive);
  const deadSessions = sessions.filter((s) => !s.alive);

  sessionPanel.setLabel(
    ` Sessions (${aliveSessions.length} active / ${sessions.length} total) `
  );

  if (aliveSessions.length === 0 && deadSessions.length === 0) {
    lines.push("");
    lines.push("  (no sessions found)");
    sessionPanel.setContent(lines.join("\n"));
    return;
  }

  // Column widths — Path expands to fill available terminal width
  const cPid = 8;
  const cId = 38;
  const cUp = 10;
  const cCpu = 8;
  const cMem = 10;
  const cCtx = 18;
  const fixedCols = 2 + cPid + cId + cUp + cCpu + cMem + cCtx; // 2 = left indent
  const cPath = Math.max(16, (screen.width as number) - fixedCols - 2); // -2 for border

  // Header
  lines.push(
    `  ${"PID".padEnd(cPid)}${"Session ID".padEnd(cId)}${"Path".padEnd(cPath)}${"Uptime".padEnd(cUp)}${"CPU".padEnd(cCpu)}${"Memory".padEnd(cMem)}${"Context".padEnd(cCtx)}`
  );

  for (const s of aliveSessions) {
    const stats = processMap.get(s.pid);
    const cpu = stats?.cpuPercent ?? 0;
    const mem = stats?.memMB ?? 0;

    if (!cpuHistory.has(s.pid))
      cpuHistory.set(s.pid, new HistoryBuffer(30));
    if (!memHistory.has(s.pid))
      memHistory.set(s.pid, new HistoryBuffer(30));
    cpuHistory.get(s.pid)!.push(cpu);
    memHistory.get(s.pid)!.push(mem);

    // Context info: try sessionId first, then fall back to PID matching
    // (on --resume, the conversation session_id differs from sessionId)
    const ctx = contextMap.get(s.sessionId) || contextMap.get(`pid:${s.pid}`);
    const ctxPct = ctx?.usedPercentage ?? 0;
    const ctxStr = `${ctxPct}%`;

    const pidStr = String(s.pid).padEnd(cPid);
    const idStr = s.sessionId.padEnd(cId);
    const pathStr = shortPath(s.cwd, cPath - 2).padEnd(cPath);
    const upStr = formatUptime(s.startedAt).padEnd(cUp);
    const cpuStr = (cpu.toFixed(1) + "%").padEnd(cCpu);
    const memStr = (mem.toFixed(0) + " MB").padEnd(cMem);

    lines.push(`  ${pidStr}${idStr}${pathStr}${upStr}${cpuStr}${memStr}${ctxStr}`);
  }

  if (deadSessions.length > 0) {
    lines.push("");
    for (const s of deadSessions.slice(0, 3)) {
      const pidStr = String(s.pid).padEnd(cPid);
      const idStr = s.sessionId.padEnd(cId);
      lines.push(`  ${pidStr}${idStr}[DEAD]`);
    }
    if (deadSessions.length > 3) {
      lines.push(`  ... and ${deadSessions.length - 3} more`);
    }
  }

  // Dynamic height: header(1) + alive + gap(1) + dead rows + border(2), min 5
  const deadRows = Math.min(deadSessions.length, 3) + (deadSessions.length > 3 ? 1 : 0);
  const contentRows = 1 + aliveSessions.length + (deadSessions.length > 0 ? 1 + deadRows : 0);
  const newH = Math.max(5, contentRows + 2); // +2 for border
  if (newH !== ROW2_H) {
    ROW2_H = newH;
    repositionPanels();
  }

  sessionPanel.setContent(lines.join("\n"));
}

function trendStr(today: number, yesterday: number): string {
  if (yesterday === 0) return today > 0 ? "(▲ new)" : "";
  const diff = today - yesterday;
  if (diff > 0) return `(▲ ${diff})`;
  if (diff < 0) return `(▼ ${Math.abs(diff)})`;
  return "(━)";
}

/** Build an ASCII line chart with braille characters */
function asciiLineChart(
  values: number[],
  labels: string[],
  chartW: number,
  chartH: number
): string[] {
  const lines: string[] = [];
  if (values.length === 0) return ["  (no data)"];

  // Clean max for y-axis
  const rawMax = Math.max(...values, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const step = magnitude >= 100 ? magnitude / 2 : magnitude;
  const cleanMax = Math.ceil(rawMax / step) * step;

  // Y-axis label width
  const yLabelW = String(cleanMax).length + 1;
  const plotW = Math.max(1, chartW - yLabelW - 1); // -1 for axis line

  // Build grid
  for (let row = 0; row < chartH; row++) {
    const yVal = cleanMax - (cleanMax / (chartH - 1)) * row;
    const isTickRow = row === 0 || row === chartH - 1 || row === Math.floor(chartH / 2);
    const yLabel = isTickRow ? String(Math.round(yVal)).padStart(yLabelW) : " ".repeat(yLabelW);
    const axisChar = "│";

    // Plot points for this row
    let plotLine = "";
    for (let col = 0; col < plotW; col++) {
      // Map col to data index
      const dataIdx = (col / (plotW - 1)) * (values.length - 1);
      const lo = Math.floor(dataIdx);
      const hi = Math.min(lo + 1, values.length - 1);
      const frac = dataIdx - lo;
      const val = values[lo] * (1 - frac) + values[hi] * frac;

      // Map value to row
      const valRow = cleanMax > 0 ? (1 - val / cleanMax) * (chartH - 1) : chartH - 1;

      if (Math.abs(valRow - row) < 0.5) {
        plotLine += "•";
      } else if (row > valRow && row < chartH - 1) {
        // Check if line passes through this cell
        plotLine += "│";
      } else {
        plotLine += " ";
      }
    }

    lines.push(`${yLabel}${axisChar}${plotLine}`);
  }

  // X-axis
  lines.push(" ".repeat(yLabelW) + "└" + "─".repeat(plotW));

  // X-labels
  if (labels.length > 0) {
    let labelLine = " ".repeat(yLabelW + 1);
    const spacing = plotW / (labels.length - 1);
    // Show ~5 evenly spaced labels
    const showEvery = Math.max(1, Math.floor(labels.length / 5));
    const labelPositions: { pos: number; label: string }[] = [];
    for (let i = 0; i < labels.length; i += showEvery) {
      labelPositions.push({ pos: Math.round(i * spacing), label: labels[i] });
    }
    // Always include last
    if (labelPositions[labelPositions.length - 1]?.label !== labels[labels.length - 1]) {
      labelPositions.push({ pos: plotW - labels[labels.length - 1].length, label: labels[labels.length - 1] });
    }

    let cursor = 0;
    for (const lp of labelPositions) {
      if (lp.pos >= cursor) {
        labelLine += " ".repeat(lp.pos - cursor) + lp.label;
        cursor = lp.pos + lp.label.length;
      }
    }
    lines.push(labelLine);
  }

  return lines;
}

function renderStats(): void {
  const lines: string[] = [];
  const days = usage.recentDays;
  const panelInnerW = Math.floor((screen.width as number) / 2) - 2; // 50% minus border

  // Yesterday data for trend
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yd = days.find((d) => d.date === yesterdayStr);

  const ta = usage.todayActivity;
  const tSes = formatNumber(usage.totalSessions);
  const tMsg = formatNumber(usage.totalMessages);
  const tdSes = ta ? formatNumber(ta.sessionCount) : "0";
  const tdMsg = ta ? formatNumber(ta.messageCount) : "0";
  const tdSesTrend = ta ? trendStr(ta.sessionCount, yd?.sessionCount ?? 0) : "";
  const tdMsgTrend = ta ? trendStr(ta.messageCount, yd?.messageCount ?? 0) : "";

  // Header — distribute 4 columns evenly across chart width
  const headerW = panelInnerW - 3; // match chart width
  const colW = Math.floor(headerW / 4);
  lines.push(` ${"Total Sess".padEnd(colW)}${"Total Msgs".padEnd(colW)}${"Today Sess".padEnd(colW)}Today Msgs`);
  lines.push(` ${tSes.padEnd(colW)}${tMsg.padEnd(colW)}${(tdSes + tdSesTrend).padEnd(colW)}${tdMsg}${tdMsgTrend}`);
  lines.push("");

  // 14-day chart
  const today = new Date();
  const xLabels: string[] = [];
  const yValues: number[] = [];
  const dayMap = new Map(days.map((d) => [d.date, d.messageCount]));

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    xLabels.push(label);
    yValues.push(dayMap.get(key) ?? 0);
  }

  const chartH = MESSAGES_H - 2 - 3 - 2 - 2; // outer border(2) + header(3) + x-axis+labels(2) + gap+footer(2)
  const chartLines = asciiLineChart(yValues, xLabels, panelInnerW - 3, Math.max(3, chartH));
  lines.push(...chartLines.map((l) => ` ${l}`));

  // Footer
  lines.push("");
  const ls = usage.longestSession;
  lines.push(`  Longest: ${ls ? formatDuration(ls.duration) : "-"}    Since: ${usage.firstSessionDate ?? "-"}`);

  statsPanel.setContent(lines.join("\n"));
}

function renderHourly(): void {
  const hc = usage.hourCounts;
  const counts: number[] = [];
  for (let h = 0; h < 24; h++) {
    counts.push(hc[String(h)] || 0);
  }
  const maxCount = Math.max(1, ...counts);

  // Panel inner width (50% of screen - 2 border - 2 left padding - 1 right padding)
  const panelInnerW = Math.floor((screen.width as number) / 2) - 5;
  // Distribute remaining chars after 24 slots evenly
  const baseSlotW = Math.floor(panelInnerW / 24);
  const extraSlots = panelInnerW - baseSlotW * 24; // first N slots get +1
  const barW = Math.max(1, baseSlotW - 1); // bar width, leave 1 for gap

  // Vertical bar chart using block characters
  const barH = HOURLY_H - 3; // border(2) + label row(1)
  const blocks = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const lines: string[] = [];

  // Build rows top-down
  for (let row = barH - 1; row >= 0; row--) {
    let line = "  ";
    for (let h = 0; h < 24; h++) {
      const slotW = baseSlotW + (h < extraSlots ? 1 : 0);
      const bw = Math.max(1, slotW - 1);
      const ratio = counts[h] / maxCount;
      const fillLevel = ratio * barH;
      let ch: string;
      if (fillLevel >= row + 1) {
        ch = "█".repeat(bw);
      } else if (fillLevel > row) {
        const frac = fillLevel - row;
        const idx = Math.round(frac * (blocks.length - 1));
        ch = blocks[idx].repeat(bw);
      } else {
        ch = " ".repeat(bw);
      }
      line += ch + " ".repeat(Math.max(0, slotW - bw));
    }
    lines.push(line);
  }

  // Hour labels
  let labelLine = "  ";
  for (let h = 0; h < 24; h++) {
    const slotW = Math.max(2, baseSlotW + (h < extraSlots ? 1 : 0));
    const lbl = String(h).padStart(2, "0");
    labelLine += lbl.padEnd(slotW);
  }
  lines.push(labelLine);

  hourlyPanel.setContent(lines.join("\n"));
}

function renderProjects(): void {
  const lines: string[] = [];
  const projects = usage.projectUsage;

  if (projects.length === 0) {
    lines.push("  (no project data)");
    projectPanel.setContent(lines.join("\n"));
    return;
  }

  // Column widths — Project and Bar expand to fill terminal width
  const cSess = 8;
  const cMsgs = 8;
  const cTools = 8;
  const cPct = 10;  // "Tokens%"
  const cTokens = 20; // "in / out"
  const cProject = 28;
  const fixedCols = 2 + cProject + cSess + cMsgs + cTools + cPct + cTokens; // 2 = left indent
  const cBar = Math.max(12, (screen.width as number) - fixedCols - 2); // -2 for border, bar fills the rest

  // Header
  lines.push(
    `  ${"Project".padEnd(cProject)}${"Sess".padEnd(cSess)}${"Msgs".padEnd(cMsgs)}${"Tools".padEnd(cTools)}${"Tokens%".padEnd(cPct)}${"".padEnd(cBar)}${"Tokens (in/out)".padEnd(cTokens)}`
  );

  // Total tokens for percentage calculation
  const totalTokens = projects.reduce(
    (s, p) => s + p.inputTokens + p.outputTokens,
    0
  );

  const barW = cBar - 2; // leave space for padding
  for (const p of projects) {
    const tokens = p.inputTokens + p.outputTokens;
    const pct = totalTokens > 0 ? (tokens / totalTokens) * 100 : 0;

    const name = p.project.length > cProject - 2
      ? p.project.slice(0, cProject - 4) + ".."
      : p.project;
    const sess = formatNumber(p.sessionCount).padEnd(cSess);
    const msgs = formatNumber(p.messageCount).padEnd(cMsgs);
    const tools = formatNumber(p.toolCallCount).padEnd(cTools);
    const pctStr = (pct.toFixed(1) + "%").padEnd(cPct);

    // Bar fills remaining space
    const filled = Math.round((pct / 100) * barW);
    const bar = ("█".repeat(filled) + "░".repeat(barW - filled)).padEnd(cBar);

    const tokenStr = `${formatTokens(p.inputTokens)} / ${formatTokens(p.outputTokens)}`;

    lines.push(`  ${name.padEnd(cProject)}${sess}${msgs}${tools}${pctStr}${bar}${tokenStr}`);
  }

  projectPanel.setLabel(` Projects (${projects.length}) `);
  projectPanel.setContent(lines.join("\n"));
}

/** Resolve a conversation ID to the session ID shown in the Sessions panel.
 *  1) Direct match: conversation ID equals a live session's sessionId
 *  2) Fallback via contextMap PID: handles --resume where conversation ID differs
 *  3) Falls back to the original conversation ID if no live session found */
function resolveSessionId(conversationId: string): string {
  for (const s of sessions) {
    if (s.alive && s.sessionId === conversationId) return s.sessionId;
  }
  const ctx = contextMap.get(conversationId);
  if (ctx?.pid) {
    const liveSession = sessions.find(s => s.alive && s.pid === ctx.pid);
    if (liveSession) return liveSession.sessionId;
  }
  return conversationId;
}

function renderTasks(): void {
  const lines: string[] = [];

  if (tasks.length === 0) {
    lines.push("  (no tasks)");
    taskPanel.setContent(lines.join("\n"));
    return;
  }

  const STATUS_ICON: Record<string, string> = {
    in_progress: "▶",
    pending: "○",
    completed: "✓",
  };

  const cStatus = 4;
  const cId = 6;
  const cSess = 12;
  const fixedCols = 2 + cStatus + cId + cSess; // 2 = left indent
  const cSubject = Math.max(20, (screen.width as number) - fixedCols - 2); // -2 for border

  lines.push(
    `  ${"".padEnd(cStatus)}${"ID".padEnd(cId)}${"Session".padEnd(cSess)}Subject`
  );

  for (const t of tasks) {
    const icon = STATUS_ICON[t.status] || "?";
    const id = t.id.padEnd(cId);
    const sid = resolveSessionId(t.sessionId);
    const sidStr = sid.slice(0, 8).padEnd(cSess);
    const subject =
      t.subject.length > cSubject - 2
        ? t.subject.slice(0, cSubject - 4) + ".."
        : t.subject;
    lines.push(`  ${icon.padEnd(cStatus)}${id}${sidStr}${subject}`);
  }

  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  taskPanel.setLabel(
    ` Tasks (${tasks.length}) [▶${inProgress} ○${pending} ✓${completed}] `
  );
  taskPanel.setContent(lines.join("\n"));
}

function renderHistory(): void {
  const lines: string[] = [];

  if (history.length === 0) {
    lines.push("  (no history)");
    historyPanel.setContent(lines.join("\n"));
    return;
  }

  const innerW = (screen.width as number) - 2; // border(2)
  const indent = 2;
  const dateW = 12; // "3/23 14:05  "
  const sessW = 12;
  const promptW = Math.max(10, innerW - indent - dateW - sessW);

  lines.push(`  ${"Date".padEnd(dateW)}${"Session".padEnd(sessW)}Prompt`);

  for (const h of history) {
    const ts = new Date(h.timestamp);
    const hh = String(ts.getHours()).padStart(2, "0");
    const mm = String(ts.getMinutes()).padStart(2, "0");
    const dateStr = `${ts.getMonth() + 1}/${ts.getDate()} ${hh}:${mm}`;
    const sid = resolveSessionId(h.sessionId);
    const sidStr = sid.slice(0, 8).padEnd(sessW);
    const display = truncateVisual(h.display, promptW);
    lines.push(`  ${dateStr.padEnd(dateW)}${sidStr}${display}`);
  }

  historyPanel.setContent(lines.join("\n"));
}

function renderStatusBar(): void {
  const spin = isRefreshing ? spinner.tick() : "*";
  const sweep = isRefreshing ? sweepBar.tick() : "[====================]";
  const refreshLabel = isRefreshing
    ? `Refreshing... ${loadingBar(loadStep, LOAD_TOTAL, 16)}`
    : "Idle";

  statusBar.setContent(
    `  [q] Quit  [r] Refresh  [c] Clean dead  Polling: 3s  ${spin}  ${sweep}  ${refreshLabel}  |  ${lastUpdate}`
  );
}

function renderAll(): void {
  repositionPanels();
  centerLogo();
  renderAgents();
  renderRateLimits();
  renderSessions();
  renderStats();

  renderHourly();
  renderProjects();
  renderTasks();
  renderHistory();
  renderStatusBar();
}

// ── Data Loading ───────────────────────────────────────────────────────

async function refreshAll(): Promise<void> {
  isRefreshing = true;
  loadStep = 0;
  renderStatusBar();
  screen.render();

  loadStep = 1;
  renderStatusBar();
  screen.render();
  agents = await scanAgents();

  loadStep = 2;
  renderStatusBar();
  screen.render();
  sessions = await scanSessions();

  loadStep = 3;
  renderStatusBar();
  screen.render();
  const alivePids = sessions.filter((s) => s.alive).map((s) => s.pid);
  processMap = await getProcessStats(alivePids);

  loadStep = 4;
  renderStatusBar();
  screen.render();
  usage = await loadUsage();

  loadStep = 5;
  renderStatusBar();
  screen.render();
  tasks = await scanTasks();

  loadStep = 6;
  renderStatusBar();
  screen.render();
  history = await loadRecentHistory(10);

  isRefreshing = false;
  lastUpdate = timestamp();
  renderAll();
  screen.render();
}

// ── Boot Sequence ──────────────────────────────────────────────────────

async function initialLoad(): Promise<void> {
  agents = await scanAgents();
  sessions = await scanSessions();
  const alivePids = sessions.filter((s) => s.alive).map((s) => s.pid);
  processMap = await getProcessStats(alivePids);
  contextMap = await loadSessionContexts();
  usage = await loadUsage();
  tasks = await scanTasks();
  history = await loadRecentHistory(10);
  lastUpdate = timestamp();
  renderAll();
  screen.render();
}

// ── Key Bindings ───────────────────────────────────────────────────────

screen.key(["q", "C-c"], () => {
  process.exit(0);
});

screen.key(["r"], () => {
  refreshAll();
});

screen.key(["c"], async () => {
  await purgeDeadSessions();
  sessions = await scanSessions();
  renderSessions();
  lastUpdate = timestamp();
  renderStatusBar();
  screen.render();
});

// ── Polling ────────────────────────────────────────────────────────────

// Sessions + process + context: every 3 seconds
setInterval(async () => {
  sessions = await scanSessions();
  const alivePids = sessions.filter((s) => s.alive).map((s) => s.pid);
  processMap = await getProcessStats(alivePids);
  contextMap = await loadSessionContexts();
  renderSessions();
  lastUpdate = timestamp();
  renderStatusBar();
  screen.render();
}, 3000);

// Rate limits file: every 3 seconds
setInterval(async () => {
  const { loadRateLimits } = await import("./data/usage.js");
  const rl = await loadRateLimits();
  usage.rateLimits = rl;
  renderRateLimits();
  screen.render();
}, 3000);

// Usage stats + tasks: every 30 seconds
setInterval(async () => {
  usage = await loadUsage();
  tasks = await scanTasks();
  renderStats();
  renderHourly();
  renderProjects();
  renderTasks();
  screen.render();
}, 30000);

// History: every 30 seconds
setInterval(async () => {
  history = await loadRecentHistory(10);
  renderHistory();
  screen.render();
}, 30000);

// Status bar animation: every 250ms (also updates countdown)
setInterval(() => {
  renderStatusBar();
  // Update countdown every tick
  renderRateLimits();
  screen.render();
}, 250);

// Watch agents directory
watchAgentsDir(async () => {
  agents = await scanAgents();
  renderAgents();
  screen.render();
});

// ── Start ──────────────────────────────────────────────────────────────

(async () => {
  const { settingsUpdated } = await ensureStatuslineSetup();
  if (settingsUpdated) {
    // Show a brief notice during boot
    rateLimitLine.setContent(
      "  Rate limit tracking configured. Restart Claude Code sessions to activate."
    );
    screen.render();
  }
  await initialLoad();
})();
