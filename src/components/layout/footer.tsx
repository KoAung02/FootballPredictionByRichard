export function Footer() {
  return (
    <footer className="border-t border-gray-200/60 bg-white mt-auto dark:border-slate-800/60 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-green-500 to-emerald-600">
              <span className="text-xs">⚽</span>
            </div>
            <p className="text-gray-500 text-sm font-medium dark:text-slate-400">
              Richard&apos;s Football Tips
            </p>
          </div>
          <p className="text-gray-400 text-xs dark:text-slate-600">
            For entertainment purposes only. Please gamble responsibly. 18+
          </p>
        </div>
      </div>
    </footer>
  );
}
