/**
 * football-data.org API v4 wrapper
 * Docs: https://docs.football-data.org/general/v4/index.html
 *
 * Free tier: 10 requests/minute, no daily cap.
 * Auth: X-Auth-Token header.
 */

import axios, { AxiosInstance } from "axios";

// ── Competition codes → numeric IDs ──────────────────────────────────────────

export const COMPETITION_CODES = {
  PREMIER_LEAGUE: "PL",
  LA_LIGA: "PD",
  SERIE_A: "SA",
  BUNDESLIGA: "BL1",
  LIGUE_1: "FL1",
  CHAMPIONS_LEAGUE: "CL",
} as const;

export type CompetitionCode = (typeof COMPETITION_CODES)[keyof typeof COMPETITION_CODES];

/** football-data.org numeric competition IDs (stable) */
export const COMPETITION_NUMERIC_IDS: Record<CompetitionCode, number> = {
  PL: 2021,
  PD: 2014,
  SA: 2019,
  BL1: 2002,
  FL1: 2015,
  CL: 2001,
};

// ── Response shapes ───────────────────────────────────────────────────────────

export interface FDTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  venue: string;
  area: { id: number; name: string; code: string; flag: string | null };
}

export interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string;
  homeTeam: { id: number; name: string; crest: string };
  awayTeam: { id: number; name: string; crest: string };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
}

export interface FDStandingRow {
  position: number;
  team: { id: number; name: string; crest: string };
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface FDStandings {
  total: FDStandingRow[];
  home: FDStandingRow[];
  away: FDStandingRow[];
}

// ── Client ────────────────────────────────────────────────────────────────────

class FootballDataClient {
  private http: AxiosInstance;

  constructor() {
    if (!process.env.FOOTBALL_DATA_API_KEY) {
      throw new Error("FOOTBALL_DATA_API_KEY environment variable is not set");
    }
    this.http = axios.create({
      baseURL: "https://api.football-data.org/v4",
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY },
      timeout: 15000,
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const message = err.response?.data?.message ?? err.message ?? "Unknown error";
        console.error(`[football-data] ${status ?? "?"} – ${message}`);
        return Promise.reject(new Error(`football-data.org error: ${message}`));
      }
    );
  }

  /** All teams in a competition for the current season. */
  async getTeams(code: CompetitionCode): Promise<FDTeam[]> {
    const { data } = await this.http.get(`/competitions/${code}/teams`);
    return data.teams as FDTeam[];
  }

  /** Matches for a competition, optionally filtered by date range. */
  async getMatches(
    code: CompetitionCode,
    params: { dateFrom?: string; dateTo?: string; status?: string } = {}
  ): Promise<FDMatch[]> {
    const { data } = await this.http.get(`/competitions/${code}/matches`, {
      params,
    });
    return data.matches as FDMatch[];
  }

  /** League standings (returns TOTAL, HOME and AWAY tables in one call). */
  async getStandings(code: CompetitionCode): Promise<FDStandings> {
    const { data } = await this.http.get(`/competitions/${code}/standings`);
    const find = (type: string): FDStandingRow[] =>
      (data.standings as { type: string; table: FDStandingRow[] }[]).find(
        (s) => s.type === type
      )?.table ?? [];
    return { total: find("TOTAL"), home: find("HOME"), away: find("AWAY") };
  }
}

export const footballData = new FootballDataClient();
