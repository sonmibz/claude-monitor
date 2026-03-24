export const LOGO = [
  "░█▀▀░█░░░█▀█░█░█░█▀▄░█▀▀░░░█▄█░█▀█░█▀█░▀█▀░▀█▀░█▀█░█▀▄",
  "░█░░░█░░░█▀█░█░█░█░█░█▀▀░░░█░█░█░█░█░█░░█░░░█░░█░█░█▀▄",
  "░▀▀▀░▀▀▀░▀░▀░▀▀▀░▀▀░░▀▀▀░░░▀░▀░▀▀▀░▀░▀░▀▀▀░░▀░░▀▀▀░▀░▀",
].join("\n");

export const LOGO_HEIGHT = 3;
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
