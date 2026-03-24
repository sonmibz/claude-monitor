import { readFile, writeFile, mkdir, chmod } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { DATA_DIR, SCRIPTS_DIR } from "./utils/paths.js";

const CLAUDE_DIR = join(process.env.HOME || "", ".claude");
const SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");
const SCRIPT_PATH = join(SCRIPTS_DIR, "statusline-rate-limits.sh");

/** Where the statusline script writes rate-limits JSON */
export const RATE_LIMITS_FILE = join(DATA_DIR, "rate-limits-latest.json");

/** Generate the statusline shell script with the correct DATA_DIR baked in. */
function generateStatuslineScript(): string {
  // Use string concatenation to avoid template literal interpreting shell $variables
  return '#!/bin/bash\n'
    + '# Statusline script: writes rate_limits and per-session context data\n'
    + '# for Claude Monitor dashboard.\n'
    + 'DATA_DIR="' + DATA_DIR + '"\n'
    + 'OUTFILE="$DATA_DIR/rate-limits-latest.json"\n'
    + '\n'
    + 'mkdir -p "$DATA_DIR/contexts" 2>/dev/null\n'
    + '\n'
    + 'input=$(cat)\n'
    + '\n'
    + '# Write rate_limits JSON\n'
    + 'echo "$input" | jq -c \'{\n'
    + '  timestamp: (now | todate),\n'
    + '  model: .model.display_name,\n'
    + '  five_hour: {\n'
    + '    used_percentage: (.rate_limits.five_hour.used_percentage // null),\n'
    + '    resets_at: (.rate_limits.five_hour.resets_at // null)\n'
    + '  },\n'
    + '  seven_day: {\n'
    + '    used_percentage: (.rate_limits.seven_day.used_percentage // null),\n'
    + '    resets_at: (.rate_limits.seven_day.resets_at // null)\n'
    + '  },\n'
    + '  sonnet_only: {\n'
    + '    used_percentage: (.rate_limits.sonnet_only.used_percentage // null),\n'
    + '    resets_at: (.rate_limits.sonnet_only.resets_at // null)\n'
    + '  }\n'
    + '}\' > "$OUTFILE" 2>/dev/null\n'
    + '\n'
    + '# Write per-session context data\n'
    + 'SESSION_ID=$(echo "$input" | jq -r \'.session_id // empty\')\n'
    + 'if [ -n "$SESSION_ID" ]; then\n'
    + '  echo "$input" | jq -c --arg pid "$PPID" \'{\n'
    + '    session_id: .session_id,\n'
    + '    pid: ($pid | tonumber),\n'
    + '    timestamp: (now | todate),\n'
    + '    model: .model.display_name,\n'
    + '    context_window: {\n'
    + '      used_percentage: (.context_window.used_percentage // null),\n'
    + '      remaining_percentage: (.context_window.remaining_percentage // null),\n'
    + '      context_window_size: (.context_window.context_window_size // null),\n'
    + '      total_input_tokens: (.context_window.total_input_tokens // null),\n'
    + '      total_output_tokens: (.context_window.total_output_tokens // null)\n'
    + '    },\n'
    + '    cost: {\n'
    + '      total_cost_usd: (.cost.total_cost_usd // null),\n'
    + '      total_duration_ms: (.cost.total_duration_ms // null)\n'
    + '    }\n'
    + '  }\' > "$DATA_DIR/contexts/$SESSION_ID.json" 2>/dev/null\n'
    + 'fi\n'
    + '\n'
    + '# Display in status line\n'
    + 'MODEL=$(echo "$input" | jq -r \'.model.display_name // "unknown"\')\n'
    + 'FIVE_H=$(echo "$input" | jq -r \'.rate_limits.five_hour.used_percentage // empty\')\n'
    + 'WEEK=$(echo "$input" | jq -r \'.rate_limits.seven_day.used_percentage // empty\')\n'
    + 'CTX=$(echo "$input" | jq -r \'.context_window.used_percentage // empty\')\n'
    + '\n'
    + 'LIMITS=""\n'
    + '[ -n "$FIVE_H" ] && LIMITS="5h: $(printf \'%.0f\' "$FIVE_H")%"\n'
    + '[ -n "$WEEK" ] && LIMITS="${LIMITS:+$LIMITS }7d: $(printf \'%.0f\' "$WEEK")%"\n'
    + '[ -n "$CTX" ] && LIMITS="${LIMITS:+$LIMITS }ctx: $(printf \'%.0f\' "$CTX")%"\n'
    + '\n'
    + '[ -n "$LIMITS" ] && echo "[$MODEL] | $LIMITS" || echo "[$MODEL]"\n';
}

/**
 * Ensures:
 * 1. ~/.claude/claude-monitor/data/ directory exists
 * 2. statusline script is written/updated
 * 3. settings.json points statusLine to our script
 * Returns what was changed.
 */
export async function ensureStatuslineSetup(): Promise<{
  settingsUpdated: boolean;
}> {
  let settingsUpdated = false;

  // Ensure directories exist
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(join(DATA_DIR, "contexts"), { recursive: true });

  // Write/update the statusline script
  const scriptContent = generateStatuslineScript();
  const needsWrite = !existsSync(SCRIPT_PATH) ||
    (await readFile(SCRIPT_PATH, "utf-8").catch(() => "")) !== scriptContent;

  if (needsWrite) {
    await writeFile(SCRIPT_PATH, scriptContent, "utf-8");
    await chmod(SCRIPT_PATH, 0o755);
  }

  // Update settings.json to point to our script
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);

    if (!settings.statusLine || settings.statusLine.command !== SCRIPT_PATH) {
      settings.statusLine = {
        type: "command",
        command: SCRIPT_PATH,
      };
      await writeFile(
        SETTINGS_PATH,
        JSON.stringify(settings, null, 2) + "\n",
        "utf-8"
      );
      settingsUpdated = true;
    }
  } catch {
    // settings.json doesn't exist or is malformed — skip
  }

  return { settingsUpdated };
}
