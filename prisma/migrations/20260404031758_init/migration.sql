-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TipResult" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID', 'HALF_WON', 'HALF_LOST');

-- CreateTable
CREATE TABLE "League" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "apiFootballId" INTEGER NOT NULL,
    "logo" TEXT,
    "season" INTEGER NOT NULL,
    "avgGoalsPerGame" DOUBLE PRECISION,
    "homeWinRate" DOUBLE PRECISION,
    "drawRate" DOUBLE PRECISION,
    "awayWinRate" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "logo" TEXT,
    "leagueId" INTEGER NOT NULL,
    "apiFootballId" INTEGER NOT NULL,
    "venue" TEXT,
    "eloRating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "matchDate" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "round" TEXT,
    "apiFootballId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamStats" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "avgPossession" DOUBLE PRECISION,
    "avgShotsOnTarget" DOUBLE PRECISION,
    "homeWins" INTEGER NOT NULL DEFAULT 0,
    "homeDraws" INTEGER NOT NULL DEFAULT 0,
    "homeLosses" INTEGER NOT NULL DEFAULT 0,
    "homeGoalsFor" INTEGER NOT NULL DEFAULT 0,
    "homeGoalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "awayWins" INTEGER NOT NULL DEFAULT 0,
    "awayDraws" INTEGER NOT NULL DEFAULT 0,
    "awayLosses" INTEGER NOT NULL DEFAULT 0,
    "awayGoalsFor" INTEGER NOT NULL DEFAULT 0,
    "awayGoalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "form" TEXT,
    "xG" DOUBLE PRECISION,
    "xGA" DOUBLE PRECISION,
    "bttsRate" DOUBLE PRECISION,
    "over25Rate" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeadToHead" (
    "id" SERIAL NOT NULL,
    "team1Id" INTEGER NOT NULL,
    "team2Id" INTEGER NOT NULL,
    "totalMatches" INTEGER NOT NULL,
    "team1Wins" INTEGER NOT NULL,
    "team2Wins" INTEGER NOT NULL,
    "draws" INTEGER NOT NULL,
    "team1Goals" INTEGER NOT NULL,
    "team2Goals" INTEGER NOT NULL,
    "avgGoals" DOUBLE PRECISION NOT NULL,
    "lastMatches" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeadToHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Odds" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "bookmaker" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "homeWin" DOUBLE PRECISION,
    "draw" DOUBLE PRECISION,
    "awayWin" DOUBLE PRECISION,
    "overLine" DOUBLE PRECISION,
    "overOdds" DOUBLE PRECISION,
    "underOdds" DOUBLE PRECISION,
    "bttsYes" DOUBLE PRECISION,
    "bttsNo" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Odds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "tipType" TEXT NOT NULL,
    "prediction" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "calculatedProbability" DOUBLE PRECISION NOT NULL,
    "impliedProbability" DOUBLE PRECISION NOT NULL,
    "valueRating" DOUBLE PRECISION NOT NULL,
    "bestOdds" DOUBLE PRECISION NOT NULL,
    "bestBookmaker" TEXT NOT NULL,
    "suggestedStake" INTEGER NOT NULL,
    "reasoning" JSONB NOT NULL,
    "modelBreakdown" JSONB NOT NULL,
    "result" "TipResult" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EloHistory" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "matchId" INTEGER NOT NULL,
    "change" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EloHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPerformance" (
    "id" SERIAL NOT NULL,
    "modelName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "totalPredictions" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "roi" DOUBLE PRECISION NOT NULL,
    "brierScore" DOUBLE PRECISION,
    "logLoss" DOUBLE PRECISION,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "League_apiFootballId_key" ON "League"("apiFootballId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_apiFootballId_key" ON "Team"("apiFootballId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_apiFootballId_key" ON "Match"("apiFootballId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamStats_teamId_season_key" ON "TeamStats"("teamId", "season");

-- CreateIndex
CREATE UNIQUE INDEX "HeadToHead_team1Id_team2Id_key" ON "HeadToHead"("team1Id", "team2Id");

-- CreateIndex
CREATE INDEX "Odds_matchId_market_idx" ON "Odds"("matchId", "market");

-- CreateIndex
CREATE INDEX "Tip_matchId_idx" ON "Tip"("matchId");

-- CreateIndex
CREATE INDEX "EloHistory_teamId_idx" ON "EloHistory"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelPerformance_modelName_market_period_key" ON "ModelPerformance"("modelName", "market", "period");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamStats" ADD CONSTRAINT "TeamStats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odds" ADD CONSTRAINT "Odds_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
