"""
Feature Engineering for the ML Prediction Model

Converts raw TeamStatsInput objects into a fixed-length numpy feature vector.
Odds are NOT included here — they are blended separately at prediction time
so training data (no historical odds) and prediction data (has odds) stay compatible.
"""

import numpy as np


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    return float(a) / float(b) if b != 0 else default


def _encode_form(form_str: str) -> float:
    """
    Convert a form string (e.g. 'WWDLL') to a weighted score in [0, 1].
    Most recent result has highest weight. W=1.0, D=0.5, L=0.0.
    Returns 0.5 (neutral) when form is unavailable.
    """
    if not form_str:
        return 0.5
    weights = [0.35, 0.25, 0.20, 0.12, 0.08]
    score = total_w = 0.0
    for i, ch in enumerate(reversed(form_str[-5:])):
        w = weights[i] if i < len(weights) else 0.05
        if ch in ("W", "w"):
            score += w
        elif ch in ("D", "d"):
            score += w * 0.5
        total_w += w
    return score / total_w if total_w > 0 else 0.5


# ── Main feature builder ──────────────────────────────────────────────────────

FEATURE_NAMES = [
    "home_home_attack",        # 0  goals per home game (home team)
    "home_home_defense",       # 1  conceded per home game (home team)
    "home_home_win_rate",      # 2
    "away_away_attack",        # 3  goals per away game (away team)
    "away_away_defense",       # 4  conceded per away game (away team)
    "away_away_win_rate",      # 5
    "home_overall_win_rate",   # 6
    "home_draw_rate",          # 7
    "away_overall_win_rate",   # 8
    "away_draw_rate",          # 9
    "home_form",               # 10 weighted form score [0, 1]
    "away_form",               # 11
    "home_btts_rate",          # 12
    "away_btts_rate",          # 13
    "home_over25_rate",        # 14
    "away_over25_rate",        # 15
    "home_clean_sheet_rate",   # 16
    "away_clean_sheet_rate",   # 17
    "elo_diff_norm",           # 18 (home_elo - away_elo) / 400
    "h2h_home_win_rate",       # 19 prior = 0.45 when no H2H data
    "h2h_avg_goals_norm",      # 20 avg goals / 5 (normalised)
]

N_FEATURES = len(FEATURE_NAMES)  # 21


def build_features(home_stats, away_stats, h2h=None) -> np.ndarray:
    """
    Build a 21-element float32 feature vector for one match.

    Args:
        home_stats: TeamStatsInput (or any object with the same attributes)
        away_stats: TeamStatsInput
        h2h:        H2HInput or None

    Returns:
        np.ndarray of shape (21,), dtype float32
    """
    hs  = home_stats
    aws = away_stats

    hgp = max(hs.matches_played, 1)
    agp = max(aws.matches_played, 1)

    # ── Home team — home-specific ─────────────────────────────────────────
    h_home_gp  = max(hs.home_wins + hs.home_draws + hs.home_losses, 1)
    h_home_atk = _safe_div(hs.home_goals_for,     h_home_gp)
    h_home_def = _safe_div(hs.home_goals_against, h_home_gp)
    h_home_wr  = _safe_div(hs.home_wins,          h_home_gp)

    # ── Away team — away-specific ─────────────────────────────────────────
    a_away_gp  = max(aws.away_wins + aws.away_draws + aws.away_losses, 1)
    a_away_atk = _safe_div(aws.away_goals_for,     a_away_gp)
    a_away_def = _safe_div(aws.away_goals_against, a_away_gp)
    a_away_wr  = _safe_div(aws.away_wins,          a_away_gp)

    # ── Overall win/draw rates ────────────────────────────────────────────
    h_win_rate  = _safe_div(hs.wins,  hgp)
    h_draw_rate = _safe_div(hs.draws, hgp)
    a_win_rate  = _safe_div(aws.wins,  agp)
    a_draw_rate = _safe_div(aws.draws, agp)

    # ── Form ─────────────────────────────────────────────────────────────
    h_form = _encode_form(hs.form  if hs.form  else "")
    a_form = _encode_form(aws.form if aws.form else "")

    # ── Specialty rates ───────────────────────────────────────────────────
    h_btts   = float(hs.btts_rate)   if hs.btts_rate   is not None else 0.5
    a_btts   = float(aws.btts_rate)  if aws.btts_rate  is not None else 0.5
    h_over25 = float(hs.over25_rate) if hs.over25_rate is not None else 0.5
    a_over25 = float(aws.over25_rate)if aws.over25_rate is not None else 0.5
    h_clean  = _safe_div(hs.clean_sheets,  hgp)
    a_clean  = _safe_div(aws.clean_sheets, agp)

    # ── ELO ───────────────────────────────────────────────────────────────
    elo_diff = (float(hs.elo_rating) - float(aws.elo_rating)) / 400.0

    # ── H2H (prior = slight home advantage when unavailable) ─────────────
    h2h_home_wr   = 0.45
    h2h_avg_goals = 2.7 / 5.0   # normalised by dividing by 5
    if h2h is not None and getattr(h2h, "total_matches", 0) >= 3:
        h2h_home_wr   = _safe_div(h2h.home_wins, h2h.total_matches, default=0.45)
        h2h_avg_goals = min(float(h2h.avg_goals) / 5.0, 1.0)

    return np.array([
        h_home_atk, h_home_def, h_home_wr,
        a_away_atk, a_away_def, a_away_wr,
        h_win_rate, h_draw_rate,
        a_win_rate, a_draw_rate,
        h_form, a_form,
        h_btts, a_btts,
        h_over25, a_over25,
        h_clean, a_clean,
        elo_diff,
        h2h_home_wr, h2h_avg_goals,
    ], dtype=np.float32)
