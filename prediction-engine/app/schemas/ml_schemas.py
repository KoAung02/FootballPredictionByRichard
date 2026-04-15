"""
ML-specific Pydantic schemas.
Kept separate from schemas/models.py so the existing Poisson endpoint is untouched.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.schemas.models import TeamStatsInput, OddsInput


# ── H2H input ─────────────────────────────────────────────────────────────────

class H2HInput(BaseModel):
    home_wins:     int   = 0
    away_wins:     int   = 0
    draws:         int   = 0
    total_matches: int   = 0
    avg_goals:     float = 0.0


# ── Training data ─────────────────────────────────────────────────────────────

class TrainingMatch(BaseModel):
    home_stats: TeamStatsInput
    away_stats: TeamStatsInput
    result:     str           # "H" | "D" | "A"
    home_goals: int
    away_goals: int
    h2h:        Optional[H2HInput] = None
    odds_data:  List[OddsInput]    = []


# ── /train request ────────────────────────────────────────────────────────────

class TrainRequest(BaseModel):
    matches:          List[TrainingMatch]
    league_avg_goals: float = Field(default=2.7, gt=0)


# ── /predict/ml request ───────────────────────────────────────────────────────

class MLPredictRequest(BaseModel):
    match_id:         int
    home_team_name:   str
    away_team_name:   str
    home_team_stats:  TeamStatsInput
    away_team_stats:  TeamStatsInput
    league_slug:      Optional[str]  = None
    league_avg_goals: float          = Field(default=2.7, gt=0)
    home_form:        str            = ""
    away_form:        str            = ""
    odds_data:        List[OddsInput] = []
    h2h:              Optional[H2HInput] = None


# ── Shared response (same shape as Poisson so TipGenerator works unchanged) ──

class MLPredictResponse(BaseModel):
    match_id:          int
    ml_prediction:     Dict[str, Any]
    value_bets:        List[Dict[str, Any]]
    tips:              List[Dict[str, Any]]
    model_info:        Dict[str, Any]
