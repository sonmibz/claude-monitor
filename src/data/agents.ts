import { readdir, readFile, watch } from "fs/promises";
import { join } from "path";

export interface AgentInfo {
  name: string;
  type: "built-in" | "user";
  source: string;
  description: string;
  color: string;
}

const CLAUDE_DIR = join(process.env.HOME || "", ".claude");
const AGENTS_DIR = join(CLAUDE_DIR, "agents");

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

export async function scanAgents(): Promise<AgentInfo[]> {
  const agents: AgentInfo[] = [];

  try {
    const files = await readdir(AGENTS_DIR);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = await readFile(join(AGENTS_DIR, file), "utf-8");
        const meta = parseFrontmatter(content);
        const name = meta.name || file.replace(".md", "");
        agents.push({
          name,
          type: "user",
          source: "~/.claude/agents/",
          description: meta.description || meta.role || "",
          color: meta.color || "",
        });
      } catch {
        // skip unreadable files
      }
    }
  } catch {
    // agents dir may not exist
  }

  // Built-in agents (always available in Claude Code)
  const builtins = [
    { name: "general-purpose", description: "General-purpose agent" },
    { name: "Explore", description: "Codebase exploration agent" },
    { name: "Plan", description: "Software architect agent" },
    { name: "claude-code-guide", description: "Claude Code Q&A agent" },
    { name: "statusline-setup", description: "Status line config agent" },
  ];

  for (const b of builtins) {
    agents.push({
      name: b.name,
      type: "built-in",
      source: "system",
      description: b.description,
      color: "",
    });
  }

  return agents;
}

export function watchAgentsDir(onChange: () => void): void {
  try {
    const watcher = watch(AGENTS_DIR);
    (async () => {
      try {
        for await (const _ of watcher) {
          onChange();
        }
      } catch {
        // watcher closed
      }
    })();
  } catch {
    // dir may not exist
  }
}
