import type { MatchStatus } from "@prisma/client";

const config: Record<MatchStatus, { label: string; className: string }> = {
  SCHEDULED: { label: "Upcoming", className: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300" },
  LIVE: { label: "Live", className: "bg-red-600 text-white" },
  FINISHED: { label: "Finished", className: "bg-gray-100 text-gray-400 dark:bg-slate-700/50 dark:text-slate-400" },
  POSTPONED: { label: "Postponed", className: "bg-yellow-50 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400" },
  CANCELLED: { label: "Cancelled", className: "bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400" },
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const { label, className } = config[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {status === "LIVE" && (
        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
      )}
      {label}
    </span>
  );
}
