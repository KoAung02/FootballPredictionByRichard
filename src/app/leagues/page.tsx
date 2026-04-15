export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { LeagueCard } from "@/components/leagues/league-card";

export const metadata = {
  title: "Leagues — Richard's Football Tips",
  description: "Browse the top 5 European football leagues covered by Richard's Football Tips.",
};

async function getLeagues() {
  return prisma.league.findMany({
    include: { _count: { select: { teams: true, matches: true } } },
    orderBy: { name: "asc" },
  });
}

export default async function LeaguesPage() {
  const leagues = await getLeagues();

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Leagues</h1>
          <p className="text-gray-500 mt-2 dark:text-slate-400">Top 5 European leagues + UEFA Champions League</p>
        </div>

        {leagues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-5xl mb-4">🏆</p>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 dark:text-white">No leagues found</h2>
            <p className="text-gray-400 dark:text-slate-500">Run the database seed to populate leagues and teams.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
