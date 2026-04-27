/**
 * Step 16 – Odds fetching job
 *
 * Fetches pre-match odds from The Odds API for all five leagues, matches
 * each event to a Match record in the DB (by team names + date), and
 * upserts the normalised odds into the Odds table.
 *
 * Schedule: every 30 minutes  →  "*\/30 * * * *"
 */

import { TARGET_LEAGUES, API_FOOTBALL_LEAGUE_IDS, CURRENT_SEASON, API_FOOTBALL_DELAY_MS, sleep } from "@/lib/constants";
import { CacheKeys, CacheTTL } from "@/lib/cache-keys";
import { prisma } from "@/lib/prisma";
import { getCache, setCache } from "@/lib/redis";
import {
  MARKETS,
  oddsApi,
  type EventOdds,
  type NormalisedOdds,
} from "@/services/odds-api";
import { apiFootball } from "@/services/api-football";

// ── Team-name matching ─────────────────────────────────────────────────────────

/**
 * Return true if `oddsName` and `dbName` refer to the same club.
 *
 * Strategy (case-insensitive):
 * 1. Exact match
 * 2. One contains the other
 * 3. First word of each name matches (e.g. "Manchester" in "Manchester City" vs "Manchester City FC")
 */
function teamsMatch(oddsName: string, dbName: string): boolean {
  const a = oddsName.trim().toLowerCase();
  const b = dbName.trim().toLowerCase();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aFirst = a.split(/\s+/)[0];
  const bFirst = b.split(/\s+/)[0];
  return aFirst.length > 2 && aFirst === bFirst;
}

/**
 * Find the DB match ID for a given Odds API event.
 * Matches by: same calendar day + home/away team names.
 */
async function resolveMatchId(
  event: EventOdds,
  leagueApiFootballId: number
): Promise<number | null> {
  const commenceDate = new Date(event.commence_time);
  const dayStart = new Date(commenceDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(commenceDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const candidates = await prisma.match.findMany({
    where: {
      league: { apiFootballId: leagueApiFootballId },
      matchDate: { gte: dayStart, lte: dayEnd },
    },
    include: { homeTeam: true, awayTeam: true },
  });

  for (const match of candidates) {
    if (
      teamsMatch(event.home_team, match.homeTeam.name) &&
      teamsMatch(event.away_team, match.awayTeam.name)
    ) {
      return match.id;
    }
  }

  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNextDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

async function resolveMatchIdByName(
  homeTeam: string,
  awayTeam: string,
  leagueApiFootballId: number,
  date: string
): Promise<number | null> {
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd   = new Date(`${date}T23:59:59Z`);
  const candidates = await prisma.match.findMany({
    where: { league: { apiFootballId: leagueApiFootballId }, matchDate: { gte: dayStart, lte: dayEnd } },
    include: { homeTeam: true, awayTeam: true },
  });
  for (const m of candidates) {
    if (teamsMatch(homeTeam, m.homeTeam.name) && teamsMatch(awayTeam, m.awayTeam.name)) {
      return m.id;
    }
  }
  return null;
}

// ── Job ────────────────────────────────────────────────────────────────────────

export interface OddsJobResult {
  league: string;
  events: number;
  matched: number;
  oddsUpserted: number;
}

/**
 * Run the odds fetch job for all target leagues.
 */
export async function fetchOddsJob(): Promise<OddsJobResult[]> {
  const results: OddsJobResult[] = [];

  for (const league of TARGET_LEAGUES) {
    const cacheKey = CacheKeys.odds(league.sportKey);

    // Serve raw events from cache within the 30-min window
    let events: EventOdds[] | null = await getCache<EventOdds[]>(cacheKey);

    if (!events) {
      console.log(`[odds] ${league.name}: fetching from The Odds API…`);
      try {
        // Fetch h2h + totals first; add btts in a second request (not all plans support it)
        events = await oddsApi.getOdds(league.sportKey, [MARKETS.H2H, MARKETS.TOTALS]);

        try {
          const bttsEvents = await oddsApi.getOdds(league.sportKey, [MARKETS.BTTS]);
          // Merge BTTS bookmakers into the existing events by event id
          const bttsMap = new Map(bttsEvents.map((e) => [e.id, e]));
          events = events.map((e) => {
            const btts = bttsMap.get(e.id);
            if (!btts) return e;
            return { ...e, bookmakers: [...e.bookmakers, ...btts.bookmakers] };
          });
        } catch {
          console.warn(`[odds] ${league.name}: BTTS market unavailable, skipping`);
        }

        await setCache(cacheKey, events, CacheTTL.odds);
      } catch (err) {
        console.error(`[odds] ${league.name}: fetch error –`, err);
        results.push({ league: league.name, events: 0, matched: 0, oddsUpserted: 0 });
        continue;
      }

      // ── Fallback: API-Football odds when The Odds API returns nothing ────
      if (events.length === 0) {
        console.log(`[odds] ${league.name}: no events from The Odds API, trying API-Football fallback…`);
        const afLeagueId = API_FOOTBALL_LEAGUE_IDS[league.slug];
        if (afLeagueId) {
          try {
            const dates = getNextDays(7);
            let afMatched = 0;
            let afUpserted = 0;
            for (const date of dates) {
              const afOdds = await apiFootball.getOddsForLeague(afLeagueId, CURRENT_SEASON, date);
              for (const o of afOdds) {
                const matchId = await resolveMatchIdByName(o.homeTeam, o.awayTeam, league.id, date);
                if (!matchId) continue;
                afMatched++;
                await prisma.odds.upsert({
                  where: { id: (await prisma.odds.findFirst({ where: { matchId, bookmaker: o.bookmaker, market: "h2h" }, select: { id: true } }))?.id ?? 0 },
                  update: { homeWin: o.homeWin, draw: o.draw, awayWin: o.awayWin, overOdds: o.overOdds, underOdds: o.underOdds, fetchedAt: new Date() },
                  create: { matchId, bookmaker: o.bookmaker, market: "h2h", homeWin: o.homeWin, draw: o.draw, awayWin: o.awayWin, overOdds: o.overOdds, underOdds: o.underOdds },
                });
                afUpserted++;
              }
              await sleep(1200);
            }
            results.push({ league: league.name, events: afMatched, matched: afMatched, oddsUpserted: afUpserted });
            console.log(`[odds] ${league.name}: API-Football fallback matched=${afMatched} upserted=${afUpserted}`);
          } catch (err) {
            console.error(`[odds] ${league.name}: API-Football fallback error –`, err);
            results.push({ league: league.name, events: 0, matched: 0, oddsUpserted: 0 });
          }
          await sleep(API_FOOTBALL_DELAY_MS);
          continue;
        }
      }
    } else {
      console.log(`[odds] ${league.name}: using cached events (${events.length})`);
    }

    let matched = 0;
    let oddsUpserted = 0;

    for (const event of events) {
      const matchId = await resolveMatchId(event, league.id);

      if (!matchId) {
        console.warn(
          `[odds] ${league.name}: no DB match for "${event.home_team}" vs "${event.away_team}" ` +
            `on ${event.commence_time}`
        );
        continue;
      }

      matched++;

      const normalisedList: NormalisedOdds[] = oddsApi.normaliseOdds(event);

      for (const norm of normalisedList) {
        // Skip records with no meaningful odds values
        const hasData =
          norm.homeWin ||
          norm.overOdds ||
          norm.underOdds ||
          norm.bttsYes ||
          norm.bttsNo;
        if (!hasData) continue;

        await prisma.odds.upsert({
          where: {
            // Composite uniqueness: (matchId, bookmaker, market)
            // The schema doesn't define this composite unique, so we use
            // findFirst + create/update pattern instead.
            id: (
              await prisma.odds.findFirst({
                where: {
                  matchId,
                  bookmaker: norm.bookmaker,
                  market: norm.market,
                },
                select: { id: true },
              })
            )?.id ?? 0, // 0 triggers the create branch
          },
          update: {
            homeWin:   norm.homeWin  ?? null,
            draw:      norm.draw     ?? null,
            awayWin:   norm.awayWin  ?? null,
            overLine:  norm.overLine ?? null,
            overOdds:  norm.overOdds ?? null,
            underOdds: norm.underOdds ?? null,
            bttsYes:   norm.bttsYes  ?? null,
            bttsNo:    norm.bttsNo   ?? null,
            fetchedAt: new Date(),
          },
          create: {
            matchId,
            bookmaker: norm.bookmaker,
            market:    norm.market,
            homeWin:   norm.homeWin  ?? null,
            draw:      norm.draw     ?? null,
            awayWin:   norm.awayWin  ?? null,
            overLine:  norm.overLine ?? null,
            overOdds:  norm.overOdds ?? null,
            underOdds: norm.underOdds ?? null,
            bttsYes:   norm.bttsYes  ?? null,
            bttsNo:    norm.bttsNo   ?? null,
          },
        });

        oddsUpserted++;
      }

      // Small pause to avoid hammering Prisma with rapid writes
      await sleep(50);
    }

    const summary: OddsJobResult = {
      league: league.name,
      events: events.length,
      matched,
      oddsUpserted,
    };
    results.push(summary);

    console.log(
      `[odds] ${league.name}: events=${events.length} matched=${matched} oddsUpserted=${oddsUpserted}`
    );
  }

  return results;
}
