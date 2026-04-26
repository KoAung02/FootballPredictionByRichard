/**
 * Step 14 – Fixture fetching job
 *
 * Fetches upcoming fixtures (next 14 days) for each target league from
 * football-data.org and upserts them into the Match table.
 *
 * Schedule: every 6 hours  →  "0 *\/6 * * *"
 */

import { MatchStatus } from "@prisma/client";
import { CacheKeys, CacheTTL } from "@/lib/cache-keys";
import { API_FOOTBALL_DELAY_MS, TARGET_LEAGUES, sleep } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getCache, setCache } from "@/lib/redis";
import { footballData } from "@/services/football-data";

// ── Status mapping ─────────────────────────────────────────────────────────────

function toMatchStatus(status: string): MatchStatus {
  switch (status) {
    case "IN_PLAY":
    case "PAUSED":
    case "EXTRA_TIME":
    case "PENALTY_SHOOTOUT":
    case "SUSPENDED":
      return MatchStatus.LIVE;
    case "FINISHED":
    case "AWARDED":
      return MatchStatus.FINISHED;
    case "POSTPONED":
      return MatchStatus.POSTPONED;
    case "CANCELLED":
      return MatchStatus.CANCELLED;
    default:
      return MatchStatus.SCHEDULED;
  }
}

// ── La Liga top-team filter ────────────────────────────────────────────────────
// Only store La Liga fixtures involving at least one of these clubs.
const LA_LIGA_TOP_TEAMS = new Set([
  "Real Madrid CF",
  "FC Barcelona",
  "Club Atlético de Madrid",
  "Villarreal CF",
]);

const SERIE_A_TOP_TEAMS = new Set([
  "FC Internazionale Milano",
  "SSC Napoli",
  "AC Milan",
  "Juventus FC",
  "AS Roma",
]);

// ── Job ────────────────────────────────────────────────────────────────────────

export interface FixtureJobResult {
  league: string;
  fetched: number;
  upserted: number;
  skipped: number;
}

export async function fetchFixturesJob(): Promise<FixtureJobResult[]> {
  const results: FixtureJobResult[] = [];

  const now = new Date();
  const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const dateFrom = past7d.toISOString().slice(0, 10);
  const dateTo = cutoff.toISOString().slice(0, 10);

  for (const league of TARGET_LEAGUES) {
    const cacheKey = CacheKeys.fixtures(league.id);

    const cached = await getCache<FixtureJobResult>(cacheKey);
    if (cached) {
      console.log(`[fixtures] ${league.name}: cache hit – skipping API call`);
      results.push(cached);
      continue;
    }

    console.log(`[fixtures] ${league.name}: fetching upcoming fixtures…`);
    let fetched = 0;
    let upserted = 0;
    let skipped = 0;

    try {
      const fixtures = await footballData.getMatches(league.code, { dateFrom, dateTo });
      fetched = fixtures.length;

      const leagueRecord = await prisma.league.findUnique({
        where: { apiFootballId: league.id },
      });

      if (!leagueRecord) {
        console.warn(`[fixtures] League ${league.name} not found in DB – skipping`);
        results.push({ league: league.name, fetched, upserted, skipped: fetched });
        await sleep(API_FOOTBALL_DELAY_MS);
        continue;
      }

      for (const f of fixtures) {
        if (!f.homeTeam.id || !f.awayTeam.id) {
          console.warn(
            `[fixtures] Skipping match ${f.id}: TBD team (home:${f.homeTeam.id}, away:${f.awayTeam.id})`
          );
          skipped++;
          continue;
        }

        const [homeTeam, awayTeam] = await Promise.all([
          prisma.team.findUnique({ where: { apiFootballId: f.homeTeam.id } }),
          prisma.team.findUnique({ where: { apiFootballId: f.awayTeam.id } }),
        ]);

        if (!homeTeam || !awayTeam) {
          console.warn(
            `[fixtures] Skipping match ${f.id}: team not found ` +
              `(home:${f.homeTeam.id} "${f.homeTeam.name}", away:${f.awayTeam.id} "${f.awayTeam.name}")`
          );
          skipped++;
          continue;
        }

        if (league.code === "PD" && !LA_LIGA_TOP_TEAMS.has(homeTeam.name) && !LA_LIGA_TOP_TEAMS.has(awayTeam.name)) {
          skipped++;
          continue;
        }

        if (league.code === "SA" && !SERIE_A_TOP_TEAMS.has(homeTeam.name) && !SERIE_A_TOP_TEAMS.has(awayTeam.name)) {
          skipped++;
          continue;
        }

        await prisma.match.upsert({
          where: { apiFootballId: f.id },
          update: {
            matchDate: new Date(f.utcDate),
            status: toMatchStatus(f.status),
            homeGoals: f.score.fullTime.home ?? null,
            awayGoals: f.score.fullTime.away ?? null,
            round: f.matchday ? `Matchday ${f.matchday}` : null,
          },
          create: {
            leagueId: leagueRecord.id,
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            matchDate: new Date(f.utcDate),
            status: toMatchStatus(f.status),
            homeGoals: f.score.fullTime.home ?? null,
            awayGoals: f.score.fullTime.away ?? null,
            round: f.matchday ? `Matchday ${f.matchday}` : null,
            apiFootballId: f.id,
          },
        });

        upserted++;
      }

      const summary: FixtureJobResult = { league: league.name, fetched, upserted, skipped };
      await setCache(cacheKey, summary, CacheTTL.fixtures);
      results.push(summary);

      console.log(
        `[fixtures] ${league.name}: fetched=${fetched} upserted=${upserted} skipped=${skipped}`
      );
    } catch (err) {
      console.error(`[fixtures] ${league.name}: error –`, err);
      results.push({ league: league.name, fetched, upserted, skipped });
    }

    await sleep(API_FOOTBALL_DELAY_MS);
  }

  return results;
}
