/**
 * Seed script – football-data.org edition
 *
 * Populates leagues and teams from football-data.org (free tier, no daily cap).
 * Run with:  npm run db:seed
 *
 * Requires DATABASE_URL and FOOTBALL_DATA_API_KEY in your .env file.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { footballData, COMPETITION_NUMERIC_IDS } from "../src/services/football-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter, log: ["warn", "error"] });

const TARGET_LEAGUES = [
  { id: COMPETITION_NUMERIC_IDS.PL, code: "PL" as const, name: "Premier League", country: "England", slug: "premier-league" },
  { id: COMPETITION_NUMERIC_IDS.PD, code: "PD" as const, name: "La Liga",        country: "Spain",   slug: "la-liga"        },
  { id: COMPETITION_NUMERIC_IDS.SA, code: "SA" as const, name: "Serie A",        country: "Italy",   slug: "serie-a"        },
  { id: COMPETITION_NUMERIC_IDS.BL1, code: "BL1" as const, name: "Bundesliga",  country: "Germany", slug: "bundesliga"     },
  { id: COMPETITION_NUMERIC_IDS.FL1, code: "FL1" as const, name: "Ligue 1",             country: "France",  slug: "ligue-1"          },
  { id: COMPETITION_NUMERIC_IDS.CL,  code: "CL"  as const, name: "UEFA Champions League", country: "Europe",  slug: "champions-league" },
] as const;

const CURRENT_SEASON = 2025;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function seedLeagues() {
  console.log("\n[Seed] Seeding leagues…");
  for (const l of TARGET_LEAGUES) {
    await prisma.league.upsert({
      where: { slug: l.slug },
      update: { name: l.name, country: l.country, apiFootballId: l.id, season: CURRENT_SEASON },
      create: { name: l.name, country: l.country, slug: l.slug, apiFootballId: l.id, season: CURRENT_SEASON },
    });
    console.log(`  ✓ ${l.name}`);
  }
}

async function seedTeams() {
  console.log("\n[Seed] Seeding teams…");
  for (const l of TARGET_LEAGUES) {
    const league = await prisma.league.findUnique({ where: { apiFootballId: l.id } });
    if (!league) { console.warn(`  ⚠ League ${l.slug} not found`); continue; }

    const teams = await footballData.getTeams(l.code);
    console.log(`  → ${l.name}: ${teams.length} teams`);

    for (const t of teams) {
      await prisma.team.upsert({
        where: { apiFootballId: t.id },
        update: { name: t.name, shortName: t.shortName || t.tla || null, logo: t.crest || null, venue: t.venue || null },
        create: { name: t.name, shortName: t.shortName || t.tla || null, logo: t.crest || null, leagueId: league.id, apiFootballId: t.id, venue: t.venue || null, eloRating: 1500 },
      });
    }
    console.log(`  ✓ Upserted ${teams.length} teams for ${l.name}`);
    await sleep(7000); // 10 req/min → ~6s between calls
  }
}

async function main() {
  console.log("=== FootballEdge Seed (football-data.org) ===");
  try {
    await seedLeagues();
    await seedTeams();
    console.log("\n[Seed] ✅ Complete");
  } catch (err) {
    console.error("\n[Seed] ❌ Error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
