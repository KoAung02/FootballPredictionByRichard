import Link from "next/link";
import type { MatchStatus } from "@prisma/client";
import { MatchStatusBadge } from "./match-status-badge";

interface MatchCardProps {
  id: number;
  matchDate: Date;
  status: MatchStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  round: string | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
  league: { name: string };
  tips: Array<{ result: string }>;
}

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

export function MatchCard({ match }: { match: MatchCardProps }) {
  const pendingTips = match.tips.filter((t) => t.result === "PENDING");

  return (
    <Link
      href={`/matches/${match.id}`}
      className="group flex flex-col rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4 hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/5 transition-all duration-200 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950"
    >
      {/* Top row: league + badges */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400 truncate mr-2 dark:text-slate-600">{match.league.name}</span>
        <div className="flex items-center gap-2 shrink-0">
          {pendingTips.length > 0 && (
            <span className="text-xs bg-green-500/10 text-green-600 border border-green-500/20 rounded-full px-2 py-0.5 font-medium dark:text-green-400">
              {pendingTips.length} tip{pendingTips.length > 1 ? "s" : ""}
            </span>
          )}
          <MatchStatusBadge status={match.status} />
        </div>
      </div>

      {/* Teams + score */}
      <div className="flex items-center justify-between gap-2 flex-1 mb-4">
        <p className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors text-right flex-1 text-sm leading-tight dark:text-white dark:group-hover:text-green-50">
          {match.homeTeam.name}
        </p>
        <div className="flex flex-col items-center shrink-0">
          {match.status === "FINISHED" ? (
            <span className="text-lg font-bold text-gray-900 tabular-nums dark:text-white">
              {match.homeGoals}–{match.awayGoals}
            </span>
          ) : (
            <span className="text-xs font-medium text-gray-400 bg-gray-100 rounded-md px-2 py-1 dark:text-slate-600 dark:bg-slate-800">
              vs
            </span>
          )}
        </div>
        <p className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors flex-1 text-sm leading-tight dark:text-white dark:group-hover:text-green-50">
          {match.awayTeam.name}
        </p>
      </div>

      {/* Date / round */}
      <div className="pt-3 border-t border-gray-100 dark:border-slate-800/80">
        <p className="text-xs text-gray-400 text-center dark:text-slate-500">{formatDate(match.matchDate)}</p>
        {match.round && (
          <p className="text-xs text-gray-300 text-center mt-0.5 dark:text-slate-700">{match.round}</p>
        )}
      </div>
    </Link>
  );
}
