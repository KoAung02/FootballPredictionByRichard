/**
 * GET /api/crons/update-results
 *
 * Manual trigger for the update-results job.
 */

import { updateResultsJob } from "@/jobs/update-results";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await updateResultsJob();
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("[cron/update-results] Unhandled error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
