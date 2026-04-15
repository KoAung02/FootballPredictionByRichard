/**
 * GET /api/crons/odds
 *
 * Manual trigger for the odds-fetching job.
 */

import { fetchOddsJob } from "@/jobs/odds";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await fetchOddsJob();
    return Response.json({ ok: true, results });
  } catch (err) {
    console.error("[cron/odds] Unhandled error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
