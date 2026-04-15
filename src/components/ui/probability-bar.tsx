export function ProbabilityBar({
  home,
  draw,
  away,
  homeLabel,
  awayLabel,
}: {
  home: number;
  draw: number;
  away: number;
  homeLabel?: string;
  awayLabel?: string;
}) {
  const homePct = Math.round(home * 100);
  const drawPct = Math.round(draw * 100);
  const awayPct = Math.round(away * 100);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
        <span className="font-medium text-blue-600 truncate max-w-[40%] dark:text-blue-400">
          {homeLabel ?? "Home"}
        </span>
        <span>Draw</span>
        <span className="font-medium text-amber-600 truncate max-w-[40%] text-right dark:text-amber-400">
          {awayLabel ?? "Away"}
        </span>
      </div>
      <div className="flex rounded-full overflow-hidden h-3 bg-gray-200 gap-px dark:bg-slate-800">
        <div
          className="bg-blue-500 rounded-l-full transition-all"
          style={{ width: `${homePct}%` }}
        />
        <div
          className="bg-gray-400 transition-all dark:bg-slate-500"
          style={{ width: `${drawPct}%` }}
        />
        <div
          className="bg-amber-500 rounded-r-full transition-all"
          style={{ width: `${awayPct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs font-semibold">
        <span className="text-blue-600 dark:text-blue-400">{homePct}%</span>
        <span className="text-gray-500 dark:text-slate-400">{drawPct}%</span>
        <span className="text-amber-600 dark:text-amber-400">{awayPct}%</span>
      </div>
    </div>
  );
}
