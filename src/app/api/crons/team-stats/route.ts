/**
 * GET /api/crons/team-stats
 *
 * Manual trigger for the team-stats fetching job.
 */

import { fetchTeamStatsJob } from "@/jobs/team-stats";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const results = await fetchTeamStatsJob();
    return Response.json({ ok: true, results });
  } catch (err) {
    console.error("[cron/team-stats] Unhandled error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
