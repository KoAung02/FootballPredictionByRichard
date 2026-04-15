import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MatchStatusBadge } from "@/components/matches/match-status-badge";
import { TipCard } from "@/components/tips/tip-card";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import type { Metadata } from "next";

async function getMatch(id: number) {
  return prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: {
        include: { stats: { orderBy: { season: "desc" }, take: 1 } },
      },
      awayTeam: {
        include: { stats: { orderBy: { season: "desc" }, take: 1 } },
      },
      league: true,
      odds: { orderBy: { fetchedAt: "desc" } },
      tips: {
        orderBy: { confidence: "desc" },
        include: {
          match: { include: { homeTeam: true, awayTeam: true, league: true } },
        },
      },
    },
  });
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const matchId = parseInt(id, 10);
  if (isNaN(matchId)) return {};
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return {};
  return {
    title: `${match.homeTeam.name} vs ${match.awayTeam.name} — Richard's Football Tips`,
  };
}

export default async function MatchPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const matchId = parseInt(id, 10);
  if (isNaN(matchId)) notFound();

  const match = await getMatch(matchId);
  if (!match) notFound();

  const homeStats = match.homeTeam.stats[0] ?? null;
  const awayStats = match.awayTeam.stats[0] ?? null;

  // Gather best 1X2 odds from h2h market
  const h2hOdds = match.odds.filter((o) => o.market === "h2h");
  const bestH2H = h2hOdds.reduce<{ homeWin: number | null; draw: number | null; awayWin: number | null }>(
    (best, o) => ({
      homeWin: Math.max(best.homeWin ?? 0, o.homeWin ?? 0) || null,
      draw: Math.max(best.draw ?? 0, o.draw ?? 0) || null,
      awayWin: Math.max(best.awayWin ?? 0, o.awayWin ?? 0) || null,
    }),
    { homeWin: null, draw: null, awayWin: null }
  );

  // Derive probability bar values from best odds (implied probabilities)
  const homeProb = bestH2H.homeWin ? 1 / bestH2H.homeWin : null;
  const drawProb = bestH2H.draw ? 1 / bestH2H.draw : null;
  const awayProb = bestH2H.awayWin ? 1 / bestH2H.awayWin : null;
  const probSum = (homeProb ?? 0) + (drawProb ?? 0) + (awayProb ?? 0);
  const showProbBar =
    homeProb !== null && drawProb !== null && awayProb !== null && probSum > 0;

  return (
    <main className="flex-1">
      {/* Breadcrumb + header */}
      <section className="border-b border-gray-200 bg-gray-50/50 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 dark:text-slate-500">
            <Link href="/leagues" className="hover:text-gray-700 transition-colors dark:hover:text-slate-300">
              Leagues
            </Link>
            <span>/</span>
            <Link
              href={`/leagues/${match.league.slug}`}
              className="hover:text-gray-700 transition-colors dark:hover:text-slate-300"
            >
              {match.league.name}
            </Link>
            <span>/</span>
            <span className="text-gray-700 truncate dark:text-slate-300">
              {match.homeTeam.name} vs {match.awayTeam.name}
            </span>
          </div>

          {/* Score / versus */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-right">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {match.homeTeam.name}
              </h1>
              <p className="text-gray-400 text-sm mt-1 dark:text-slate-500">Home</p>
            </div>

            <div className="flex flex-col items-center shrink-0 px-4">
              {match.status === "FINISHED" ? (
                <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                  {match.homeGoals}–{match.awayGoals}
                </span>
              ) : (
                <span className="text-2xl font-bold text-gray-400 dark:text-slate-500">vs</span>
              )}
              <div className="mt-2">
                <MatchStatusBadge status={match.status} />
              </div>
            </div>

            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {match.awayTeam.name}
              </h2>
              <p className="text-gray-400 text-sm mt-1 dark:text-slate-500">Away</p>
            </div>
          </div>

          <p className="text-gray-400 text-sm text-center mt-4 dark:text-slate-500">
            {formatDate(match.matchDate)}
            {match.round && <span className="ml-2 text-gray-300 dark:text-slate-600">· {match.round}</span>}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-10">

        {/* Probability bar from market odds */}
        {showProbBar && (
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 dark:text-slate-400">
              Market Implied Probabilities
            </h2>
            <ProbabilityBar
              home={homeProb! / probSum}
              draw={drawProb! / probSum}
              away={awayProb! / probSum}
              homeLabel={match.homeTeam.name}
              awayLabel={match.awayTeam.name}
            />
            <p className="text-xs text-gray-400 mt-3 dark:text-slate-600">Based on best available odds (overround removed)</p>
          </section>
        )}

        {/* Team stats comparison */}
        {(homeStats || awayStats) && (
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5 dark:text-slate-400">
              Season Stats
            </h2>
            <div className="grid grid-cols-3 gap-2 text-sm">
              {/* Header */}
              <div className="text-right font-semibold text-gray-900 truncate dark:text-white">{match.homeTeam.name}</div>
              <div className="text-center text-gray-400 text-xs uppercase tracking-wide dark:text-slate-500">Stat</div>
              <div className="font-semibold text-gray-900 truncate dark:text-white">{match.awayTeam.name}</div>

              {/* Rows */}
              {[
                { label: "Played", home: homeStats?.matchesPlayed, away: awayStats?.matchesPlayed },
                { label: "Wins", home: homeStats?.wins, away: awayStats?.wins },
                { label: "Goals For", home: homeStats?.goalsFor, away: awayStats?.goalsFor },
                { label: "Goals Against", home: homeStats?.goalsAgainst, away: awayStats?.goalsAgainst },
                { label: "Clean Sheets", home: homeStats?.cleanSheets, away: awayStats?.cleanSheets },
                { label: "Form", home: homeStats?.form, away: awayStats?.form },
              ].map(({ label, home, away }) => (
                home !== null && home !== undefined && away !== null && away !== undefined ? (
                  <div key={label} className="contents">
                    <div className="text-right text-gray-900 py-1.5 border-b border-gray-100 dark:text-white dark:border-slate-800">
                      {typeof home === "number" ? home : <span className="font-mono text-xs">{home}</span>}
                    </div>
                    <div className="text-center text-gray-400 text-xs py-1.5 border-b border-gray-100 dark:text-slate-500 dark:border-slate-800">
                      {label}
                    </div>
                    <div className="text-gray-900 py-1.5 border-b border-gray-100 dark:text-white dark:border-slate-800">
                      {typeof away === "number" ? away : <span className="font-mono text-xs">{away}</span>}
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          </section>
        )}

        {/* Odds table */}
        {match.odds.length > 0 && (
          <section className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5 dark:text-slate-400">
              Best Available Odds
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-400 text-xs dark:border-slate-800 dark:text-slate-500">
                    <th className="text-left pb-2 pr-4">Bookmaker</th>
                    <th className="text-left pb-2 pr-4">Market</th>
                    <th className="text-right pb-2 pr-3">Home</th>
                    <th className="text-right pb-2 pr-3">Draw</th>
                    <th className="text-right pb-2 pr-3">Away</th>
                    <th className="text-right pb-2">O/U</th>
                  </tr>
                </thead>
                <tbody>
                  {match.odds.slice(0, 10).map((o) => (
                    <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-100/50 dark:border-slate-800/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 pr-4 text-gray-700 dark:text-slate-300">{o.bookmaker}</td>
                      <td className="py-2 pr-4 text-gray-400 text-xs uppercase dark:text-slate-500">{o.market}</td>
                      <td className="py-2 pr-3 text-right font-mono text-gray-800 dark:text-slate-200">
                        {o.homeWin?.toFixed(2) ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-gray-800 dark:text-slate-200">
                        {o.draw?.toFixed(2) ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-gray-800 dark:text-slate-200">
                        {o.awayWin?.toFixed(2) ?? "—"}
                      </td>
                      <td className="py-2 text-right font-mono text-gray-800 dark:text-slate-200">
                        {o.overOdds ? `${o.overOdds.toFixed(2)} / ${o.underOdds?.toFixed(2) ?? "—"}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Tips */}
        {match.tips.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-5 dark:text-white">
              Predictions & Tips
              <span className="ml-2 text-sm font-normal text-gray-400 dark:text-slate-500">
                ({match.tips.length})
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {match.tips.map((tip) => (
                <TipCard key={tip.id} tip={tip} />
              ))}
            </div>
          </section>
        )}

        {match.tips.length === 0 && match.odds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl mb-3">🔮</p>
            <p className="text-gray-400 dark:text-slate-500">No predictions yet for this match.</p>
          </div>
        )}
      </div>
    </main>
  );
}
