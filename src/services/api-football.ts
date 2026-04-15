/**
 * API-Football wrapper
 * Docs: https://www.api-football.com/documentation-v3
 *
 * All methods return typed responses. Throws on non-2xx HTTP or API errors.
 * Callers are responsible for caching (use src/lib/redis.ts).
 */

import axios, { AxiosInstance } from "axios";

// ─── Response shapes (subset of API-Football V3) ─────────────────────────────

export interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, string | number>;
  errors: string[] | Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T[];
}

export interface LeagueResponse {
  league: {
    id: number;
    name: string;
    type: string;
    logo: string;
  };
  country: {
    name: string;
    code: string;
    flag: string;
  };
  seasons: {
    year: number;
    start: string;
    end: string;
    current: boolean;
    coverage: Record<string, unknown>;
  }[];
}

export interface TeamResponse {
  team: {
    id: number;
    name: string;
    code: string;
    country: string;
    founded: number;
    national: boolean;
    logo: string;
  };
  venue: {
    id: number;
    name: string;
    address: string;
    city: string;
    capacity: number;
    surface: string;
    image: string;
  };
}

export interface FixtureResponse {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    round: string;
  };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: Record<string, unknown>;
}

export interface TeamStatisticsResponse {
  league: { id: number; name: string; country: string; logo: string; flag: string; season: number };
  team: { id: number; name: string; logo: string };
  form: string;
  fixtures: {
    played: { home: number; away: number; total: number };
    wins: { home: number; away: number; total: number };
    draws: { home: number; away: number; total: number };
    loses: { home: number; away: number; total: number };
  };
  goals: {
    for: { minute: Record<string, unknown>; total: { home: number; away: number; total: number }; average: { home: string; away: string; total: string } };
    against: { minute: Record<string, unknown>; total: { home: number; away: number; total: number }; average: { home: string; away: string; total: string } };
  };
  biggest: Record<string, unknown>;
  clean_sheet: { home: number; away: number; total: number };
  failed_to_score: { home: number; away: number; total: number };
  penalty: Record<string, unknown>;
  lineups: { formation: string; played: number }[];
  cards: Record<string, unknown>;
}

export interface HeadToHeadResponse {
  fixture: FixtureResponse["fixture"];
  league: FixtureResponse["league"];
  teams: FixtureResponse["teams"];
  goals: FixtureResponse["goals"];
  score: Record<string, unknown>;
}

export interface StandingEntry {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  group: string;
  form: string;
  status: string;
  description: string;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  home: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  away: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
  update: string;
}

export interface StandingsResponse {
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
    flag: string;
    season: number;
    standings: StandingEntry[][];
  };
}

// ─── Client ──────────────────────────────────────────────────────────────────

class ApiFootballClient {
  private http: AxiosInstance;

  constructor() {
    if (!process.env.API_FOOTBALL_KEY) {
      throw new Error("API_FOOTBALL_KEY environment variable is not set");
    }

    this.http = axios.create({
      baseURL: "https://v3.football.api-sports.io",
      headers: {
        "x-rapidapi-key": process.env.API_FOOTBALL_KEY,
        "x-rapidapi-host": "v3.football.api-sports.io",
      },
      timeout: 15000,
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const message =
          err.response?.data?.message ?? err.message ?? "Unknown error";
        console.error(`[API-Football] ${status ?? "?"} – ${message}`);
        return Promise.reject(new Error(`API-Football error: ${message}`));
      }
    );
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number>
  ): Promise<T[]> {
    const { data } = await this.http.get<ApiFootballResponse<T>>(path, {
      params,
    });

    const errors = data.errors;
    const hasErrors =
      Array.isArray(errors)
        ? errors.length > 0
        : Object.keys(errors).length > 0;

    if (hasErrors) {
      throw new Error(
        `API-Football API error: ${JSON.stringify(data.errors)}`
      );
    }

    return data.response;
  }

  /** For endpoints that return a single object in `response` (not an array). */
  private async getSingle<T>(
    path: string,
    params: Record<string, string | number>
  ): Promise<T | null> {
    const { data } = await this.http.get<{ errors: unknown; response: T }>(path, { params });

    const errors = data.errors;
    const hasErrors = Array.isArray(errors)
      ? errors.length > 0
      : Object.keys(errors as object).length > 0;

    if (hasErrors) {
      throw new Error(`API-Football API error: ${JSON.stringify(errors)}`);
    }

    return data.response ?? null;
  }

  // ─── League ──────────────────────────────────────────────────────────────

  /** Fetch metadata for a single league by its API-Football league ID. */
  async getLeague(leagueId: number, season: number): Promise<LeagueResponse | null> {
    const results = await this.get<LeagueResponse>("/leagues", {
      id: leagueId,
      season,
    });
    return results[0] ?? null;
  }

  // ─── Teams ───────────────────────────────────────────────────────────────

  /** Fetch all teams in a league for a given season. */
  async getTeams(leagueId: number, season: number): Promise<TeamResponse[]> {
    return this.get<TeamResponse>("/teams", { league: leagueId, season });
  }

  // ─── Fixtures ────────────────────────────────────────────────────────────

  /** Fetch all fixtures for a league season. */
  async getFixtures(
    leagueId: number,
    season: number,
    status?: string
  ): Promise<FixtureResponse[]> {
    const params: Record<string, string | number> = {
      league: leagueId,
      season,
    };
    if (status) params.status = status;
    return this.get<FixtureResponse>("/fixtures", params);
  }

  /** Fetch upcoming fixtures for a league within the next N days. */
  async getUpcomingFixtures(
    leagueId: number,
    season: number,
    nextDays: number = 14
  ): Promise<FixtureResponse[]> {
    return this.get<FixtureResponse>("/fixtures", {
      league: leagueId,
      season,
      next: nextDays,
    });
  }

  /** Fetch a single fixture by its API-Football fixture ID. */
  async getFixtureById(fixtureId: number): Promise<FixtureResponse | null> {
    const results = await this.get<FixtureResponse>("/fixtures", {
      id: fixtureId,
    });
    return results[0] ?? null;
  }

  /** Fetch live fixtures (all leagues or specific league). */
  async getLiveFixtures(leagueId?: number): Promise<FixtureResponse[]> {
    const params: Record<string, string | number> = { live: "all" };
    if (leagueId) params.league = leagueId;
    return this.get<FixtureResponse>("/fixtures", params);
  }

  // ─── Team Statistics ─────────────────────────────────────────────────────

  /** Fetch season statistics for a specific team. */
  async getTeamStatistics(
    teamId: number,
    leagueId: number,
    season: number
  ): Promise<TeamStatisticsResponse | null> {
    return this.getSingle<TeamStatisticsResponse>("/teams/statistics", {
      team: teamId,
      league: leagueId,
      season,
    });
  }

  // ─── Head To Head ─────────────────────────────────────────────────────────

  /** Fetch the last N H2H fixtures between two teams. */
  async getHeadToHead(
    team1Id: number,
    team2Id: number,
    last: number = 10
  ): Promise<HeadToHeadResponse[]> {
    return this.get<HeadToHeadResponse>("/fixtures/headtohead", {
      h2h: `${team1Id}-${team2Id}`,
      last,
    });
  }

  // ─── Standings ────────────────────────────────────────────────────────────

  /** Fetch current league standings. */
  async getStandings(
    leagueId: number,
    season: number
  ): Promise<StandingsResponse | null> {
    const results = await this.get<StandingsResponse>("/standings", {
      league: leagueId,
      season,
    });
    return results[0] ?? null;
  }
}

// Export a singleton instance
export const apiFootball = new ApiFootballClient();
