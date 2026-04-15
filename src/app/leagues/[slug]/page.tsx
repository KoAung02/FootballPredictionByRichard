export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MatchCard } from "@/components/matches/match-card";
import type { Metadata } from "next";

const leagueFlags: Record<string, string> = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Spain: "🇪🇸",
  Italy: "🇮🇹",
  Germany: "🇩🇪",
  France: "🇫🇷",
};

async function getLeague(slug: string) {
  return prisma.league.findUnique({
    where: { slug },
    include: {
      matches: {
        include: {
          homeTeam: true,
          awayTeam: true,
          tips: { select: { result: true } },
        },
        orderBy: { matchDate: "asc" },
        take: 30,
      },
      _count: { select: { teams: true, matches: true } },
    },
  });
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) return {};
  return {
    title: `${league.name} — Richard's Football Tips`,
    description: `Fixtures, predictions and tips for ${league.name}.`,
  };
}

export default async function LeaguePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const now = new Date();
  const upcoming = league.matches.filter(
    (m) => m.status === "SCHEDULED" && new Date(m.matchDate) >= now
  );
  const finished = league.matches
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())
    .slice(0, 6);

  const flag = leagueFlags[league.country] ?? "🌍";

  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="border-b border-gray-200 bg-gray-50/50 dark:border-slate-800 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-4 dark:text-slate-500">
            <Link href="/leagues" className="hover:text-gray-700 transition-colors dark:hover:text-slate-300">
              Leagues
            </Link>
            <span>/</span>
            <span className="text-gray-700 dark:text-slate-300">{league.name}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-5xl">{flag}</span>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{league.name}</h1>
              <p className="text-gray-500 mt-1 dark:text-slate-400">{league.country} · 2025/26</p>
            </div>
          </div>

          <div className="flex gap-6 mt-6 text-sm">
            <div>
              <p className="text-gray-400 text-xs mb-1 dark:text-slate-500">Teams</p>
              <p className="font-bold text-gray-900 dark:text-white">{league._count.teams}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs mb-1 dark:text-slate-500">Fixtures tracked</p>
              <p className="font-bold text-gray-900 dark:text-white">{league._count.matches}</p>
            </div>
            {league.homeWinRate !== null && (
              <>
                <div>
                  <p className="text-gray-400 text-xs mb-1 dark:text-slate-500">Home win %</p>
                  <p className="font-bold text-gray-900 dark:text-white">{Math.round((league.homeWinRate ?? 0) * 100)}%</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1 dark:text-slate-500">Draw %</p>
                  <p className="font-bold text-gray-900 dark:text-white">{Math.round((league.drawRate ?? 0) * 100)}%</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs mb-1 dark:text-slate-500">Away win %</p>
                  <p className="font-bold text-gray-900 dark:text-white">{Math.round((league.awayWinRate ?? 0) * 100)}%</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Upcoming */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-5 dark:text-white">
            Upcoming Fixtures
            {upcoming.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400 dark:text-slate-500">
                ({upcoming.length})
              </span>
            )}
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-gray-400 text-sm dark:text-slate-500">No upcoming fixtures scheduled.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((match) => (
                <MatchCard key={match.id} match={{ ...match, league }} />
              ))}
            </div>
          )}
        </section>

        {/* Recent results */}
        {finished.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-5 dark:text-white">Recent Results</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {finished.map((match) => (
                <MatchCard key={match.id} match={{ ...match, league }} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
