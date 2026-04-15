/**
 * GET /api/crons/fixtures
 *
 * Manual trigger for the fixture-fetching job.
 * Useful for one-off runs, Vercel cron webhooks, or local testing.
 *
 * In production, protect this route with a shared secret header:
 *   Authorization: Bearer <CRON_SECRET>
 */

import { fetchFixturesJob } from "@/jobs/fixtures";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await fetchFixturesJob();
    return Response.json({ ok: true, results });
  } catch (err) {
    console.error("[cron/fixtures] Unhandled error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
