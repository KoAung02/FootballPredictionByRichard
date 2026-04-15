"""
Tests for the /predict endpoint and the individual Phase-2 models.

Run with:
    cd prediction-engine
    pytest tests/test_predict.py -v
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.poisson import PoissonModel
from app.services.value_detector import ValueDetector
from app.services.tip_generator import TipGenerator

client = TestClient(app)

# ── Shared fixtures ────────────────────────────────────────────────────────────

SAMPLE_HOME_STATS = {
    "team_id": 1,
    "matches_played": 20,
    "goals_for": 36,       # 1.80 per game
    "goals_against": 18,   # 0.90 per game
    "wins": 12,
    "draws": 4,
    "losses": 4,
    "home_wins": 8,
    "home_draws": 2,
    "home_losses": 0,
    "home_goals_for": 20,
    "home_goals_against": 8,
    "away_wins": 4,
    "away_draws": 2,
    "away_losses": 4,
    "away_goals_for": 16,
    "away_goals_against": 10,
    "elo_rating": 1650.0,
    "form": "WWDWW",
    "clean_sheets": 7,
    "btts_rate": 0.45,
    "over25_rate": 0.65,
}

SAMPLE_AWAY_STATS = {
    "team_id": 2,
    "matches_played": 20,
    "goals_for": 22,       # 1.10 per game
    "goals_against": 30,   # 1.50 per game
    "wins": 6,
    "draws": 5,
    "losses": 9,
    "home_wins": 4,
    "home_draws": 3,
    "home_losses": 3,
    "home_goals_for": 12,
    "home_goals_against": 14,
    "away_wins": 2,
    "away_draws": 2,
    "away_losses": 6,
    "away_goals_for": 10,
    "away_goals_against": 16,
    "elo_rating": 1450.0,
    "form": "LLDWL",
    "clean_sheets": 3,
    "btts_rate": 0.55,
    "over25_rate": 0.50,
}

SAMPLE_ODDS = [
    {
        "bookmaker": "bet365",
        "market": "1X2",
        "homeWin": 1.65,   # implied ~60.6%  → value if our prob > 60.6%
        "draw": 3.60,
        "awayWin": 5.50,
    },
    {
        "bookmaker": "bet365",
        "market": "OU25",
        "overLine": 2.5,
        "overOdds": 1.80,  # implied ~55.6%
        "underOdds": 2.05,
    },
    {
        "bookmaker": "bet365",
        "market": "BTTS",
        "bttsYes": 1.90,
        "bttsNo": 1.90,
    },
]

PREDICT_PAYLOAD = {
    "match_id": 999,
    "home_team_name": "Arsenal",
    "away_team_name": "Southampton",
    "home_team_stats": SAMPLE_HOME_STATS,
    "away_team_stats": SAMPLE_AWAY_STATS,
    "league_slug": "premier-league",
    "league_avg_goals": 2.7,
    "home_form": "WWDWW",
    "away_form": "LLDWL",
    "odds_data": SAMPLE_ODDS,
}


# ── Health check ───────────────────────────────────────────────────────────────

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["models_loaded"]["poisson"] is True


# ── /predict endpoint ──────────────────────────────────────────────────────────

def test_predict_returns_200():
    response = client.post("/predict", json=PREDICT_PAYLOAD)
    assert response.status_code == 200, response.text


def test_predict_response_shape():
    response = client.post("/predict", json=PREDICT_PAYLOAD)
    data = response.json()

    assert data["match_id"] == 999
    assert "poisson_prediction" in data
    assert "value_bets" in data
    assert "tips" in data


def test_predict_poisson_output():
    response = client.post("/predict", json=PREDICT_PAYLOAD)
    pred = response.json()["poisson_prediction"]

    mr = pred["match_result"]
    # Tolerance of 0.02 accounts for rounding of three independent 4dp values
    assert abs(mr["home_win"] + mr["draw"] + mr["away_win"] - 1.0) < 0.02

    eg = pred["expected_goals"]
    assert eg["home"] > 0
    assert eg["away"] > 0
    assert abs(eg["total"] - eg["home"] - eg["away"]) < 0.01

    ou = pred["over_under"]
    for key in ("over_2.5", "under_2.5"):
        assert 0 <= ou[key] <= 1

    btts = pred["btts"]
    assert abs(btts["yes"] + btts["no"] - 1.0) < 0.01

    assert len(pred["most_likely_scores"]) == 10


def test_predict_tips_exist():
    response = client.post("/predict", json=PREDICT_PAYLOAD)
    tips = response.json()["tips"]
    # Strong home favourite – at least a 1X2 tip should be generated
    assert len(tips) >= 1
    tip_types = {t["tip_type"] for t in tips}
    assert "1X2" in tip_types


def test_predict_tip_fields():
    response = client.post("/predict", json=PREDICT_PAYLOAD)
    for tip in response.json()["tips"]:
        assert "prediction" in tip
        assert "confidence" in tip
        assert 0 <= tip["confidence"] <= 100
        assert "suggested_stake" in tip
        assert 1 <= tip["suggested_stake"] <= 5
        assert "reasoning" in tip
        assert isinstance(tip["reasoning"], list)


def test_predict_no_odds_still_works():
    payload = {**PREDICT_PAYLOAD, "odds_data": []}
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["value_bets"] == []
    # Tips should still be generated (no odds required for tip generation)
    assert len(data["tips"]) >= 1


def test_predict_invalid_payload_returns_422():
    response = client.post("/predict", json={"match_id": "not-a-number"})
    assert response.status_code == 422


# ── PoissonModel unit tests ────────────────────────────────────────────────────

class TestPoissonModel:
    def setup_method(self):
        self.model = PoissonModel(home_advantage=1.25, max_goals=7)

    def test_expected_goals_reasonable(self):
        home_l, away_l = self.model.calculate_expected_goals(
            home_attack=1.80, home_defense=0.90,
            away_attack=1.10, away_defense=1.50,
            league_avg_goals=2.7,
        )
        assert 0.2 <= home_l <= 4.5
        assert 0.2 <= away_l <= 4.5
        # Strong home team should have higher lambda
        assert home_l > away_l

    def test_scoreline_matrix_sums_to_one(self):
        import numpy as np
        matrix = self.model.predict_scoreline_matrix(1.5, 1.2)
        assert abs(matrix.sum() - 1.0) < 0.02  # small residual for truncated tails

    def test_match_probabilities_sum_to_one(self):
        result = self.model.get_match_probabilities(
            home_attack=1.5, home_defense=1.0,
            away_attack=1.2, away_defense=1.3,
            league_avg_goals=2.7,
        )
        mr = result["match_result"]
        assert abs(mr["home_win"] + mr["draw"] + mr["away_win"] - 1.0) < 0.01

    def test_model_tag(self):
        result = self.model.get_match_probabilities(1.5, 1.0, 1.2, 1.3, 2.7)
        assert result["model"] == "poisson"


# ── ValueDetector unit tests ───────────────────────────────────────────────────

class TestValueDetector:
    def setup_method(self):
        self.detector = ValueDetector(min_value_threshold=0.03)

    def _make_poisson_pred(self, home_win=0.65, draw=0.20, away_win=0.15):
        return {
            "match_result": {"home_win": home_win, "draw": draw, "away_win": away_win},
            "over_under": {"over_2.5": 0.58, "under_2.5": 0.42},
            "btts": {"yes": 0.48, "no": 0.52},
        }

    def test_detects_value_on_home_win(self):
        pred = self._make_poisson_pred(home_win=0.65)
        odds = [{"bookmaker": "bet365", "homeWin": 1.70}]  # implied ~58.8%
        bets = self.detector.find_value_bets(pred, odds)
        assert any(b["selection"] == "Home Win" for b in bets)

    def test_no_value_when_odds_fair(self):
        pred = self._make_poisson_pred(home_win=0.55)
        odds = [{"bookmaker": "bet365", "homeWin": 1.70}]  # implied ~58.8% > 55%
        bets = self.detector.find_value_bets(pred, odds)
        assert not any(b["selection"] == "Home Win" for b in bets)

    def test_sorted_by_edge_descending(self):
        pred = self._make_poisson_pred(home_win=0.70, draw=0.20, away_win=0.10)
        odds = [
            {"bookmaker": "b1", "homeWin": 1.55, "draw": 5.00},
        ]
        bets = self.detector.find_value_bets(pred, odds)
        edges = [b["edge"] for b in bets]
        assert edges == sorted(edges, reverse=True)

    def test_kelly_stake_capped(self):
        stake = self.detector._kelly_criterion(0.90, 10.0)
        assert stake <= 0.10

    def test_kelly_stake_non_negative(self):
        stake = self.detector._kelly_criterion(0.10, 2.0)
        assert stake >= 0.0


# ── TipGenerator unit tests ────────────────────────────────────────────────────

class TestTipGenerator:
    def setup_method(self):
        self.generator = TipGenerator()
        self.match_info = {
            "home_team_name": "Arsenal",
            "away_team_name": "Southampton",
            "home_form": "WWDWW",
            "away_form": "LLDWL",
        }

    def _make_prediction(self):
        return {
            "match_result": {"home_win": 0.62, "draw": 0.22, "away_win": 0.16},
            "over_under": {"over_2.5": 0.60, "under_2.5": 0.40},
            "btts": {"yes": 0.44, "no": 0.56},
            "expected_goals": {"home": 1.85, "away": 0.95, "total": 2.80},
        }

    def test_generates_at_least_one_tip(self):
        tips = self.generator.generate_tips(self.match_info, self._make_prediction(), [])
        assert len(tips) >= 1

    def test_1x2_tip_is_home_win(self):
        tips = self.generator.generate_tips(self.match_info, self._make_prediction(), [])
        tip_1x2 = next((t for t in tips if t["tip_type"] == "1X2"), None)
        assert tip_1x2 is not None
        assert tip_1x2["prediction"] == "Home Win"

    def test_tip_confidence_range(self):
        tips = self.generator.generate_tips(self.match_info, self._make_prediction(), [])
        for tip in tips:
            assert 0 <= tip["confidence"] <= 100

    def test_tip_stake_range(self):
        tips = self.generator.generate_tips(self.match_info, self._make_prediction(), [])
        for tip in tips:
            assert 1 <= tip["suggested_stake"] <= 5

    def test_reasoning_is_list_of_strings(self):
        tips = self.generator.generate_tips(self.match_info, self._make_prediction(), [])
        for tip in tips:
            assert isinstance(tip["reasoning"], list)
            assert all(isinstance(r, str) for r in tip["reasoning"])

    def test_low_probability_no_1x2_tip(self):
        # Draw at 38% is borderline; home/away both below 40% → no 1X2 tip
        pred = {
            "match_result": {"home_win": 0.35, "draw": 0.38, "away_win": 0.27},
            "over_under": {"over_2.5": 0.50, "under_2.5": 0.50},
            "btts": {"yes": 0.50, "no": 0.50},
            "expected_goals": {"home": 1.2, "away": 1.1, "total": 2.3},
        }
        tips = self.generator.generate_tips(self.match_info, pred, [])
        assert not any(t["tip_type"] == "1X2" for t in tips)
