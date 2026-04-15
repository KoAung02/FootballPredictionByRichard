import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const leagueSlug = searchParams.get("league");
  const tipType = searchParams.get("type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  const matchWhere = {
    status: { in: ["SCHEDULED" as const, "LIVE" as const] },
    matchDate: { gte: new Date() },
    ...(leagueSlug ? { league: { slug: leagueSlug } } : {}),
  };

  try {
    const [tips, total] = await prisma.$transaction([
      prisma.tip.findMany({
        where: {
          match: matchWhere,
          ...(tipType ? { tipType } : {}),
        },
        include: {
          match: {
            include: { homeTeam: true, awayTeam: true, league: true },
          },
        },
        orderBy: { confidence: "desc" },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.tip.count({
        where: {
          match: matchWhere,
          ...(tipType ? { tipType } : {}),
        },
      }),
    ]);
    return Response.json({ tips, total, page, limit });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
