import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert decimal odds to implied probability (0–1). */
export function oddsToImpliedProbability(decimalOdds: number): number {
  if (decimalOdds <= 0) return 0;
  return 1 / decimalOdds;
}

/** Format a probability (0–1) as a percentage string. */
export function formatProbability(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

/** Format decimal odds to 2 decimal places. */
export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

/** Slugify a string (e.g. "Premier League" → "premier-league"). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** Return "Home Win", "Draw", or "Away Win" from 1X2 probabilities. */
export function getFavorite(
  homeWin: number,
  draw: number,
  awayWin: number
): "Home Win" | "Draw" | "Away Win" {
  const max = Math.max(homeWin, draw, awayWin);
  if (max === homeWin) return "Home Win";
  if (max === draw) return "Draw";
  return "Away Win";
}
