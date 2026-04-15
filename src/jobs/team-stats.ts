/**
 * Step 15 – Team stats fetching job
 *
 * Derives season statistics for every team from the league standings
 * endpoint (football-data.org). One API call per league instead of
 * one per team — far friendlier on the free-tier rate limit.
 *
 * Schedule: daily at 4 AM  →  "0 4 * * *"
 */

import { CURRENT_SEASON, TARGET_LEAGUES, API_FOOTBALL_DELAY_MS, sleep } from "@/lib/constants";
import { CacheKeys, CacheTTL } from "@/lib/cache-keys";
import { prisma } from "@/lib/prisma";
import { getCache, setCache } from "@/lib/redis";
import { footballData, type FDStandingRow } from "@/services/football-data";

// ── Mapper ─────────────────────────────────────────────────────────────────────

function mapStandingRow(row: FDStandingRow, teamId: number) {
  return {
    teamId,
    season: CURRENT_SEASON,
    matchesPlayed: row.playedGames,
    wins: row.won,
    draws: row.draw,
    losses: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    cleanSheets: 0,
    homeWins: 0,
    homeDraws: 0,
    homeLosses: 0,
    homeGoalsFor: 0,
    homeGoalsAgainst: 0,
    awayWins: 0,
    awayDraws: 0,
    awayLosses: 0,
    awayGoalsFor: 0,
    awayGoalsAgainst: 0,
    form: row.form ?? null,
  };
}

function mapHomeAwayRow(
  total: FDStandingRow,
  home: FDStandingRow | undefined,
  away: FDStandingRow | undefined,
  teamId: number
) {
  const base = mapStandingRow(total, teamId);
  if (home) {
    base.homeWins = home.won;
    base.homeDraws = home.draw;
    base.homeLosses = home.lost;
    base.homeGoalsFor = home.goalsFor;
    base.homeGoalsAgainst = home.goalsAgainst;
  }
  if (away) {
    base.awayWins = away.won;
    base.awayDraws = away.draw;
    base.awayLosses = away.lost;
    base.awayGoalsFor = away.goalsFor;
    base.awayGoalsAgainst = away.goalsAgainst;
  }
  return base;
}

// ── Job ────────────────────────────────────────────────────────────────────────

export interface TeamStatsJobResult {
  league: string;
  teams: number;
  upserted: number;
  skipped: number;
}

export async function fetchTeamStatsJob(): Promise<TeamStatsJobResult[]> {
  const results: TeamStatsJobResult[] = [];

  for (const league of TARGET_LEAGUES) {
    console.log(`[team-stats] ${league.name}: fetching standings…`);

    const cacheKey = CacheKeys.teamStats(league.id, CURRENT_SEASON);
    const cached = await getCache<TeamStatsJobResult>(cacheKey);
    if (cached) {
      console.log(`[team-stats] ${league.name}: cache hit – skipping`);
      results.push(cached);
      continue;
    }

    let upserted = 0;
    let skipped = 0;

    try {
      const standings = await footballData.getStandings(league.code);

      const homeMap = new Map(standings.home.map((r) => [r.team.id, r]));
      const awayMap = new Map(standings.away.map((r) => [r.team.id, r]));

      for (const row of standings.total) {
        const team = await prisma.team.findUnique({
          where: { apiFootballId: row.team.id },
        });

        if (!team) {
          console.warn(`[team-stats] Team ${row.team.name} (${row.team.id}) not in DB – skipping`);
          skipped++;
          continue;
        }

        const data = mapHomeAwayRow(row, homeMap.get(row.team.id), awayMap.get(row.team.id), team.id);

        await prisma.teamStats.upsert({
          where: { teamId_season: { teamId: team.id, season: CURRENT_SEASON } },
          update: data,
          create: data,
        });

        upserted++;
      }

      const summary: TeamStatsJobResult = {
        league: league.name,
        teams: standings.total.length,
        upserted,
        skipped,
      };

      await setCache(cacheKey, summary, CacheTTL.teamStats);
      results.push(summary);

      console.log(
        `[team-stats] ${league.name}: teams=${standings.total.length} upserted=${upserted} skipped=${skipped}`
      );
    } catch (err) {
      console.error(`[team-stats] ${league.name}: error –`, err);
      results.push({ league: league.name, teams: 0, upserted, skipped });
    }

    await sleep(API_FOOTBALL_DELAY_MS);
  }

  return results;
}
