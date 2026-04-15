import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  try {
    const leagues = await prisma.league.findMany({
      include: {
        _count: { select: { teams: true, matches: true } },
      },
      orderBy: { name: "asc" },
    });
    return Response.json(leagues);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
