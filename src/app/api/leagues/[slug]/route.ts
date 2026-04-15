import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const league = await prisma.league.findUnique({
      where: { slug },
      include: {
        teams: { orderBy: { name: "asc" } },
        matches: {
          where: { matchDate: { gte: new Date() } },
          include: {
            homeTeam: true,
            awayTeam: true,
            tips: { select: { id: true, result: true } },
          },
          orderBy: { matchDate: "asc" },
          take: 20,
        },
        _count: { select: { teams: true, matches: true } },
      },
    });
    if (!league) {
      return Response.json({ error: "League not found" }, { status: 404 });
    }
    return Response.json(league);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
