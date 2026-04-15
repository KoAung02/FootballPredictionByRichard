"""
Value Bet Detection

A "value bet" exists when our calculated probability is HIGHER than what the
bookmaker odds imply.

Example:
    Our model: Arsenal win probability = 62%
    Best odds: 1.70  →  implied probability = 1/1.70 = 58.8%
    Edge: 62% - 58.8% = 3.2%  →  VALUE BET

The Kelly Criterion is used to suggest an optimal stake size based on edge.
"""

from typing import Dict, List, Optional


class ValueDetector:
    def __init__(self, min_value_threshold: float = 0.03):
        """
        Args:
            min_value_threshold: Minimum edge (as decimal) to flag as value.
                                 0.03 = 3% edge minimum.
        """
        self.min_value_threshold = min_value_threshold

    # ── Helpers ──────────────────────────────────────────────────────────────

    def odds_to_implied_probability(self, decimal_odds: float) -> float:
        """Convert decimal odds to implied probability."""
        if decimal_odds <= 1.0:
            return 0.0
        return 1.0 / decimal_odds

    def _kelly_criterion(self, probability: float, odds: float) -> float:
        """
        Fractional Kelly (25%) criterion.

        f* = (b*p - q) / b  where  b = odds - 1, p = our prob, q = 1 - p.
        Capped at 10% of bankroll.
        """
        b = odds - 1.0
        if b <= 0:
            return 0.0
        q = 1.0 - probability
        kelly = (b * probability - q) / b
        fractional = kelly * 0.25
        return round(max(0.0, min(fractional, 0.10)), 4)

    # ── Main method ──────────────────────────────────────────────────────────

    def find_value_bets(
        self,
        poisson_prediction: Dict,
        odds_data: List[Dict],
    ) -> List[Dict]:
        """
        Compare Poisson probabilities against bookmaker odds to find value.

        Args:
            poisson_prediction: Output from PoissonModel.get_match_probabilities().
            odds_data: List of odds dicts, each with keys matching the Odds
                       database model (bookmaker, market, homeWin, draw, awayWin,
                       overLine, overOdds, underOdds, bttsYes, bttsNo).

        Returns:
            List of value-bet dicts sorted by edge descending.
        """
        value_bets: List[Dict] = []
        mr  = poisson_prediction["match_result"]
        ou  = poisson_prediction.get("over_under", {})
        bts = poisson_prediction.get("btts", {})

        for odds in odds_data:
            bookmaker = odds.get("bookmaker", "unknown")

            # ── 1X2 ──────────────────────────────────────────────────────
            self._check_value(
                value_bets,
                our_prob=mr["home_win"],
                raw_odds=odds.get("homeWin"),
                market="1X2",
                selection="Home Win",
                bookmaker=bookmaker,
            )
            self._check_value(
                value_bets,
                our_prob=mr["draw"],
                raw_odds=odds.get("draw"),
                market="1X2",
                selection="Draw",
                bookmaker=bookmaker,
            )
            self._check_value(
                value_bets,
                our_prob=mr["away_win"],
                raw_odds=odds.get("awayWin"),
                market="1X2",
                selection="Away Win",
                bookmaker=bookmaker,
            )

            # ── Over / Under 2.5 ─────────────────────────────────────────
            if ou.get("over_2.5") is not None:
                self._check_value(
                    value_bets,
                    our_prob=ou["over_2.5"],
                    raw_odds=odds.get("overOdds"),
                    market="Over/Under",
                    selection=f"Over {odds.get('overLine', 2.5)}",
                    bookmaker=bookmaker,
                )
                self._check_value(
                    value_bets,
                    our_prob=ou["under_2.5"],
                    raw_odds=odds.get("underOdds"),
                    market="Over/Under",
                    selection=f"Under {odds.get('overLine', 2.5)}",
                    bookmaker=bookmaker,
                )

            # ── BTTS ─────────────────────────────────────────────────────
            if bts.get("yes") is not None:
                self._check_value(
                    value_bets,
                    our_prob=bts["yes"],
                    raw_odds=odds.get("bttsYes"),
                    market="BTTS",
                    selection="Yes",
                    bookmaker=bookmaker,
                )
                self._check_value(
                    value_bets,
                    our_prob=bts["no"],
                    raw_odds=odds.get("bttsNo"),
                    market="BTTS",
                    selection="No",
                    bookmaker=bookmaker,
                )

        value_bets.sort(key=lambda x: x["edge"], reverse=True)
        return value_bets

    # ── Private ───────────────────────────────────────────────────────────────

    def _check_value(
        self,
        value_bets: List[Dict],
        our_prob: float,
        raw_odds: Optional[float],
        market: str,
        selection: str,
        bookmaker: str,
    ) -> None:
        """Append a value-bet entry if edge exceeds the threshold."""
        if not raw_odds:
            return
        implied = self.odds_to_implied_probability(raw_odds)
        edge = our_prob - implied
        if edge >= self.min_value_threshold:
            value_bets.append(
                {
                    "market": market,
                    "selection": selection,
                    "our_probability": round(our_prob, 4),
                    "implied_probability": round(implied, 4),
                    "edge": round(edge, 4),
                    "odds": raw_odds,
                    "bookmaker": bookmaker,
                    "kelly_stake": self._kelly_criterion(our_prob, raw_odds),
                }
            )
