"""
Pydantic request / response schemas for the prediction engine.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Request ────────────────────────────────────────────────────────────────────

class TeamStatsInput(BaseModel):
    team_id: int = 0
    matches_played: int = Field(default=1, ge=1)
    goals_for: int = Field(default=0, ge=0)
    goals_against: int = Field(default=0, ge=0)
    wins: int = 0
    draws: int = 0
    losses: int = 0
    home_wins: int = 0
    home_draws: int = 0
    home_losses: int = 0
    home_goals_for: int = 0
    home_goals_against: int = 0
    away_wins: int = 0
    away_draws: int = 0
    away_losses: int = 0
    away_goals_for: int = 0
    away_goals_against: int = 0
    elo_rating: float = 1500.0
    form: str = ""
    xg: Optional[float] = None
    clean_sheets: int = 0
    btts_rate: float = 0.5
    over25_rate: float = 0.5


class OddsInput(BaseModel):
    bookmaker: str
    market: str  # "1X2" | "OU25" | "BTTS"
    homeWin: Optional[float] = None
    draw: Optional[float] = None
    awayWin: Optional[float] = None
    overLine: Optional[float] = None
    overOdds: Optional[float] = None
    underOdds: Optional[float] = None
    bttsYes: Optional[float] = None
    bttsNo: Optional[float] = None


class MatchPredictionRequest(BaseModel):
    match_id: int
    home_team_name: str
    away_team_name: str
    home_team_stats: TeamStatsInput
    away_team_stats: TeamStatsInput
    league_slug: Optional[str] = None
    league_avg_goals: float = Field(default=2.7, gt=0)
    home_form: str = ""
    away_form: str = ""
    odds_data: List[OddsInput] = []


# ── Response ───────────────────────────────────────────────────────────────────

class MatchPredictionResponse(BaseModel):
    match_id: int
    poisson_prediction: Dict[str, Any]
    value_bets: List[Dict[str, Any]]
    tips: List[Dict[str, Any]]
