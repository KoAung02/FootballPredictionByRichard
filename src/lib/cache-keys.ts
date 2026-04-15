// ── Cache key builders ─────────────────────────────────────────────────────────

export const CacheKeys = {
  /** Upcoming fixtures for a league (all statuses). */
  fixtures: (leagueId: number) => `fixtures:${leagueId}`,

  /** Season stats for a single team. */
  teamStats: (teamId: number, season: number) => `team-stats:${teamId}:${season}`,

  /** Pre-match odds for a sport key (covers all events for that league). */
  odds: (sportKey: string) => `odds:${sportKey}`,

  /** Prediction engine output for a specific match. */
  prediction: (matchId: number) => `prediction:${matchId}`,
} as const;

// ── TTL constants (seconds) ────────────────────────────────────────────────────

export const CacheTTL = {
  fixtures:   6 * 60 * 60,   // 6 hours  – matches cron frequency
  teamStats:  24 * 60 * 60,  // 24 hours – matches cron frequency
  odds:       30 * 60,       // 30 min   – matches cron frequency
  prediction: 6 * 60 * 60,   // 6 hours  – same cadence as fixtures
} as const;
