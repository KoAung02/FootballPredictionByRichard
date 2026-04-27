"""
FBref scraper — fetches home/away team stats from fbref.com.

Scrapes the home/away standings table for each league and returns
normalised stats compatible with the TeamStats schema.
"""

import asyncio
import re
from typing import Dict, List, Optional

import httpx
from bs4 import BeautifulSoup

# ── League URL mapping ────────────────────────────────────────────────────────

FBREF_HOMEAWAY_URLS: Dict[str, str] = {
    "premier-league":   "https://fbref.com/en/comps/9/homeaway/Premier-League-Stats",
    "la-liga":          "https://fbref.com/en/comps/12/homeaway/La-Liga-Stats",
    "serie-a":          "https://fbref.com/en/comps/11/homeaway/Serie-A-Stats",
    "bundesliga":       "https://fbref.com/en/comps/20/homeaway/Bundesliga-Stats",
    "champions-league": "https://fbref.com/en/comps/8/homeaway/Champions-League-Stats",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": "https://fbref.com/",
}


# ── Output schema ─────────────────────────────────────────────────────────────

class FBrefTeamStats:
    def __init__(
        self,
        team_name: str,
        matches_played: int,
        wins: int,
        draws: int,
        losses: int,
        goals_for: int,
        goals_against: int,
        home_wins: int,
        home_draws: int,
        home_losses: int,
        home_goals_for: int,
        home_goals_against: int,
        away_wins: int,
        away_draws: int,
        away_losses: int,
        away_goals_for: int,
        away_goals_against: int,
        form: str = "",
    ):
        self.team_name        = team_name
        self.matches_played   = matches_played
        self.wins             = wins
        self.draws            = draws
        self.losses           = losses
        self.goals_for        = goals_for
        self.goals_against    = goals_against
        self.home_wins        = home_wins
        self.home_draws       = home_draws
        self.home_losses      = home_losses
        self.home_goals_for   = home_goals_for
        self.home_goals_against = home_goals_against
        self.away_wins        = away_wins
        self.away_draws       = away_draws
        self.away_losses      = away_losses
        self.away_goals_for   = away_goals_for
        self.away_goals_against = away_goals_against
        self.form             = form

    def to_dict(self) -> Dict:
        return self.__dict__


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_int(val: Optional[str]) -> int:
    if not val:
        return 0
    try:
        return int(val.strip())
    except ValueError:
        return 0


def _parse_table(soup: BeautifulSoup, table_id_pattern: str) -> Optional[BeautifulSoup]:
    for table in soup.find_all("table"):
        tid = table.get("id", "")
        if re.search(table_id_pattern, tid):
            return table
    return None


def _parse_homeaway_table(table: BeautifulSoup) -> List[FBrefTeamStats]:
    results: List[FBrefTeamStats] = []
    tbody = table.find("tbody")
    if not tbody:
        return results

    for row in tbody.find_all("tr"):
        # Skip spacer/header rows
        if row.get("class") and "thead" in row.get("class", []):
            continue

        cells = row.find_all(["td", "th"])
        if len(cells) < 10:
            continue

        # Team name
        team_cell = row.find("td", {"data-stat": "team"})
        if not team_cell:
            continue
        team_name = team_cell.get_text(strip=True)
        if not team_name:
            continue

        def get(stat: str) -> int:
            cell = row.find(["td", "th"], {"data-stat": stat})
            return _safe_int(cell.get_text(strip=True) if cell else None)

        # Home stats
        home_mp = get("home_games")
        home_w  = get("home_wins")
        home_d  = get("home_ties")
        home_l  = get("home_losses")
        home_gf = get("home_goals")
        home_ga = get("home_goals_opp")

        # Away stats
        away_mp = get("away_games")
        away_w  = get("away_wins")
        away_d  = get("away_ties")
        away_l  = get("away_losses")
        away_gf = get("away_goals")
        away_ga = get("away_goals_opp")

        total_mp = home_mp + away_mp
        total_w  = home_w  + away_w
        total_d  = home_d  + away_d
        total_l  = home_l  + away_l
        total_gf = home_gf + away_gf
        total_ga = home_ga + away_ga

        results.append(FBrefTeamStats(
            team_name=team_name,
            matches_played=total_mp,
            wins=total_w,
            draws=total_d,
            losses=total_l,
            goals_for=total_gf,
            goals_against=total_ga,
            home_wins=home_w,
            home_draws=home_d,
            home_losses=home_l,
            home_goals_for=home_gf,
            home_goals_against=home_ga,
            away_wins=away_w,
            away_draws=away_d,
            away_losses=away_l,
            away_goals_for=away_gf,
            away_goals_against=away_ga,
        ))

    return results


# ── Public API ────────────────────────────────────────────────────────────────

async def scrape_team_stats(league_slug: str) -> List[Dict]:
    url = FBREF_HOMEAWAY_URLS.get(league_slug)
    if not url:
        raise ValueError(f"Unknown league slug: {league_slug}")

    async with httpx.AsyncClient(headers=HEADERS, timeout=30, follow_redirects=True) as client:
        await asyncio.sleep(2)  # polite delay
        response = await client.get(url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "lxml")

    # FBref home/away table id pattern: results{year}_{comp}_{n}_homeaway
    table = _parse_table(soup, r"results.*homeaway")
    if not table:
        # Fallback: find any table with home_games data-stat
        for t in soup.find_all("table"):
            if t.find(attrs={"data-stat": "home_games"}):
                table = t
                break

    if not table:
        raise ValueError(f"Could not find home/away table on {url}")

    stats = _parse_homeaway_table(table)
    return [s.to_dict() for s in stats]
