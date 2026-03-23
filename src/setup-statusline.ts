import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const SCRIPT_PATH = join(PROJECT_ROOT, "scripts", "statusline-rate-limits.sh");
const DATA_DIR = join(PROJECT_ROOT, ".data");

const CLAUDE_DIR = join(process.env.HOME || "", ".claude");
const SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

/** Where the statusline script writes rate-limits JSON */
export const RATE_LIMITS_FILE = join(DATA_DIR, "rate-limits-latest.json");

/**
 * Ensures:
 * 1. .data/ directory exists
 * 2. settings.json points statusLine to our script
 * Returns what was changed.
 */
export async function ensureStatuslineSetup(): Promise<{
  settingsUpdated: boolean;
}> {
  let settingsUpdated = false;

  // Ensure .data/ exists
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  // Update settings.json to point to our script (absolute path)
  try {
    const raw = await readFile(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);

    const expectedCommand = SCRIPT_PATH;

    if (!settings.statusLine || settings.statusLine.command !== expectedCommand) {
      settings.statusLine = {
        type: "command",
        command: expectedCommand,
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
