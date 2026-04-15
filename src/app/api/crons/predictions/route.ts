/**
 * GET /api/crons/predictions
 *
 * Manual trigger for the predictions job.
 */

import { runPredictionsJob } from "@/jobs/run-predictions";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runPredictionsJob();
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("[cron/predictions] Unhandled error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
