import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/95">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20 group-hover:shadow-green-500/40 transition-shadow">
              <span className="text-base">⚽</span>
            </div>
            <span className="font-bold text-lg text-gray-900 group-hover:text-green-600 transition-colors dark:text-white dark:group-hover:text-green-400">
              Richard&apos;s <span className="text-green-600 dark:text-green-400">Football Tips</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/leagues"
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80"
            >
              Leagues
            </Link>
            <Link
              href="/tips"
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80"
            >
              Tips
            </Link>
            <Link
              href="/performance"
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/80"
            >
              Performance
            </Link>
            <div className="ml-1 pl-3 border-l border-gray-200 dark:border-slate-700">
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
