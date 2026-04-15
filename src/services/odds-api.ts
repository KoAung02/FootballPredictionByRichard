/**
 * The Odds API wrapper
 * Docs: https://the-odds-api.com/lol-of-api/rugby/
 *
 * Supports pre-match and live odds for 1X2, Over/Under, and BTTS markets.
 * Callers are responsible for caching results (use src/lib/redis.ts).
 */

import axios, { AxiosInstance } from "axios";

// ─── Constants ────────────────────────────────────────────────────────────────

/** The Odds API sport keys for our target leagues */
export const SPORT_KEYS = {
  PREMIER_LEAGUE: "soccer_epl",
  LA_LIGA: "soccer_spain_la_liga",
  SERIE_A: "soccer_italy_serie_a",
  BUNDESLIGA: "soccer_germany_bundesliga",
  LIGUE_1: "soccer_france_ligue_one",
  CHAMPIONS_LEAGUE: "soccer_uefa_champs_league",
} as const;

export type SportKey = (typeof SPORT_KEYS)[keyof typeof SPORT_KEYS];

/** Supported bet markets */
export const MARKETS = {
  H2H: "h2h",             // 1X2
  TOTALS: "totals",       // Over / Under
  BTTS: "btts",           // Both Teams To Score
} as const;

export type Market = (typeof MARKETS)[keyof typeof MARKETS];

// ─── Response shapes ─────────────────────────────────────────────────────────

export interface OddsOutcome {
  name: string;      // "Home", "Draw", "Away" | "Over", "Under" | "Yes", "No"
  price: number;     // Decimal odds
  point?: number;    // Line value (e.g. 2.5 for totals)
}

export interface OddsMarket {
  key: Market;
  last_update: string;
  outcomes: OddsOutcome[];
}

export interface BookmakerOdds {
  key: string;       // Bookmaker identifier (e.g. "bet365")
  title: string;     // Human-readable name
  last_update: string;
  markets: OddsMarket[];
}

export interface EventOdds {
  id: string;
  sport_key: SportKey;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: BookmakerOdds[];
}

/** Normalised odds record – ready to store in the database */
export interface NormalisedOdds {
  bookmaker: string;
  market: "1X2" | "OU25" | "BTTS";
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  overLine?: number;
  overOdds?: number;
  underOdds?: number;
  bttsYes?: number;
  bttsNo?: number;
}

// ─── Client ──────────────────────────────────────────────────────────────────

class OddsApiClient {
  private http: AxiosInstance;

  constructor() {
    if (!process.env.ODDS_API_KEY) {
      throw new Error("ODDS_API_KEY environment variable is not set");
    }

    this.http = axios.create({
      baseURL: "https://api.the-odds-api.com/v4",
      timeout: 15000,
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const message = err.response?.data?.message ?? err.message ?? "Unknown";
        console.error(`[OddsAPI] ${status ?? "?"} – ${message}`);
        return Promise.reject(new Error(`OddsAPI error: ${message}`));
      }
    );
  }

  // ─── Pre-match odds ───────────────────────────────────────────────────────

  /**
   * Fetch pre-match odds for all events in a sport.
   * Returns odds from all available bookmakers for the requested markets.
   */
  async getOdds(
    sportKey: SportKey,
    markets: Market[] = [MARKETS.H2H, MARKETS.TOTALS, MARKETS.BTTS],
    regions: string = "uk,eu"
  ): Promise<EventOdds[]> {
    const { data } = await this.http.get<EventOdds[]>(
      `/sports/${sportKey}/odds`,
      {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions,
          markets: markets.join(","),
          oddsFormat: "decimal",
        },
      }
    );
    return data;
  }

  /**
   * Fetch odds for a single event by its Odds API event ID.
   */
  async getEventOdds(
    sportKey: SportKey,
    eventId: string,
    markets: Market[] = [MARKETS.H2H, MARKETS.TOTALS, MARKETS.BTTS]
  ): Promise<EventOdds | null> {
    const { data } = await this.http.get<EventOdds[]>(
      `/sports/${sportKey}/odds`,
      {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: "uk,eu",
          markets: markets.join(","),
          oddsFormat: "decimal",
          eventIds: eventId,
        },
      }
    );
    return data[0] ?? null;
  }

  // ─── Live odds ────────────────────────────────────────────────────────────

  /** Fetch live in-play odds for all events in a sport. */
  async getLiveOdds(
    sportKey: SportKey,
    markets: Market[] = [MARKETS.H2H]
  ): Promise<EventOdds[]> {
    const { data } = await this.http.get<EventOdds[]>(
      `/sports/${sportKey}/odds-live`,
      {
        params: {
          apiKey: process.env.ODDS_API_KEY,
          regions: "uk,eu",
          markets: markets.join(","),
          oddsFormat: "decimal",
        },
      }
    );
    return data;
  }

  // ─── Normalisation ────────────────────────────────────────────────────────

  /**
   * Normalise raw EventOdds into flat NormalisedOdds records, one per
   * bookmaker per market. These map directly to the Odds database model.
   */
  normaliseOdds(event: EventOdds): NormalisedOdds[] {
    const records: NormalisedOdds[] = [];

    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        if (market.key === MARKETS.H2H) {
          const home = market.outcomes.find(
            (o) => o.name === event.home_team
          )?.price;
          const draw = market.outcomes.find((o) => o.name === "Draw")?.price;
          const away = market.outcomes.find(
            (o) => o.name === event.away_team
          )?.price;

          records.push({
            bookmaker: bookmaker.key,
            market: "1X2",
            homeWin: home,
            draw,
            awayWin: away,
          });
        }

        if (market.key === MARKETS.TOTALS) {
          // The Odds API may return multiple lines (1.5, 2.5, 3.5…)
          // We extract 2.5 as our primary O/U line.
          const overOutcome = market.outcomes.find(
            (o) => o.name === "Over" && o.point === 2.5
          );
          const underOutcome = market.outcomes.find(
            (o) => o.name === "Under" && o.point === 2.5
          );

          if (overOutcome || underOutcome) {
            records.push({
              bookmaker: bookmaker.key,
              market: "OU25",
              overLine: overOutcome?.point ?? underOutcome?.point,
              overOdds: overOutcome?.price,
              underOdds: underOutcome?.price,
            });
          }
        }

        if (market.key === MARKETS.BTTS) {
          const yes = market.outcomes.find((o) => o.name === "Yes")?.price;
          const no = market.outcomes.find((o) => o.name === "No")?.price;

          records.push({
            bookmaker: bookmaker.key,
            market: "BTTS",
            bttsYes: yes,
            bttsNo: no,
          });
        }
      }
    }

    return records;
  }

  /**
   * Find the best (highest) odds for a given outcome across all bookmakers.
   */
  getBestOdds(
    event: EventOdds,
    market: "1X2" | "OU25" | "BTTS",
    selection: "homeWin" | "draw" | "awayWin" | "overOdds" | "underOdds" | "bttsYes" | "bttsNo"
  ): { odds: number; bookmaker: string } | null {
    const normalised = this.normaliseOdds(event);
    const relevant = normalised.filter((r) => r.market === market);

    let best: { odds: number; bookmaker: string } | null = null;

    for (const r of relevant) {
      const odds = r[selection] as number | undefined;
      if (odds && (!best || odds > best.odds)) {
        best = { odds, bookmaker: r.bookmaker };
      }
    }

    return best;
  }
}

// Export a singleton instance
export const oddsApi = new OddsApiClient();
