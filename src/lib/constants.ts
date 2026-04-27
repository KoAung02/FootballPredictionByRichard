import { type SportKey, SPORT_KEYS } from "@/services/odds-api";
import { type CompetitionCode, COMPETITION_NUMERIC_IDS } from "@/services/football-data";

// ── Season ─────────────────────────────────────────────────────────────────────

export const CURRENT_SEASON = 2025;

// ── Target leagues ─────────────────────────────────────────────────────────────
// id = football-data.org numeric competition ID (stored in League.apiFootballId)

export const TARGET_LEAGUES = [
  {
    id: COMPETITION_NUMERIC_IDS.PL,
    code: "PL" as CompetitionCode,
    name: "Premier League",
    country: "England",
    slug: "premier-league",
    sportKey: SPORT_KEYS.PREMIER_LEAGUE,
  },
  {
    id: COMPETITION_NUMERIC_IDS.PD,
    code: "PD" as CompetitionCode,
    name: "La Liga",
    country: "Spain",
    slug: "la-liga",
    sportKey: SPORT_KEYS.LA_LIGA,
  },
  {
    id: COMPETITION_NUMERIC_IDS.SA,
    code: "SA" as CompetitionCode,
    name: "Serie A",
    country: "Italy",
    slug: "serie-a",
    sportKey: SPORT_KEYS.SERIE_A,
  },
  {
    id: COMPETITION_NUMERIC_IDS.BL1,
    code: "BL1" as CompetitionCode,
    name: "Bundesliga",
    country: "Germany",
    slug: "bundesliga",
    sportKey: SPORT_KEYS.BUNDESLIGA,
  },
  {
    id: COMPETITION_NUMERIC_IDS.CL,
    code: "CL" as CompetitionCode,
    name: "UEFA Champions League",
    country: "Europe",
    slug: "champions-league",
    sportKey: SPORT_KEYS.CHAMPIONS_LEAGUE,
  },
] as const satisfies Array<{
  id: number;
  code: CompetitionCode;
  name: string;
  country: string;
  slug: string;
  sportKey: SportKey;
}>;

export type LeagueConfig = (typeof TARGET_LEAGUES)[number];

/** Map from football-data competition ID to sport key, for the odds job. */
export const LEAGUE_ID_TO_SPORT_KEY: Record<number, SportKey> = Object.fromEntries(
  TARGET_LEAGUES.map((l) => [l.id, l.sportKey])
);

/** Map from league slug to football-data competition ID. */
export const SLUG_TO_LEAGUE_ID: Record<string, number> = Object.fromEntries(
  TARGET_LEAGUES.map((l) => [l.slug, l.id])
);

/** API-Football (api-sports.io) league IDs — used for the fallback odds fetcher. */
export const API_FOOTBALL_LEAGUE_IDS: Record<string, number> = {
  "premier-league":   39,
  "la-liga":         140,
  "serie-a":         135,
  "bundesliga":       78,
  "champions-league":  2,
};

// ── Rate limiting helpers ──────────────────────────────────────────────────────

/** Pause execution for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Delay between successive API-Football requests.
 * Free tier allows 10 req/min → 6 s gap is safe.
 */
export const API_FOOTBALL_DELAY_MS = 6_200;
