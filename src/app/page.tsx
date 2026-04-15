import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MatchCard } from "@/components/matches/match-card";
import { TipCard } from "@/components/tips/tip-card";

async function getHomeData() {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const [upcomingMatches, topTips, leagues] = await Promise.all([
    prisma.match.findMany({
      where: { status: "SCHEDULED", matchDate: { gte: now, lte: in48h } },
      include: {
        homeTeam: true,
        awayTeam: true,
        league: true,
        tips: { select: { result: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 6,
    }),
    prisma.tip.findMany({
      where: {
        result: "PENDING",
        match: { status: "SCHEDULED", matchDate: { gte: now } },
      },
      include: {
        match: { include: { homeTeam: true, awayTeam: true, league: true } },
      },
      orderBy: { confidence: "desc" },
      take: 6,
    }),
    prisma.league.findMany({
      include: { _count: { select: { teams: true, matches: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return { upcomingMatches, topTips, leagues };
}

const leagueFlags: Record<string, string> = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Spain: "🇪🇸",
  Italy: "🇮🇹",
  Germany: "🇩🇪",
  France: "🇫🇷",
};

export default async function HomePage() {
  const { upcomingMatches, topTips, leagues } = await getHomeData();

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-white to-white dark:from-slate-900 dark:via-slate-950 dark:to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,_rgba(34,197,94,0.08),_transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,_rgba(34,197,94,0.12),_transparent)]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-40 bg-gradient-to-b from-green-500/20 to-transparent dark:from-green-500/30" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/5 px-4 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse dark:bg-green-400" />
            <span className="text-green-700 text-xs font-semibold tracking-wider uppercase dark:text-green-400">
              Expert Picks Updated Daily
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-gray-900 mb-5 leading-tight tracking-tight dark:text-white">
            Richard&apos;s{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-400 dark:to-emerald-500">
              Football Tips
            </span>
          </h1>
          <p className="text-gray-500 text-lg max-w-lg mx-auto mb-10 leading-relaxed dark:text-slate-400">
            Richard&apos;s expert tips for the top 5 European leagues.
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/tips"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/30"
            >
              View Today&apos;s Tips
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/leagues"
              className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all dark:border-slate-700 dark:bg-slate-800/60 dark:text-white dark:hover:bg-slate-700/60 dark:hover:border-slate-600"
            >
              Browse Leagues
            </Link>
          </div>

          {/* Stats strip */}
          {leagues.length > 0 && (
            <div className="mt-14 flex flex-wrap justify-center gap-6 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{leagues.length}</p>
                <p className="text-xs text-gray-400 mt-0.5 dark:text-slate-500">Leagues</p>
              </div>
              <div className="w-px bg-gray-200 dark:bg-slate-800" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">5</p>
                <p className="text-xs text-gray-400 mt-0.5 dark:text-slate-500">Top Divisions</p>
              </div>
              <div className="w-px bg-gray-200 dark:bg-slate-800" />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{topTips.length > 0 ? `${topTips.length}+` : "—"}</p>
                <p className="text-xs text-gray-400 mt-0.5 dark:text-slate-500">Active Tips</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 space-y-14">
        {/* Leagues strip */}
        {leagues.length > 0 && (
          <section>
            <div className="flex flex-wrap gap-2">
              {leagues.map((l) => (
                <Link
                  key={l.id}
                  href={`/leagues/${l.slug}`}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600 hover:border-green-500/40 hover:text-gray-900 hover:bg-gray-100 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/80"
                >
                  <span>{leagueFlags[l.country] ?? "🌍"}</span>
                  {l.name}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Top tips */}
        {topTips.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Top Tips</h2>
                <p className="text-sm text-gray-400 mt-1 dark:text-slate-500">Highest-confidence picks right now</p>
              </div>
              <Link
                href="/tips"
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium transition-colors dark:text-green-400 dark:hover:text-green-300"
              >
                View all
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topTips.map((tip) => (
                <TipCard key={tip.id} tip={tip} />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming matches */}
        {upcomingMatches.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Upcoming Fixtures</h2>
                <p className="text-sm text-gray-400 mt-1 dark:text-slate-500">Next 48 hours</p>
              </div>
              <Link
                href="/leagues"
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium transition-colors dark:text-green-400 dark:hover:text-green-300"
              >
                All leagues
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingMatches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {topTips.length === 0 && upcomingMatches.length === 0 && (
          <section className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 dark:bg-slate-800">
              <span className="text-3xl">⚽</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-white">No data yet</h2>
            <p className="text-gray-400 max-w-sm text-sm leading-relaxed dark:text-slate-500">
              Run the data pipeline crons to populate fixtures, odds, and predictions.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
