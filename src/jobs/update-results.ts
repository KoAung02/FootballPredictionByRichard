/**
 * Update-results job
 *
 * For every PENDING tip whose match is now FINISHED and has score data,
 * determine whether the prediction was WON or LOST and persist that result.
 *
 * Schedule: every hour  →  "0 * * * *"
 */

import { prisma } from "@/lib/prisma";
import { TipResult } from "@prisma/client";

// ── Result logic ──────────────────────────────────────────────────────────────

function evaluateTip(
  tipType: string,
  prediction: string,
  homeGoals: number,
  awayGoals: number
): TipResult {
  switch (tipType) {
    case "1X2": {
      if (prediction === "Home Win") {
        return homeGoals > awayGoals ? TipResult.WON : TipResult.LOST;
      }
      if (prediction === "Draw") {
        return homeGoals === awayGoals ? TipResult.WON : TipResult.LOST;
      }
      if (prediction === "Away Win") {
        return awayGoals > homeGoals ? TipResult.WON : TipResult.LOST;
      }
      break;
    }

    case "OVER_UNDER": {
      // prediction is e.g. "Over 2.5" or "Under 2.5"
      const parts = prediction.split(" ");
      const direction = parts[0]; // "Over" | "Under"
      const line = parseFloat(parts[1] ?? "2.5");
      const total = homeGoals + awayGoals;

      if (direction === "Over") {
        if (total > line) return TipResult.WON;
        if (total < line) return TipResult.LOST;
        return TipResult.VOID; // exact push (rare with .5 lines)
      }
      if (direction === "Under") {
        if (total < line) return TipResult.WON;
        if (total > line) return TipResult.LOST;
        return TipResult.VOID;
      }
      break;
    }

    case "BTTS": {
      const bothScored = homeGoals > 0 && awayGoals > 0;
      if (prediction === "BTTS Yes") {
        return bothScored ? TipResult.WON : TipResult.LOST;
      }
      if (prediction === "BTTS No") {
        return !bothScored ? TipResult.WON : TipResult.LOST;
      }
      break;
    }

    case "DOUBLE_CHANCE": {
      if (prediction === "1X") {
        // Home win or draw
        return homeGoals >= awayGoals ? TipResult.WON : TipResult.LOST;
      }
      if (prediction === "2X") {
        // Away win or draw
        return awayGoals >= homeGoals ? TipResult.WON : TipResult.LOST;
      }
      if (prediction === "12") {
        // Either team wins (no draw)
        return homeGoals !== awayGoals ? TipResult.WON : TipResult.LOST;
      }
      break;
    }
  }

  return TipResult.VOID; // unknown tip type / prediction string
}

// ── Job ────────────────────────────────────────────────────────────────────────

export interface UpdateResultsJobResult {
  evaluated: number;
  won: number;
  lost: number;
  voided: number;
}

export async function updateResultsJob(): Promise<UpdateResultsJobResult> {
  // Find all PENDING tips where the match is FINISHED and scores are known
  const pendingTips = await prisma.tip.findMany({
    where: {
      result: TipResult.PENDING,
      match: {
        status: "FINISHED",
        homeGoals: { not: null },
        awayGoals: { not: null },
      },
    },
    include: {
      match: {
        select: { homeGoals: true, awayGoals: true },
      },
    },
  });

  let won = 0;
  let lost = 0;
  let voided = 0;

  for (const tip of pendingTips) {
    const { homeGoals, awayGoals } = tip.match;
    if (homeGoals === null || awayGoals === null) continue;

    const result = evaluateTip(tip.tipType, tip.prediction, homeGoals, awayGoals);

    await prisma.tip.update({
      where: { id: tip.id },
      data: { result },
    });

    if (result === TipResult.WON) won++;
    else if (result === TipResult.LOST) lost++;
    else voided++;
  }

  console.log(
    `[update-results] evaluated=${pendingTips.length} won=${won} lost=${lost} voided=${voided}`
  );

  return { evaluated: pendingTips.length, won, lost, voided };
}
