/**
 * Run-predictions job
 *
 * 1. Fetches finished matches → trains the ML model via /train
 * 2. For every SCHEDULED match in the next 7 days with odds,
 *    calls /predict/ml and stores the returned tips.
 *
 * Schedule: every 6 hours  →  "0 *\/6 * * *"
 */

import { TipResult } from "@prisma/client";

import { CURRENT_SEASON } from "@/lib/constants";
import { CacheKeys, CacheTTL } from "@/lib/cache-keys";
import { prisma } from "@/lib/prisma";
import { getCache, setCache } from "@/lib/redis";
import {
  predictionEngine,
  type OddsInput,
  type MLPredictRequest,
  type MLPredictResponse,
  type TrainingMatch,
  type TeamStatsInput,
  type H2HInput,
} from "@/services/prediction-engine";

// ── DB → engine type mappers ───────────────────────────────────────────────────

function toTeamStatsInput(
  teamId: number,
  eloRating: number,
  stats: {
    matchesPlayed: number;
    goalsFor: number;
    goalsAgainst: number;
    wins: number;
    draws: number;
    losses: number;
    homeWins: number;
    homeDraws: number;
    homeLosses: number;
    homeGoalsFor: number;
    homeGoalsAgainst: number;
    awayWins: number;
    awayDraws: number;
    awayLosses: number;
    awayGoalsFor: number;
    awayGoalsAgainst: number;
    cleanSheets: number;
    form: string | null;
    bttsRate: number | null;
    over25Rate: number | null;
  } | null
): TeamStatsInput {
  if (!stats) {
    return {
      team_id:            teamId,
      matches_played:     1,
      goals_for:          1,
      goals_against:      1,
      wins:               0,
      draws:              0,
      losses:             0,
      home_wins:          0,
      home_draws:         0,
      home_losses:        0,
      home_goals_for:     0,
      home_goals_against: 0,
      away_wins:          0,
      away_draws:         0,
      away_losses:        0,
      away_goals_for:     0,
      away_goals_against: 0,
      elo_rating:         eloRating,
      form:               "",
      clean_sheets:       0,
      btts_rate:          0.5,
      over25_rate:        0.5,
    };
  }
  return {
    team_id:            teamId,
    matches_played:     Math.max(stats.matchesPlayed, 1),
    goals_for:          stats.goalsFor,
    goals_against:      stats.goalsAgainst,
    wins:               stats.wins,
    draws:              stats.draws,
    losses:             stats.losses,
    home_wins:          stats.homeWins,
    home_draws:         stats.homeDraws,
    home_losses:        stats.homeLosses,
    home_goals_for:     stats.homeGoalsFor,
    home_goals_against: stats.homeGoalsAgainst,
    away_wins:          stats.awayWins,
    away_draws:         stats.awayDraws,
    away_losses:        stats.awayLosses,
    away_goals_for:     stats.awayGoalsFor,
    away_goals_against: stats.awayGoalsAgainst,
    elo_rating:         eloRating,
    form:               stats.form ?? "",
    clean_sheets:       stats.cleanSheets,
    btts_rate:          stats.bttsRate  ?? 0.5,
    over25_rate:        stats.over25Rate ?? 0.5,
  };
}

function toOddsInput(o: {
  bookmaker: string; market: string;
  homeWin: number | null; draw: number | null; awayWin: number | null;
  overLine: number | null; overOdds: number | null; underOdds: number | null;
  bttsYes: number | null; bttsNo: number | null;
}): OddsInput {
  const entry: OddsInput = { bookmaker: o.bookmaker, market: o.market };
  if (o.homeWin   != null) entry.homeWin   = o.homeWin;
  if (o.draw      != null) entry.draw      = o.draw;
  if (o.awayWin   != null) entry.awayWin   = o.awayWin;
  if (o.overLine  != null) entry.overLine  = o.overLine;
  if (o.overOdds  != null) entry.overOdds  = o.overOdds;
  if (o.underOdds != null) entry.underOdds = o.underOdds;
  if (o.bttsYes   != null) entry.bttsYes   = o.bttsYes;
  if (o.bttsNo    != null) entry.bttsNo    = o.bttsNo;
  return entry;
}

// ── Training data builder ──────────────────────────────────────────────────────

async function buildTrainingData(): Promise<TrainingMatch[]> {
  const finished = await prisma.match.findMany({
    where: {
      status:    "FINISHED",
      homeGoals: { not: null },
      awayGoals: { not: null },
    },
    include: {
      homeTeam: { include: { stats: { where: { season: CURRENT_SEASON } } } },
      awayTeam: { include: { stats: { where: { season: CURRENT_SEASON } } } },
    },
  });

  const trainingMatches: TrainingMatch[] = [];

  for (const m of finished) {
    const hg = m.homeGoals!;
    const ag = m.awayGoals!;
    const result: "H" | "D" | "A" = hg > ag ? "H" : hg < ag ? "A" : "D";

    const homeStats = m.homeTeam.stats[0] ?? null;
    const awayStats = m.awayTeam.stats[0] ?? null;

    trainingMatches.push({
      home_stats: toTeamStatsInput(m.homeTeam.id, m.homeTeam.eloRating, homeStats),
      away_stats: toTeamStatsInput(m.awayTeam.id, m.awayTeam.eloRating, awayStats),
      result,
      home_goals: hg,
      away_goals: ag,
      h2h:        await getH2H(m.homeTeam.id, m.awayTeam.id, m.id),
    });
  }

  return trainingMatches;
}

// ── H2H helper ────────────────────────────────────────────────────────────────

async function getH2H(
  homeTeamId: number,
  awayTeamId: number,
  excludeMatchId: number
): Promise<H2HInput | null> {
  const past = await prisma.match.findMany({
    where: {
      id:        { not: excludeMatchId },
      status:    "FINISHED",
      homeGoals: { not: null },
      awayGoals: { not: null },
      OR: [
        { homeTeamId, awayTeamId },
        { homeTeamId: awayTeamId, awayTeamId: homeTeamId },
      ],
    },
    orderBy: { matchDate: "desc" },
    take: 5,
  });

  if (past.length < 3) return null;

  let homeWins = 0, awayWins = 0, draws = 0, totalGoals = 0;

  for (const m of past) {
    const hg = m.homeGoals!;
    const ag = m.awayGoals!;
    totalGoals += hg + ag;
    const isReversed = m.homeTeamId === awayTeamId;
    if (hg > ag) isReversed ? awayWins++ : homeWins++;
    else if (hg < ag) isReversed ? homeWins++ : awayWins++;
    else draws++;
  }

  return {
    home_wins:     homeWins,
    away_wins:     awayWins,
    draws,
    total_matches: past.length,
    avg_goals:     totalGoals / past.length,
  };
}

// ── Tip storage ────────────────────────────────────────────────────────────────

const MIN_CONFIDENCE = 65;

async function storeTips(matchId: number, response: MLPredictResponse): Promise<number> {
  let stored = 0;
  for (const tip of response.tips) {
    if (tip.confidence < MIN_CONFIDENCE) continue;
    await prisma.tip.create({
      data: {
        matchId,
        tipType:               tip.tip_type,
        prediction:            tip.prediction,
        confidence:            tip.confidence,
        calculatedProbability: tip.calculated_probability,
        impliedProbability:    tip.implied_probability,
        valueRating:           tip.value_rating,
        bestOdds:              tip.best_odds,
        bestBookmaker:         tip.best_bookmaker ?? "",
        suggestedStake:        tip.suggested_stake,
        reasoning:             tip.reasoning,
        modelBreakdown:        tip.model_breakdown as object,
        result:                TipResult.PENDING,
      },
    });
    stored++;
  }
  return stored;
}

// ── Job ────────────────────────────────────────────────────────────────────────

export interface PredictionsJobResult {
  matchesConsidered: number;
  matchesPredicted: number;
  tipsStored: number;
  errors: number;
}

export async function runPredictionsJob(): Promise<PredictionsJobResult> {
  const now    = new Date();
  const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // ── Step 1: Train ML model on finished matches ────────────────────────────
  const trainingData = await buildTrainingData();
  const trainResult  = await predictionEngine.trainML(trainingData);
  console.log(`[run-predictions] ML training: ${JSON.stringify(trainResult)}`);

  // ── Step 2: Fetch upcoming matches with odds ──────────────────────────────
  const matches = await prisma.match.findMany({
    where: {
      status:    "SCHEDULED",
      matchDate: { gte: now, lte: cutoff },
      odds:      { some: {} },
    },
    include: {
      league:   true,
      homeTeam: { include: { stats: { where: { season: CURRENT_SEASON } } } },
      awayTeam: { include: { stats: { where: { season: CURRENT_SEASON } } } },
      odds:     true,
      tips:     { where: { result: TipResult.PENDING } },
    },
  });

  let matchesPredicted = 0;
  let tipsStored       = 0;
  let errors           = 0;

  for (const match of matches) {

    // Always refresh pending tips with latest model output
    if (match.tips.length > 0) {
      await prisma.tip.deleteMany({
        where: { matchId: match.id, result: TipResult.PENDING },
      });
    }

    const cacheKey = CacheKeys.prediction(match.id);
    const cached   = await getCache<MLPredictResponse>(cacheKey);

    let prediction: MLPredictResponse;

    if (cached) {
      prediction = cached;
    } else {
      const homeStats = match.homeTeam.stats[0] ?? null;
      const awayStats = match.awayTeam.stats[0] ?? null;
      const h2h       = await getH2H(match.homeTeam.id, match.awayTeam.id, match.id);

      const payload: MLPredictRequest = {
        match_id:         match.id,
        home_team_name:   match.homeTeam.name,
        away_team_name:   match.awayTeam.name,
        home_team_stats:  toTeamStatsInput(match.homeTeam.id, match.homeTeam.eloRating, homeStats),
        away_team_stats:  toTeamStatsInput(match.awayTeam.id, match.awayTeam.eloRating, awayStats),
        league_slug:      match.league.slug,
        league_avg_goals: match.league.avgGoalsPerGame ?? 2.7,
        home_form:        homeStats?.form ?? "",
        away_form:        awayStats?.form ?? "",
        odds_data:        match.odds.map(toOddsInput),
        h2h,
      };

      try {
        prediction = await predictionEngine.predictML(payload);
        await setCache(cacheKey, prediction, CacheTTL.prediction);
      } catch (err) {
        console.error(
          `[run-predictions] Failed for ${match.homeTeam.name} vs ${match.awayTeam.name}:`, err
        );
        errors++;
        continue;
      }
    }

    try {
      const stored = await storeTips(match.id, prediction);
      tipsStored  += stored;
      matchesPredicted++;
    } catch (err) {
      console.error(`[run-predictions] Failed storing tips for match ${match.id}:`, err);
      errors++;
    }
  }

  const result: PredictionsJobResult = {
    matchesConsidered: matches.length,
    matchesPredicted,
    tipsStored,
    errors,
  };

  console.log(
    `[run-predictions] considered=${matches.length} predicted=${matchesPredicted} ` +
      `tips=${tipsStored} errors=${errors}`
  );

  return result;
}
