"""
Football ML Prediction Model

Uses Logistic Regression (scikit-learn) trained on finished match results.
At prediction time the model's probabilities are blended with market-implied
probabilities so the result respects both statistical signal and bookmaker wisdom.

Architecture
────────────
  Three binary/multi-class classifiers:
    • _result_clf  : Home / Draw / Away  (3-class LR)
    • _ou_clf      : Over 2.5 / Under    (binary LR)
    • _btts_clf    : BTTS Yes / No       (binary LR)

  Training data  : finished matches (home_stats, away_stats, result, goals)
  Prediction     : blend(ML_prob, implied_prob)  — weighted 55 / 45 by default
  Persistence    : model is pickled to /tmp so it survives hot-reloads
"""

import os
import pickle
from typing import Dict, List, Optional

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.services.feature_engineer import build_features

# ── Constants ─────────────────────────────────────────────────────────────────

MIN_SAMPLES   = 20          # refuse to train below this
MODEL_PATH    = "/tmp/footballedge_ml.pkl"
ODDS_WEIGHT   = 0.50        # weight given to market-implied probabilities in blend


# ── Model class ───────────────────────────────────────────────────────────────

class FootballMLModel:
    """Trained-on-demand Logistic Regression model for match outcome prediction."""

    def __init__(self):
        self._result_clf: Optional[Pipeline] = None
        self._ou_clf:     Optional[Pipeline] = None
        self._btts_clf:   Optional[Pipeline] = None
        self._trained    = False
        self._n_samples  = 0
        self._load()

    # ── Public API ────────────────────────────────────────────────────────────

    def train(self, training_matches: List[Dict]) -> Dict:
        """
        Train all three classifiers on historical match data.

        Each entry in training_matches must be a dict with:
            home_stats  : TeamStatsInput-compatible object
            away_stats  : TeamStatsInput-compatible object
            result      : 'H' | 'D' | 'A'
            home_goals  : int
            away_goals  : int
            h2h         : H2HInput or None  (optional)
        """
        n = len(training_matches)
        if n < MIN_SAMPLES:
            return {"trained": False, "reason": f"Need ≥{MIN_SAMPLES} matches, got {n}"}

        X, y_result, y_ou, y_btts = [], [], [], []
        for m in training_matches:
            feat = build_features(m["home_stats"], m["away_stats"], m.get("h2h"))
            X.append(feat)
            y_result.append(m["result"])                                           # H / D / A
            y_ou.append(1 if m["home_goals"] + m["away_goals"] >= 3 else 0)       # over 2.5
            y_btts.append(1 if m["home_goals"] > 0 and m["away_goals"] > 0 else 0)# btts yes

        X = np.array(X)

        def _make_pipeline() -> Pipeline:
            return Pipeline([
                ("scaler", StandardScaler()),
                ("clf",    LogisticRegression(
                    C=0.3,           # moderate regularisation — keeps variance low with ~40 samples
                    max_iter=1000,
                    random_state=42,
                    multi_class="auto",
                    solver="lbfgs",
                )),
            ])

        self._result_clf = _make_pipeline()
        self._result_clf.fit(X, y_result)

        self._ou_clf = _make_pipeline()
        self._ou_clf.fit(X, y_ou)

        self._btts_clf = _make_pipeline()
        self._btts_clf.fit(X, y_btts)

        self._trained   = True
        self._n_samples = n
        self._save()

        return {"trained": True, "n_samples": n}

    def predict(
        self,
        home_stats,
        away_stats,
        odds_data: Optional[List] = None,
        h2h=None,
    ) -> Dict:
        """
        Return match probabilities.
        Blends ML output with market-implied probabilities (50 / 50 when trained,
        100 % market when not trained).
        """
        implied   = self._implied_probs(odds_data)
        exp_goals = self._expected_goals(home_stats, away_stats)

        if not self._trained:
            return self._build_output(
                implied["home_win"], implied["draw"], implied["away_win"],
                implied["over25"],   implied["btts_yes"],
                exp_goals=exp_goals, model="odds_only", n=0,
            )

        feat = build_features(home_stats, away_stats, h2h).reshape(1, -1)

        # ── 1X2 ──────────────────────────────────────────────────────────────
        res_proba  = self._result_clf.predict_proba(feat)[0]
        res_classes = list(self._result_clf.classes_)
        ml_home = res_proba[res_classes.index("H")] if "H" in res_classes else 0.45
        ml_draw = res_proba[res_classes.index("D")] if "D" in res_classes else 0.25
        ml_away = res_proba[res_classes.index("A")] if "A" in res_classes else 0.30

        # ── Over / Under 2.5 ─────────────────────────────────────────────────
        ou_proba   = self._ou_clf.predict_proba(feat)[0]
        ou_classes = list(self._ou_clf.classes_)
        ml_over25  = ou_proba[ou_classes.index(1)] if 1 in ou_classes else 0.50

        # ── BTTS ─────────────────────────────────────────────────────────────
        bt_proba   = self._btts_clf.predict_proba(feat)[0]
        bt_classes = list(self._btts_clf.classes_)
        ml_btts    = bt_proba[bt_classes.index(1)] if 1 in bt_classes else 0.50

        # ── Blend: ML (1-w) + Market (w) ────────────────────────────────────
        w = ODDS_WEIGHT
        h = (1 - w) * ml_home  + w * implied["home_win"]
        d = (1 - w) * ml_draw  + w * implied["draw"]
        a = (1 - w) * ml_away  + w * implied["away_win"]

        # Renormalise 1X2 to sum to 1
        total = h + d + a
        if total > 0:
            h, d, a = h / total, d / total, a / total

        over25   = (1 - w) * ml_over25 + w * implied["over25"]
        btts_yes = (1 - w) * ml_btts   + w * implied["btts_yes"]

        return self._build_output(h, d, a, over25, btts_yes, exp_goals=exp_goals, model="ml_blend", n=self._n_samples)

    @property
    def is_trained(self) -> bool:
        return self._trained

    @property
    def n_samples(self) -> int:
        return self._n_samples

    # ── Private helpers ───────────────────────────────────────────────────────

    def _implied_probs(self, odds_data: Optional[List]) -> Dict:
        """Extract normalised implied probabilities from best available odds."""
        out = {
            "home_win": 0.45, "draw": 0.25, "away_win": 0.30,
            "over25": 0.50,   "btts_yes": 0.50,
        }
        if not odds_data:
            return out

        home_odds = [o.homeWin  for o in odds_data if o.homeWin  and o.homeWin  > 1.0]
        draw_odds = [o.draw     for o in odds_data if o.draw     and o.draw     > 1.0]
        away_odds = [o.awayWin  for o in odds_data if o.awayWin  and o.awayWin  > 1.0]
        over_odds = [o.overOdds for o in odds_data if o.overOdds and o.overOdds > 1.0]
        btts_odds = [o.bttsYes  for o in odds_data if o.bttsYes  and o.bttsYes  > 1.0]

        if home_odds and draw_odds and away_odds:
            raw   = [1 / max(home_odds), 1 / max(draw_odds), 1 / max(away_odds)]
            total = sum(raw)
            if total > 0:
                out["home_win"], out["draw"], out["away_win"] = (p / total for p in raw)

        if over_odds:
            out["over25"]   = min(1 / max(over_odds), 0.99)
        if btts_odds:
            out["btts_yes"] = min(1 / max(btts_odds), 0.99)

        return out

    def _expected_goals(self, home_stats, away_stats) -> Dict:
        """
        Estimate expected goals from attack/defense rates.
        Uses home/away-specific splits when available, falls back to overall stats.
        """
        try:
            hgp = max(home_stats.matches_played, 1)
            agp = max(away_stats.matches_played, 1)

            h_home_gp = max(home_stats.home_wins + home_stats.home_draws + home_stats.home_losses, 1)
            a_away_gp = max(away_stats.away_wins + away_stats.away_draws + away_stats.away_losses, 1)

            # Use home-specific stats if recorded, else fall back to overall
            h_attack  = (home_stats.home_goals_for      / h_home_gp) if home_stats.home_goals_for      > 0 else (home_stats.goals_for      / hgp)
            a_concede = (away_stats.away_goals_against  / a_away_gp) if away_stats.away_goals_against  > 0 else (away_stats.goals_against  / agp)
            a_attack  = (away_stats.away_goals_for      / a_away_gp) if away_stats.away_goals_for      > 0 else (away_stats.goals_for      / agp)
            h_concede = (home_stats.home_goals_against  / h_home_gp) if home_stats.home_goals_against  > 0 else (home_stats.goals_against  / hgp)

            xg_home  = round((h_attack + a_concede) / 2, 2)
            xg_away  = round((a_attack + h_concede) / 2, 2)
            xg_total = round(xg_home + xg_away, 2)
        except Exception:
            xg_home = xg_away = xg_total = 0.0

        return {"home": xg_home, "away": xg_away, "total": xg_total}

    def _build_output(self, home_win, draw, away_win, over25, btts_yes, exp_goals, model, n) -> Dict:
        return {
            "match_result": {
                "home_win": round(float(home_win), 4),
                "draw":     round(float(draw),     4),
                "away_win": round(float(away_win), 4),
            },
            "over_under": {
                "over_1.5":  0.0,
                "under_1.5": 0.0,
                "over_2.5":  round(float(over25),        4),
                "under_2.5": round(float(1.0 - over25),  4),
                "over_3.5":  0.0,
                "under_3.5": 0.0,
            },
            "btts": {
                "yes": round(float(btts_yes),         4),
                "no":  round(float(1.0 - btts_yes),   4),
            },
            "expected_goals": exp_goals,
            "most_likely_scores": [],
            "model": model,
            "trained_on": n,
        }

    def _save(self):
        try:
            with open(MODEL_PATH, "wb") as f:
                pickle.dump({
                    "result": self._result_clf,
                    "ou":     self._ou_clf,
                    "btts":   self._btts_clf,
                    "n":      self._n_samples,
                }, f)
        except Exception:
            pass

    def _load(self):
        if not os.path.exists(MODEL_PATH):
            return
        try:
            with open(MODEL_PATH, "rb") as f:
                data = pickle.load(f)
            self._result_clf = data["result"]
            self._ou_clf     = data["ou"]
            self._btts_clf   = data["btts"]
            self._n_samples  = data["n"]
            self._trained    = True
        except Exception:
            pass
