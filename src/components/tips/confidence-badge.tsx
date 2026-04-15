export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence);
  const colorClass =
    pct >= 70
      ? "bg-green-500/15 text-green-600 border-green-500/25 dark:text-green-400"
      : pct >= 55
        ? "bg-amber-500/15 text-amber-600 border-amber-500/25 dark:text-amber-400"
        : "bg-gray-100 text-gray-500 border-gray-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-700/60";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${colorClass}`}
    >
      <span>{pct}%</span>
      <span className="opacity-70">conf.</span>
    </span>
  );
}
