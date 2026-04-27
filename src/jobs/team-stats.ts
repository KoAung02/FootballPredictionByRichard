/**
 * Step 15 – Team stats job
 *
 * Combines two sources:
 *  1. BBC Sport scraper (via prediction engine) — overall W/D/L, goals, form
 *  2. Our own Match table — home/away splits, BTTS rate, over 2.5 rate
 *
 * Schedule: daily at 4 AM  →  "0 4 * * *"
 */

import { CURRENT_SEASON, TARGET_LEAGUES, sleep } from "@/lib/constants";
import { CacheKeys, CacheTTL } from "@/lib/cache-keys";
import { prisma } from "@/lib/prisma";
import { getCache, setCache } from "@/lib/redis";

const PREDICTION_ENGINE_URL = process.env.PREDICTION_ENGINE_URL ?? "http://localhost:8000";

const NAME_OVERRIDES: Record<string, string> = {
  "atletico madrid":  "club atletico de madrid",
  "celta vigo":       "rc celta de vigo",
  "inter milan":      "fc internazionale milano",
  "ac milan":         "ac milan",
  "napoli":           "ssc napoli",
  "juventus":         "juventus fc",
  "roma":             "as roma",
  "bayer leverkusen": "bayer 04 leverkusen",
  "bayern munich":    "FC Bayern München",
};

function normalize(name: string): string {
  return name.toLowerCase()
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ä/g, "a")
    .replace(/é/g, "e").replace(/è/g, "e").replace(/ñ/g, "n")
    .replace(/[^a-z0-9 ]/g, "").trim();
}

function nameMatch(bbcName: string, dbName: string): boolean {
  const raw = NAME_OVERRIDES[bbcName.toLowerCase()] ?? bbcName;
  const a = normalize(raw);
  const b = normalize(dbName);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return a.split(" ")[0] === b.split(" ")[0] && a.split(" ")[0].length > 2;
}

export interface TeamStatsJobResult {
  league: string;
  teams: number;
  upserted: number;
  skipped: number;
}

export async function fetchTeamStatsJob(): Promise<TeamStatsJobResult[]> {
  const results: TeamStatsJobResult[] = [];

  for (const league of TARGET_LEAGUES) {
    console.log(`[team-stats] ${league.name}: fetching…`);

    const cacheKey = CacheKeys.teamStats(league.id, CURRENT_SEASON);
    const cached   = await getCache<TeamStatsJobResult>(cacheKey);
    if (cached) {
      console.log(`[team-stats] ${league.name}: cache hit – skipping`);
      results.push(cached);
      continue;
    }

    let upserted = 0;
    let skipped  = 0;

    try {
      const leagueRecord = await prisma.league.findUnique({ where: { apiFootballId: league.id } });
      if (!leagueRecord) continue;

      // ── 1. BBC Sport overall stats (fallback to match history for UCL) ────
      const res  = await fetch(`${PREDICTION_ENGINE_URL}/scrape/team-stats/${league.slug}`);
      if (!res.ok) throw new Error(`BBC scrape failed: ${res.status}`);
      const json = await res.json() as { ok: boolean; data: Record<string, number | string>[]; teams: number };
      const bbcData = json.data;

      // If BBC returns no data (e.g. UCL knockout format), compute from match history
      if (bbcData.length === 0) {
        const leagueTeams = await prisma.team.findMany({ where: { leagueId: leagueRecord.id } });
        const allFinished = await prisma.match.findMany({
          where: { leagueId: leagueRecord.id, status: "FINISHED", homeGoals: { not: null }, awayGoals: { not: null } },
          orderBy: { matchDate: "desc" },
        });
        for (const team of leagueTeams) {
          const hm = allFinished.filter((m) => m.homeTeamId === team.id);
          const am = allFinished.filter((m) => m.awayTeamId === team.id);
          const all = [...hm.map((m) => ({ ...m, isHome: true as const })), ...am.map((m) => ({ ...m, isHome: false as const }))];
          if (all.length === 0) continue;
          let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, hw = 0, hd = 0, hl = 0, hgf = 0, hga = 0, aw = 0, ad = 0, al = 0, agf = 0, aga = 0, btts = 0, over25 = 0;
          for (const m of all) {
            const tgf = m.isHome ? m.homeGoals! : m.awayGoals!;
            const tga = m.isHome ? m.awayGoals! : m.homeGoals!;
            gf += tgf; ga += tga;
            if (tgf > tga) wins++; else if (tgf < tga) losses++; else draws++;
            if (tgf > 0 && tga > 0) btts++;
            if (tgf + tga > 2) over25++;
            if (m.isHome) { hgf += tgf; hga += tga; if (tgf > tga) hw++; else if (tgf < tga) hl++; else hd++; }
            else { agf += tgf; aga += tga; if (tgf > tga) aw++; else if (tgf < tga) al++; else ad++; }
          }
          const mp = all.length;
          const form = all.slice(0, 5).map((m) => { const tgf = m.isHome ? m.homeGoals! : m.awayGoals!; const tga = m.isHome ? m.awayGoals! : m.homeGoals!; return tgf > tga ? "W" : tgf < tga ? "L" : "D"; }).join("");
          const data = { teamId: team.id, season: CURRENT_SEASON, matchesPlayed: mp, wins, draws, losses, goalsFor: gf, goalsAgainst: ga, cleanSheets: 0, homeWins: hw, homeDraws: hd, homeLosses: hl, homeGoalsFor: hgf, homeGoalsAgainst: hga, awayWins: aw, awayDraws: ad, awayLosses: al, awayGoalsFor: agf, awayGoalsAgainst: aga, form, bttsRate: mp > 0 ? btts / mp : null, over25Rate: mp > 0 ? over25 / mp : null };
          await prisma.teamStats.upsert({ where: { teamId_season: { teamId: team.id, season: CURRENT_SEASON } }, update: data, create: data });
          upserted++;
        }
        const summary = { league: league.name, teams: leagueTeams.length, upserted, skipped: 0 };
        await setCache(cacheKey, summary, CacheTTL.teamStats);
        results.push(summary);
        console.log(`[team-stats] ${league.name}: computed from match history upserted=${upserted}`);
        await sleep(500);
        continue;
      }

      // ── 2. Match history for home/away splits ────────────────────────────
      const finishedMatches = await prisma.match.findMany({
        where: {
          leagueId:  leagueRecord.id,
          status:    "FINISHED",
          homeGoals: { not: null },
          awayGoals: { not: null },
        },
        orderBy: { matchDate: "desc" },
      });

      const dbTeams = await prisma.team.findMany({ where: { leagueId: leagueRecord.id } });

      for (const row of bbcData) {
        const bbcName = String(row.team_name);
        const team    = dbTeams.find((t) => nameMatch(bbcName, t.name));

        if (!team) {
          console.warn(`[team-stats] ${league.name}: no DB match for "${bbcName}"`);
          skipped++;
          continue;
        }

        // ── Home/away splits from match history ─────────────────────────
        const homeMatches = finishedMatches.filter((m) => m.homeTeamId === team.id);
        const awayMatches = finishedMatches.filter((m) => m.awayTeamId === team.id);

        let homeWins = 0, homeDraws = 0, homeLosses = 0, homeGF = 0, homeGA = 0;
        let awayWins = 0, awayDraws = 0, awayLosses = 0, awayGF = 0, awayGA = 0;
        let btts = 0, over25 = 0;

        for (const m of homeMatches) {
          homeGF += m.homeGoals!; homeGA += m.awayGoals!;
          if (m.homeGoals! > m.awayGoals!) homeWins++;
          else if (m.homeGoals! < m.awayGoals!) homeLosses++;
          else homeDraws++;
          if (m.homeGoals! > 0 && m.awayGoals! > 0) btts++;
          if (m.homeGoals! + m.awayGoals! > 2) over25++;
        }

        for (const m of awayMatches) {
          awayGF += m.awayGoals!; awayGA += m.homeGoals!;
          if (m.awayGoals! > m.homeGoals!) awayWins++;
          else if (m.awayGoals! < m.homeGoals!) awayLosses++;
          else awayDraws++;
          if (m.homeGoals! > 0 && m.awayGoals! > 0) btts++;
          if (m.homeGoals! + m.awayGoals! > 2) over25++;
        }

        const totalMatches = homeMatches.length + awayMatches.length;

        const data = {
          teamId:           team.id,
          season:           CURRENT_SEASON,
          matchesPlayed:    Number(row.matches_played) || totalMatches,
          wins:             Number(row.wins)           || 0,
          draws:            Number(row.draws)          || 0,
          losses:           Number(row.losses)         || 0,
          goalsFor:         Number(row.goals_for)      || 0,
          goalsAgainst:     Number(row.goals_against)  || 0,
          cleanSheets:      0,
          homeWins,
          homeDraws,
          homeLosses,
          homeGoalsFor:     homeGF,
          homeGoalsAgainst: homeGA,
          awayWins,
          awayDraws,
          awayLosses,
          awayGoalsFor:     awayGF,
          awayGoalsAgainst: awayGA,
          form:             String(row.form || ""),
          bttsRate:   totalMatches > 0 ? btts   / totalMatches : null,
          over25Rate: totalMatches > 0 ? over25 / totalMatches : null,
        };

        await prisma.teamStats.upsert({
          where:  { teamId_season: { teamId: team.id, season: CURRENT_SEASON } },
          update: data,
          create: data,
        });

        upserted++;
      }

      const summary: TeamStatsJobResult = {
        league:  league.name,
        teams:   bbcData.length,
        upserted,
        skipped,
      };

      await setCache(cacheKey, summary, CacheTTL.teamStats);
      results.push(summary);
      console.log(`[team-stats] ${league.name}: upserted=${upserted} skipped=${skipped}`);

    } catch (err) {
      console.error(`[team-stats] ${league.name}: error –`, err);
      results.push({ league: league.name, teams: 0, upserted, skipped });
    }

    await sleep(2000);
  }

  return results;
}
