import Link from "next/link";
import { ConfidenceBadge } from "./confidence-badge";

interface TipCardProps {
  id: number;
  tipType: string;
  prediction: string;
  confidence: number;
  calculatedProbability: number;
  impliedProbability: number | null;
  valueRating: number;
  bestOdds: number | null;
  bestBookmaker: string;
  suggestedStake: number;
  reasoning: unknown;
  result: string;
  match: {
    id: number;
    homeTeam: { name: string };
    awayTeam: { name: string };
    league: { name: string };
  };
}

const tipTypeLabels: Record<string, string> = {
  "1X2": "Match Result",
  OVER_UNDER: "Over / Under",
  BTTS: "Both Teams Score",
  DOUBLE_CHANCE: "Double Chance",
};

const tipTypeColors: Record<string, string> = {
  "1X2": "from-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300",
  OVER_UNDER: "from-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300",
  BTTS: "from-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300",
  DOUBLE_CHANCE: "from-teal-500/10 border-teal-500/20 text-teal-700 dark:text-teal-300",
};

const resultConfig: Record<string, { label: string; className: string; dot: string }> = {
  PENDING:   { label: "Pending",   className: "text-gray-400 dark:text-slate-400",         dot: "bg-gray-400 dark:bg-slate-500" },
  WON:       { label: "Won",       className: "text-green-600 dark:text-green-400",         dot: "bg-green-500 dark:bg-green-400" },
  LOST:      { label: "Lost",      className: "text-red-500 dark:text-red-400",             dot: "bg-red-500 dark:bg-red-400" },
  VOID:      { label: "Void",      className: "text-gray-400 dark:text-slate-500",          dot: "bg-gray-300 dark:bg-slate-600" },
  HALF_WON:  { label: "Half Won",  className: "text-green-500/70 dark:text-green-400/70",   dot: "bg-green-400/70" },
  HALF_LOST: { label: "Half Lost", className: "text-red-500/70 dark:text-red-400/70",       dot: "bg-red-400/70" },
};

export function TipCard({ tip }: { tip: TipCardProps }) {
  const reasoning = Array.isArray(tip.reasoning)
    ? (tip.reasoning as string[]).map((r) => r.replace(/Poisson/g, "Richard"))
    : [];
  const result = resultConfig[tip.result] ?? resultConfig.PENDING;
  const valuePct = Math.round(tip.valueRating * 100);
  const typeColor = tipTypeColors[tip.tipType] ?? "from-slate-500/10 border-slate-500/20 text-gray-600 dark:text-slate-300";

  return (
    <div className="group flex flex-col rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-5 hover:border-gray-300 hover:shadow-xl hover:shadow-black/5 transition-all duration-200 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 dark:hover:border-slate-700 dark:hover:shadow-black/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <Link
            href={`/matches/${tip.match.id}`}
            className="font-semibold text-gray-900 hover:text-green-600 transition-colors text-sm leading-snug block dark:text-white dark:hover:text-green-400"
          >
            {tip.match.homeTeam.name}{" "}
            <span className="text-gray-400 font-normal dark:text-slate-500">vs</span>{" "}
            {tip.match.awayTeam.name}
          </Link>
          <p className="text-xs text-gray-400 mt-0.5 truncate dark:text-slate-600">{tip.match.league.name}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${result.dot}`} />
          <span className={`text-xs font-medium ${result.className}`}>{result.label}</span>
        </div>
      </div>

      {/* Type label */}
      <div className="mb-3">
        <span className={`inline-flex items-center rounded-lg border bg-gradient-to-r ${typeColor} px-2.5 py-1 text-xs font-medium`}>
          {tipTypeLabels[tip.tipType] ?? tip.tipType}
        </span>
      </div>

      {/* Prediction + confidence */}
      <div className="flex items-center gap-2 mb-5">
        <span className="rounded-xl bg-green-500/10 border border-green-500/25 px-3 py-1.5 text-sm font-bold text-green-700 dark:text-green-300">
          {tip.prediction}
        </span>
        <ConfidenceBadge confidence={tip.confidence} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-px rounded-xl overflow-hidden border border-gray-200 mb-5 bg-gray-200 dark:border-slate-800 dark:bg-slate-800">
        <div className="bg-gray-50 px-3 py-2.5 text-center dark:bg-slate-900">
          <p className="text-xs text-gray-400 mb-1 dark:text-slate-500">Odds</p>
          <p className="font-bold text-gray-900 text-sm dark:text-white">
            {tip.bestOdds != null ? tip.bestOdds.toFixed(2) : "—"}
          </p>
          <p className="text-xs text-gray-400 truncate mt-0.5 dark:text-slate-600">
            {tip.bestOdds != null ? tip.bestBookmaker : "model"}
          </p>
        </div>
        <div className="bg-gray-50 px-3 py-2.5 text-center dark:bg-slate-900">
          <p className="text-xs text-gray-400 mb-1 dark:text-slate-500">Edge</p>
          <p className={`font-bold text-sm ${valuePct > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-slate-400"}`}>
            +{valuePct}%
          </p>
        </div>
        <div className="bg-gray-50 px-3 py-2.5 text-center dark:bg-slate-900">
          <p className="text-xs text-gray-400 mb-1 dark:text-slate-500">Stake</p>
          <p className="font-bold text-gray-900 text-sm dark:text-white">{tip.suggestedStake}u</p>
        </div>
      </div>

      {/* Reasoning */}
      {reasoning.length > 0 && (
        <ul className="space-y-2 mt-auto">
          {reasoning.slice(0, 3).map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-400 leading-relaxed dark:text-slate-500">
              <span className="text-green-500/60 shrink-0 mt-0.5">▸</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
