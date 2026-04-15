/**
 * Next.js instrumentation file.
 *
 * `register` is called once when the server process starts.
 * We use it to schedule background cron jobs via node-cron.
 *
 * Guards:
 * - Only runs in the Node.js runtime (not Edge).
 * - Uses a module-level flag so hot-reload in development doesn't
 *   register duplicate schedules.
 *
 * Schedules:
 *   Fixtures       every 6 hours     "0 *\/6 * * *"
 *   Team stats     daily at 04:00    "0 4 * * *"
 *   Odds           every 30 minutes  "*\/30 * * * *"
 *   Predictions    every 6 hours     "0 *\/6 * * *"
 */

export async function register() {
  // Only attach cron jobs in the Node.js runtime (not the Edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const cron = await import("node-cron");

  const { fetchFixturesJob }   = await import("@/jobs/fixtures");
  const { fetchTeamStatsJob }  = await import("@/jobs/team-stats");
  const { fetchOddsJob }       = await import("@/jobs/odds");
  const { runPredictionsJob }  = await import("@/jobs/run-predictions");
  const { updateResultsJob }   = await import("@/jobs/update-results");

  // ── Fixtures – every 6 hours ────────────────────────────────────────────────
  cron.schedule("0 */6 * * *", async () => {
    console.log("[cron] Running fixtures job…");
    try {
      const results = await fetchFixturesJob();
      console.log("[cron] Fixtures done:", JSON.stringify(results));
    } catch (err) {
      console.error("[cron] Fixtures job failed:", err);
    }
  });

  // ── Team stats – daily at 04:00 ─────────────────────────────────────────────
  cron.schedule("0 4 * * *", async () => {
    console.log("[cron] Running team-stats job…");
    try {
      const results = await fetchTeamStatsJob();
      console.log("[cron] Team stats done:", JSON.stringify(results));
    } catch (err) {
      console.error("[cron] Team stats job failed:", err);
    }
  });

  // ── Odds – every 30 minutes ─────────────────────────────────────────────────
  cron.schedule("*/30 * * * *", async () => {
    console.log("[cron] Running odds job…");
    try {
      const results = await fetchOddsJob();
      console.log("[cron] Odds done:", JSON.stringify(results));
    } catch (err) {
      console.error("[cron] Odds job failed:", err);
    }
  });

  // ── Predictions – every 6 hours ─────────────────────────────────────────────
  cron.schedule("0 */6 * * *", async () => {
    console.log("[cron] Running predictions job…");
    try {
      const result = await runPredictionsJob();
      console.log("[cron] Predictions done:", JSON.stringify(result));
    } catch (err) {
      console.error("[cron] Predictions job failed:", err);
    }
  });

  // ── Update results – every hour ──────────────────────────────────────────────
  cron.schedule("0 * * * *", async () => {
    console.log("[cron] Running update-results job…");
    try {
      const result = await updateResultsJob();
      console.log("[cron] Update-results done:", JSON.stringify(result));
    } catch (err) {
      console.error("[cron] Update-results job failed:", err);
    }
  });

  console.log("[cron] All schedules registered.");
}
