import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matchId = parseInt(id, 10);
  if (isNaN(matchId)) {
    return Response.json({ error: "Invalid match id" }, { status: 400 });
  }
  try {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: {
          include: { stats: { orderBy: { season: "desc" }, take: 1 } },
        },
        awayTeam: {
          include: { stats: { orderBy: { season: "desc" }, take: 1 } },
        },
        league: true,
        odds: { orderBy: { fetchedAt: "desc" } },
        tips: { orderBy: { confidence: "desc" } },
      },
    });
    if (!match) {
      return Response.json({ error: "Match not found" }, { status: 404 });
    }
    return Response.json(match);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
