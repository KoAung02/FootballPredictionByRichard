"""
Poisson Distribution Model for Football Score Prediction

How it works:
1. Calculate Attack Strength = Team's goals scored / League average goals scored
2. Calculate Defense Strength = Team's goals conceded / League average goals conceded
3. Expected Goals (lambda) = Attack Strength × Opponent Defense Strength × League Avg × Home Factor
4. Use Poisson PMF to get probability of each scoreline (0-0 through 6-6)
5. Sum scoreline probabilities to get market probabilities (1X2, O/U, BTTS, etc.)
"""

import numpy as np
from scipy.stats import poisson
from typing import Dict, List, Tuple


class PoissonModel:
    def __init__(self, home_advantage: float = 1.25, max_goals: int = 7):
        """
        Args:
            home_advantage: Multiplier for home team expected goals.
                            Historical average across top leagues is ~1.2-1.3.
            max_goals: Max goals per team when building the scoreline matrix.
        """
        self.home_advantage = home_advantage
        self.max_goals = max_goals

    def calculate_expected_goals(
        self,
        home_attack: float,
        home_defense: float,
        away_attack: float,
        away_defense: float,
        league_avg_goals: float,
    ) -> Tuple[float, float]:
        """
        Calculate expected goals (lambda) for each team.

        Formula:
            home_lambda = (home_attack_strength × away_defense_weakness × league_avg/2) × home_advantage
            away_lambda =  away_attack_strength × home_defense_weakness × league_avg/2

        Where:
            attack_strength  = team_goals_scored_per_game   / league_avg_scored_per_game
            defense_weakness = opponent_goals_conceded_per_game / league_avg_conceded_per_game
        """
        league_avg_per_team = league_avg_goals / 2
        if league_avg_per_team == 0:
            league_avg_per_team = 1.35  # typical European league average per side

        home_attack_strength  = home_attack  / league_avg_per_team
        away_defense_weakness = away_defense / league_avg_per_team
        away_attack_strength  = away_attack  / league_avg_per_team
        home_defense_weakness = home_defense / league_avg_per_team

        home_lambda = (
            home_attack_strength
            * away_defense_weakness
            * league_avg_per_team
            * self.home_advantage
        )
        away_lambda = away_attack_strength * home_defense_weakness * league_avg_per_team

        # Clamp to a sensible range
        home_lambda = float(np.clip(home_lambda, 0.2, 4.5))
        away_lambda = float(np.clip(away_lambda, 0.2, 4.5))

        return home_lambda, away_lambda

    def predict_scoreline_matrix(
        self, home_lambda: float, away_lambda: float
    ) -> np.ndarray:
        """
        Build a (max_goals × max_goals) matrix where cell [i][j] = P(home=i, away=j).
        Home and away goals are treated as independent Poisson variables.
        """
        home_probs = [poisson.pmf(i, home_lambda) for i in range(self.max_goals)]
        away_probs = [poisson.pmf(i, away_lambda) for i in range(self.max_goals)]
        return np.outer(home_probs, away_probs)

    def get_match_probabilities(
        self,
        home_attack: float,
        home_defense: float,
        away_attack: float,
        away_defense: float,
        league_avg_goals: float,
    ) -> Dict:
        """
        Main method: returns probabilities for all betting markets.
        """
        home_lambda, away_lambda = self.calculate_expected_goals(
            home_attack, home_defense, away_attack, away_defense, league_avg_goals
        )

        matrix = self.predict_scoreline_matrix(home_lambda, away_lambda)

        # ── 1X2 ──────────────────────────────────────────────────────────────
        home_win_prob = draw_prob = away_win_prob = 0.0
        for i in range(self.max_goals):
            for j in range(self.max_goals):
                if i > j:
                    home_win_prob += matrix[i][j]
                elif i == j:
                    draw_prob += matrix[i][j]
                else:
                    away_win_prob += matrix[i][j]

        # ── Over / Under ─────────────────────────────────────────────────────
        total_goals_probs: Dict[int, float] = {}
        for total in range(self.max_goals * 2):
            prob = 0.0
            for i in range(self.max_goals):
                j = total - i
                if 0 <= j < self.max_goals:
                    prob += matrix[i][j]
            total_goals_probs[total] = prob

        over_15 = sum(v for k, v in total_goals_probs.items() if k >= 2)
        over_25 = sum(v for k, v in total_goals_probs.items() if k >= 3)
        over_35 = sum(v for k, v in total_goals_probs.items() if k >= 4)

        # ── BTTS ─────────────────────────────────────────────────────────────
        btts_yes = sum(
            matrix[i][j]
            for i in range(1, self.max_goals)
            for j in range(1, self.max_goals)
        )
        btts_no = 1.0 - btts_yes

        # ── Most likely scorelines ────────────────────────────────────────────
        scorelines: List[Dict] = []
        for i in range(self.max_goals):
            for j in range(self.max_goals):
                scorelines.append({"score": f"{i}-{j}", "probability": float(matrix[i][j])})
        scorelines.sort(key=lambda x: x["probability"], reverse=True)

        return {
            "expected_goals": {
                "home": round(home_lambda, 2),
                "away": round(away_lambda, 2),
                "total": round(home_lambda + away_lambda, 2),
            },
            "match_result": {
                "home_win": round(float(home_win_prob), 4),
                "draw":     round(float(draw_prob), 4),
                "away_win": round(float(away_win_prob), 4),
            },
            "over_under": {
                "over_1.5":  round(float(over_15), 4),
                "under_1.5": round(float(1 - over_15), 4),
                "over_2.5":  round(float(over_25), 4),
                "under_2.5": round(float(1 - over_25), 4),
                "over_3.5":  round(float(over_35), 4),
                "under_3.5": round(float(1 - over_35), 4),
            },
            "btts": {
                "yes": round(float(btts_yes), 4),
                "no":  round(float(btts_no), 4),
            },
            "most_likely_scores": scorelines[:10],
            "model": "poisson",
        }
