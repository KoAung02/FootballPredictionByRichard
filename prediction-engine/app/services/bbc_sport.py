"""
BBC Sport scraper — fetches league standings (overall stats + form).

Home/away splits are not available via BBC Sport HTML, so they are
calculated separately from match history in the TypeScript job.
"""

import asyncio
import re
from typing import Dict, List

import httpx
from bs4 import BeautifulSoup

# ── League URL mapping ────────────────────────────────────────────────────────

BBC_URLS: Dict[str, str] = {
    "premier-league":   "https://www.bbc.com/sport/football/premier-league/table",
    "la-liga":          "https://www.bbc.com/sport/football/spanish-la-liga/table",
    "serie-a":          "https://www.bbc.com/sport/football/italian-serie-a/table",
    "bundesliga":       "https://www.bbc.com/sport/football/german-bundesliga/table",
    "champions-league": "https://www.bbc.com/sport/football/european-champions-league/table",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def _safe_int(val: str) -> int:
    try:
        return int(val.strip())
    except (ValueError, AttributeError):
        return 0


def _parse_form(raw: str) -> str:
    """Extract W/D/L characters from BBC's verbose form string."""
    letters = re.findall(r'[WDL](?=Result)', raw)
    return "".join(letters[-6:])  # last 6 results


def _parse_table(soup: BeautifulSoup) -> List[Dict]:
    table = soup.find("table")
    if not table:
        return []

    results = []
    rows = table.find_all("tr")

    for row in rows[1:]:  # skip header row
        cells = row.find_all(["td", "th"])
        if len(cells) < 9:
            continue

        # Team name — BBC prepends rank number e.g. "1Arsenal"
        team_raw = cells[0].get_text(strip=True)
        team_name = re.sub(r"^\d+", "", team_raw).strip()

        played      = _safe_int(cells[1].get_text())
        won         = _safe_int(cells[2].get_text())
        drawn       = _safe_int(cells[3].get_text())
        lost        = _safe_int(cells[4].get_text())
        goals_for   = _safe_int(cells[5].get_text())
        goals_against = _safe_int(cells[6].get_text())
        form_raw    = cells[9].get_text() if len(cells) > 9 else ""
        form        = _parse_form(form_raw)

        results.append({
            "team_name":      team_name,
            "matches_played": played,
            "wins":           won,
            "draws":          drawn,
            "losses":         lost,
            "goals_for":      goals_for,
            "goals_against":  goals_against,
            "form":           form,
        })

    return results


async def scrape_standings(league_slug: str) -> List[Dict]:
    url = BBC_URLS.get(league_slug)
    if not url:
        raise ValueError(f"Unknown league slug: {league_slug}")

    await asyncio.sleep(1)
    async with httpx.AsyncClient(headers=HEADERS, timeout=30, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "lxml")
    data = _parse_table(soup)

    if not data:
        raise ValueError(f"No standings data found for {league_slug}")

    return data
