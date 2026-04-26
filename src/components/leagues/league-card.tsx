import Link from "next/link";

interface LeagueCardProps {
  id: number;
  name: string;
  country: string;
  slug: string;
  homeWinRate: number | null;
  drawRate: number | null;
  awayWinRate: number | null;
  _count: { teams: number; matches: number };
}

const leagueFlags: Record<string, string> = {
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Spain: "🇪🇸",
  Italy: "🇮🇹",
  Germany: "🇩🇪",
};

export function LeagueCard({ league }: { league: LeagueCardProps }) {
  const flag = leagueFlags[league.country] ?? "🌍";

  return (
    <Link
      href={`/leagues/${league.slug}`}
      className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-5 hover:border-green-500/40 hover:bg-gray-100/80 transition-all group dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/80"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{flag}</span>
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 group-hover:text-green-600 transition-colors truncate dark:text-white dark:group-hover:text-green-400">
            {league.name}
          </h3>
          <p className="text-sm text-gray-400 dark:text-slate-500">{league.country}</p>
        </div>
      </div>

      <div className="flex gap-4 text-sm">
        <div>
          <p className="text-gray-400 text-xs dark:text-slate-500">Teams</p>
          <p className="font-semibold text-gray-900 dark:text-white">{league._count.teams}</p>
        </div>
        <div>
          <p className="text-gray-400 text-xs dark:text-slate-500">Matches</p>
          <p className="font-semibold text-gray-900 dark:text-white">{league._count.matches}</p>
        </div>
        {league.homeWinRate !== null && (
          <div>
            <p className="text-gray-400 text-xs dark:text-slate-500">Home Win</p>
            <p className="font-semibold text-gray-900 dark:text-white">
              {Math.round((league.homeWinRate ?? 0) * 100)}%
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity dark:text-green-500">
        View fixtures →
      </p>
    </Link>
  );
}
