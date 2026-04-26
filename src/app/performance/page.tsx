import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Performance — Richard's Football Tips",
  description: "Track record of past predictions — results, accuracy and ROI.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function resultBadge(result: string) {
  switch (result) {
    case "WON":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-600 border border-green-500/30 dark:text-green-400">
          WON
        </span>
      );
    case "LOST":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/30 dark:text-red-400">
          LOST
        </span>
      );
    case "VOID":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200 dark:bg-slate-500/20 dark:text-slate-400 dark:border-slate-600">
          VOID
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/30 dark:text-yellow-400">
          PENDING
        </span>
      );
  }
}

async function getPastTips() {
  return prisma.tip.findMany({
    where: {
      result: { in: ["WON", "LOST", "VOID"] },
    },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
          league: true,
        },
      },
    },
    orderBy: { match: { matchDate: "desc" } },
  });
}

export default async function PerformancePage() {
  const tips = await getPastTips();

  // ── Summary stats ──────────────────────────────────────────────────────────
  const total   = tips.length;
  const won     = tips.filter((t) => t.result === "WON").length;
  const lost    = tips.filter((t) => t.result === "LOST").length;
  const voided  = tips.filter((t) => t.result === "VOID").length;
  const settled = won + lost; // exclude void for accuracy calc

  const accuracy = settled > 0 ? Math.round((won / settled) * 100) : null;

  // ── Group by match date (day) ─────────────────────────────────────────────
  const byDay = tips.reduce<Record<string, typeof tips>>((acc, tip) => {
    const day = new Date(tip.match.matchDate).toDateString();
    if (!acc[day]) acc[day] = [];
    acc[day].push(tip);
    return acc;
  }, {});

  const days = Object.keys(byDay).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Performance</h1>
          <p className="text-gray-500 mt-2 dark:text-slate-400">
            Track record of settled predictions — how well our AI tips performed.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 mb-10 max-w-sm">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-gray-400 mb-1 dark:text-slate-500">Total settled</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{settled}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs text-gray-400 mb-1 dark:text-slate-500">Win rate</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {accuracy !== null ? `${accuracy}%` : "—"}
            </p>
            {settled > 0 && (
              <p className="text-xs text-gray-400 mt-1 dark:text-slate-500">
                {won}W {lost}L{voided > 0 ? ` ${voided}V` : ""}
              </p>
            )}
          </div>
        </div>

        {/* No data yet */}
        {total === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-4">📊</p>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-white">No settled predictions yet</h2>
            <p className="text-gray-400 max-w-sm dark:text-slate-500">
              Results will appear here once matches with tips have finished and
              the result-checker job has run.
            </p>
          </div>
        )}

        {/* Grouped by day */}
        {days.length > 0 && (
          <div className="space-y-10">
            {days.map((day) => {
              const dayTips = byDay[day];
              const dayWon  = dayTips.filter((t) => t.result === "WON").length;
              const dayLost = dayTips.filter((t) => t.result === "LOST").length;

              return (
                <section key={day}>
                  {/* Day header */}
                  <div className="flex items-center gap-3 mb-4 pb-2 border-b border-gray-200 dark:border-slate-800">
                    <h2 className="font-bold text-lg text-gray-900 dark:text-white">
                      {formatDate(new Date(day))}
                    </h2>
                    <span className="text-sm text-gray-400 dark:text-slate-500">
                      {dayWon > 0 && (
                        <span className="text-green-600 dark:text-green-400">{dayWon}W </span>
                      )}
                      {dayLost > 0 && (
                        <span className="text-red-500 dark:text-red-400">{dayLost}L</span>
                      )}
                    </span>
                  </div>

                  {/* Tips table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 border-b border-gray-200 dark:text-slate-500 dark:border-slate-800">
                          <th className="text-left pb-2 pr-4 font-medium">Match</th>
                          <th className="text-left pb-2 pr-4 font-medium">League</th>
                          <th className="text-left pb-2 pr-4 font-medium">Type</th>
                          <th className="text-left pb-2 pr-4 font-medium">Prediction</th>
                          <th className="text-right pb-2 pr-4 font-medium">Odds</th>
                          <th className="text-right pb-2 pr-4 font-medium">Stake</th>
                          <th className="text-left pb-2 pr-4 font-medium">Score</th>
                          <th className="text-left pb-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-800/50">
                        {dayTips.map((tip) => {
                          const m = tip.match;
                          const hasScore =
                            m.homeGoals !== null && m.awayGoals !== null;
                          return (
                            <tr key={tip.id} className="hover:bg-gray-50 transition-colors dark:hover:bg-slate-800/30">
                              <td className="py-3 pr-4">
                                <Link
                                  href={`/matches/${m.id}`}
                                  className="text-gray-900 hover:text-green-600 transition-colors font-medium dark:text-white dark:hover:text-green-400"
                                >
                                  {m.homeTeam.name}{" "}
                                  <span className="text-gray-400 font-normal dark:text-slate-500">vs</span>{" "}
                                  {m.awayTeam.name}
                                </Link>
                              </td>
                              <td className="py-3 pr-4 text-gray-500 dark:text-slate-400">
                                {m.league.name}
                              </td>
                              <td className="py-3 pr-4">
                                <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded dark:text-slate-400 dark:bg-slate-800">
                                  {tip.tipType}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-gray-900 dark:text-white">
                                {tip.prediction}
                              </td>
                              <td className="py-3 pr-4 text-right text-gray-700 dark:text-slate-300">
                                {tip.bestOdds != null ? tip.bestOdds.toFixed(2) : "—"}
                              </td>
                              <td className="py-3 pr-4 text-right text-gray-400 dark:text-slate-400">
                                {tip.suggestedStake}u
                              </td>
                              <td className="py-3 pr-4 font-mono text-gray-700 dark:text-slate-300">
                                {hasScore
                                  ? `${m.homeGoals} – ${m.awayGoals}`
                                  : "—"}
                              </td>
                              <td className="py-3">{resultBadge(tip.result)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-12 dark:text-slate-600">
          For entertainment purposes only. Please gamble responsibly.
        </p>
      </div>
    </main>
  );
}
