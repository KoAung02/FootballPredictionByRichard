import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TipCard } from "@/components/tips/tip-card";
import { MatchStatusBadge } from "@/components/matches/match-status-badge";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tips — Richard's Football Tips",
  description: "Richard's expert betting tips with value detection for upcoming matches.",
};

const leagueFlags: Record<string, string> = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Spain: "🇪🇸",
  Italy: "🇮🇹",
  Germany: "🇩🇪",
  France: "🇫🇷",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

async function getFixturesWithTips() {
  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      matchDate: { gte: now, lte: in14d },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      league: true,
      tips: {
        orderBy: { confidence: "desc" },
        include: {
          match: { include: { homeTeam: true, awayTeam: true, league: true } },
        },
      },
    },
    orderBy: { matchDate: "asc" },
  });
}

export default async function TipsPage() {
  const matches = await getFixturesWithTips();

  // Group by league
  const byLeague = matches.reduce<Record<string, typeof matches>>((acc, m) => {
    const key = m.league.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const totalTips = matches.reduce((sum, m) => sum + m.tips.length, 0);
  const leagueNames = Object.keys(byLeague).sort();

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Predictions & Tips</h1>
          <p className="text-gray-500 mt-2 dark:text-slate-400">
            All upcoming fixtures — next 14 days · {matches.length} matches · {totalTips} tips
          </p>
        </div>

        {matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-4">🔮</p>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-white">No upcoming fixtures</h2>
            <p className="text-gray-400 max-w-sm dark:text-slate-500">
              Run the fixtures and predictions cron to populate upcoming matches.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {leagueNames.map((leagueName) => {
              const leagueMatches = byLeague[leagueName];
              const league = leagueMatches[0].league;
              const flag = leagueFlags[league.country] ?? "🌍";
              const leagueTips = leagueMatches.reduce((sum, m) => sum + m.tips.length, 0);

              return (
                <section key={leagueName}>
                  {/* League header */}
                  <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200 dark:border-slate-800">
                    <span className="text-2xl">{flag}</span>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Link
                        href={`/leagues/${league.slug}`}
                        className="font-bold text-xl text-gray-900 hover:text-green-600 transition-colors dark:text-white dark:hover:text-green-400"
                      >
                        {leagueName}
                      </Link>
                      <span className="text-sm text-gray-400 dark:text-slate-500">
                        {leagueMatches.length} match{leagueMatches.length > 1 ? "es" : ""}
                        {leagueTips > 0 && ` · ${leagueTips} tip${leagueTips > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  </div>

                  {/* Fixtures */}
                  <div className="space-y-6">
                    {leagueMatches.map((match) => (
                      <div key={match.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-slate-800 dark:bg-slate-900">
                        {/* Match header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-800">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className="font-semibold text-gray-900 truncate dark:text-white">
                                {match.homeTeam.name}
                              </span>
                              <span className="text-gray-400 shrink-0 dark:text-slate-500">vs</span>
                              <span className="font-semibold text-gray-900 truncate dark:text-white">
                                {match.awayTeam.name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span className="text-xs text-gray-400 dark:text-slate-500">
                              {formatDate(match.matchDate)}
                            </span>
                            <MatchStatusBadge status={match.status} />
                            <Link
                              href={`/matches/${match.id}`}
                              className="text-xs text-green-600 hover:text-green-700 transition-colors dark:text-green-500 dark:hover:text-green-400"
                            >
                              Details →
                            </Link>
                          </div>
                        </div>

                        {/* Tips for this match */}
                        {match.tips.length > 0 ? (
                          <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {match.tips.map((tip) => (
                              <TipCard key={tip.id} tip={tip} />
                            ))}
                          </div>
                        ) : (
                          <div className="px-5 py-4 text-sm text-gray-400 italic dark:text-slate-600">
                            No predictions yet — odds may not be available for this match.
                          </div>
                        )}
                      </div>
                    ))}
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
