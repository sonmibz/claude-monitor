import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoPath = join(__dirname, "logo.txt");

export const LOGO = readFileSync(logoPath, "utf-8").trimEnd();
export const LOGO_HEIGHT = LOGO.split("\n").length;
const lines = LOGO.split("\n");
export const LOGO_WIDTH = Math.max(...lines.map((l) => l.length));

// Character rendered separately to avoid unicode width issues
export const CHARACTER = [
  " ▐▛███▜▌",
  "▝▜█████▛▘",
  "  ▘▘ ▝▝",
];
export const CHARACTER_HEIGHT = CHARACTER.length;
export const CHARACTER_WIDTH = 10; // visual width
