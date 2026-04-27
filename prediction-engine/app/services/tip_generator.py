"""
Tip Generator – The Final Output Layer

Takes Poisson predictions + value bets and produces human-readable tips with
confidence levels, reasoning, and suggested stakes.

Note: In Phase 2 we use Poisson as the sole model. The ensemble combiner
(Phase 2 steps 9-10) will replace `poisson_prediction` with an ensemble dict
that shares the same shape (match_result, over_under, btts keys).
"""

import math
from typing import Dict, List, Optional


class TipGenerator:
    # ── Public ───────────────────────────────────────────────────────────────

    CONFIDENCE_THRESHOLD = 65.0

    def generate_tips(
        self,
        match_info: Dict,
        prediction: Dict,
        value_bets: List[Dict],
        odds_data: List[Dict] = [],
    ) -> List[Dict]:
        """
        Conservative tip selection — one or more tips per match.

        Always generates exactly one match result tip:
          - 1X2 if best outcome prob > 0.70
          - Otherwise Double Chance: 1X if (home+draw) > (away+draw), else 2X

        Additionally generates:
          - Over/Under 2.5 if prob > 0.65
          - BTTS if both teams BTTS rate >= 50% and prob > 0.65
        """
        tips: List[Dict] = []
        mr  = prediction["match_result"]
        ou  = prediction.get("over_under", {})
        bts = prediction.get("btts", {})
        eg  = prediction.get("expected_goals", {})

        home_prob = mr.get("home_win", 0)
        draw_prob = mr.get("draw",     0)
        away_prob = mr.get("away_win", 0)
        best_outcome, best_prob = max(mr.items(), key=lambda x: x[1])

        # ── Match result: 1X2 or Double Chance ───────────────────────────────
        if best_prob > 0.70:
            label_map      = {"home_win": "Home Win", "draw": "Draw", "away_win": "Away Win"}
            odds_field_map = {"home_win": "homeWin", "draw": "draw", "away_win": "awayWin"}
            selection_label = label_map[best_outcome]
            matching_vb = [vb for vb in value_bets if vb["market"] == "1X2" and vb["selection"] == selection_label]
            confidence  = self._calculate_confidence(best_prob, matching_vb, match_info)
            if confidence >= self.CONFIDENCE_THRESHOLD:
                tips.append(self._build_tip(
                    tip_type="1X2",
                    prediction=selection_label,
                    confidence=confidence,
                    calc_prob=best_prob,
                    value_bet=matching_vb[0] if matching_vb else None,
                    reasoning=self._build_1x2_reasoning(best_outcome, match_info, eg, prediction),
                    model_breakdown={"match_result": mr},
                    estimated_odds=self._best_odds(odds_data, odds_field_map[best_outcome]),
                ))
        else:
            # Double Chance: compare combined probabilities
            one_x_prob = home_prob + draw_prob   # 1X
            two_x_prob = away_prob + draw_prob   # 2X
            if one_x_prob >= two_x_prob:
                dc_sel, dc_prob = "1X", one_x_prob
            else:
                dc_sel, dc_prob = "2X", two_x_prob

            dc_vb      = [vb for vb in value_bets if vb.get("market") == "Double Chance" and vb.get("selection") == dc_sel]
            confidence = self._calculate_confidence(dc_prob, dc_vb, match_info)
            if confidence >= self.CONFIDENCE_THRESHOLD:
                tips.append(self._build_tip(
                    tip_type="DOUBLE_CHANCE",
                    prediction=dc_sel,
                    confidence=confidence,
                    calc_prob=dc_prob,
                    value_bet=dc_vb[0] if dc_vb else None,
                    reasoning=self._build_dc_reasoning(dc_sel, match_info, home_prob, draw_prob, away_prob),
                    model_breakdown={"match_result": mr},
                    estimated_odds=round(1.0 / dc_prob, 2) if dc_prob > 0 else None,
                ))

        # ── Over 2.5 or Under 3.5 ────────────────────────────────────────────
        if ou.get("over_2.5") is not None:
            over25_prob = ou["over_2.5"]

            # Under 3.5: P(goals <= 3) via Poisson from expected goals
            xg_total    = eg.get("total", 0) or 0
            under35_prob = self._poisson_under_prob(xg_total, 3) if xg_total > 0 else 0.0

            # Over 2.5
            if over25_prob > 0.65:
                ou_vb      = [vb for vb in value_bets if vb["selection"] == "Over 2.5"]
                confidence = self._calculate_confidence(over25_prob, ou_vb, match_info)
                if confidence >= self.CONFIDENCE_THRESHOLD:
                    tips.append(self._build_tip(
                        tip_type="OVER_UNDER",
                        prediction="Over 2.5",
                        confidence=confidence,
                        calc_prob=over25_prob,
                        value_bet=ou_vb[0] if ou_vb else None,
                        reasoning=self._build_ou_reasoning("Over 2.5", match_info, eg),
                        model_breakdown={"poisson": ou},
                        estimated_odds=self._best_odds(odds_data, "overOdds"),
                    ))

            # Under 3.5
            if under35_prob > 0.65:
                confidence = self._calculate_confidence(under35_prob, [], match_info)
                if confidence >= self.CONFIDENCE_THRESHOLD:
                    tips.append(self._build_tip(
                        tip_type="OVER_UNDER",
                        prediction="Under 3.5",
                        confidence=confidence,
                        calc_prob=under35_prob,
                        value_bet=None,
                        reasoning=self._build_ou_reasoning("Under 3.5", match_info, eg),
                        model_breakdown={"poisson": ou},
                        estimated_odds=None,
                    ))

        # ── BTTS (only if both teams consistently score) ──────────────────────
        if bts.get("yes") is not None:
            btts_yes_prob  = bts["yes"]
            btts_no_prob   = bts["no"]
            best_btts_prob = max(btts_yes_prob, btts_no_prob)
            home_btts      = match_info.get("home_btts_rate", 0) or 0
            away_btts      = match_info.get("away_btts_rate", 0) or 0

            if best_btts_prob > 0.65 and home_btts >= 0.5 and away_btts >= 0.5:
                is_yes    = btts_yes_prob >= btts_no_prob
                selection = "BTTS Yes" if is_yes else "BTTS No"
                btts_vb   = [vb for vb in value_bets if vb["market"] == "BTTS" and vb["selection"] == ("Yes" if is_yes else "No")]
                confidence = self._calculate_confidence(best_btts_prob, btts_vb, match_info)
                if confidence >= self.CONFIDENCE_THRESHOLD:
                    tips.append(self._build_tip(
                        tip_type="BTTS",
                        prediction=selection,
                        confidence=confidence,
                        calc_prob=best_btts_prob,
                        value_bet=btts_vb[0] if btts_vb else None,
                        reasoning=self._build_btts_reasoning(selection, match_info),
                        model_breakdown={"poisson": bts},
                    ))

        return tips

    # ── Private helpers ───────────────────────────────────────────────────────

    def _poisson_under_prob(self, xg_total: float, threshold: int) -> float:
        """P(goals <= threshold) using Poisson distribution."""
        return sum(
            math.exp(-xg_total) * (xg_total ** k) / math.factorial(k)
            for k in range(threshold + 1)
        )

    def _best_odds(self, odds_data: List[Dict], field: str) -> Optional[float]:
        """Return the highest decimal odds across all bookmakers for a given field."""
        values = [o[field] for o in odds_data if o.get(field) and o[field] > 1.0]
        return round(max(values), 2) if values else None

    def _build_tip(
        self,
        *,
        tip_type: str,
        prediction: str,
        confidence: float,
        calc_prob: float,
        value_bet: Optional[Dict],
        reasoning: List[str],
        model_breakdown: Dict,
        estimated_odds: Optional[float] = None,
    ) -> Dict:
        best_odds = value_bet["odds"] if value_bet else estimated_odds
        return {
            "tip_type": tip_type,
            "prediction": prediction,
            "confidence": confidence,
            "calculated_probability": round(calc_prob, 4),
            "implied_probability": value_bet["implied_probability"] if value_bet else None,
            "value_rating": value_bet["edge"] if value_bet else 0.0,
            "best_odds": best_odds,
            "best_bookmaker": value_bet["bookmaker"] if value_bet else None,
            "suggested_stake": self._stake_from_confidence(confidence, value_bet),
            "reasoning": reasoning,
            "model_breakdown": model_breakdown,
        }

    def _calculate_confidence(
        self,
        probability: float,
        value_bets: List[Dict],
        match_info: Optional[Dict] = None,
    ) -> float:
        """
        Confidence = weighted combination of 5 statistical factors (no odds dependency):
          1. Probability strength  (35%) — how far above baseline
          2. Form consistency      (25%) — recent form stability
          3. ELO difference        (20%) — team quality gap
          4. H2H record            (10%) — historical head-to-head
          5. Home advantage        (10%) — home team win rate boost
        """
        # 1. Probability strength — baseline 0.33 for 3-outcome, 0.50 for 2-outcome
        baseline = 0.50 if probability > 0.60 else 0.33
        prob_score = min((probability - baseline) / (1.0 - baseline), 1.0) * 100
        prob_score = max(prob_score, 0)

        mi = match_info or {}

        # 2. Form consistency — reward stable form (WWWWW=100, mixed=low)
        def form_score(form_str: str) -> float:
            if not form_str:
                return 40.0
            recent = form_str[-5:].upper()
            wins   = recent.count("W")
            losses = recent.count("L")
            draws  = recent.count("D")
            # Reward consistency: all wins or all losses both = stable prediction
            dominant = max(wins, losses, draws)
            return (dominant / max(len(recent), 1)) * 100

        home_form_score = form_score(mi.get("home_form", ""))
        away_form_score = form_score(mi.get("away_form", ""))
        form = (home_form_score + away_form_score) / 2

        # 3. ELO difference — bigger gap = more predictable
        home_elo = mi.get("home_elo") or 1500
        away_elo = mi.get("away_elo") or 1500
        elo_diff = abs(home_elo - away_elo)
        elo_score = min(elo_diff / 300, 1.0) * 100  # 300 pts diff = max score

        # 4. H2H record — one team dominates historically
        h2h = mi.get("h2h")
        if h2h and hasattr(h2h, "total_matches") and h2h.total_matches >= 3:
            dominant_wins = max(h2h.home_wins, h2h.away_wins)
            h2h_score = (dominant_wins / h2h.total_matches) * 100
        else:
            h2h_score = 40.0  # neutral when no H2H data

        # 5. Home advantage — home teams have ~55% win rate baseline
        home_win_rate = (mi.get("home_over25_rate") or 0.5)
        home_adv_score = min(home_win_rate * 100, 100)

        confidence = (
            prob_score      * 0.35 +
            form            * 0.25 +
            elo_score       * 0.20 +
            h2h_score       * 0.10 +
            home_adv_score  * 0.10
        )
        return round(min(max(confidence, 10.0), 98.0), 1)

    def _stake_from_confidence(
        self, confidence: float, value_bet: Optional[Dict]
    ) -> int:
        return 1

    def _build_1x2_reasoning(
        self,
        outcome: str,
        match_info: Dict,
        eg: Dict,
        prediction: Dict,
    ) -> List[str]:
        home = match_info.get("home_team_name", "Home")
        away = match_info.get("away_team_name", "Away")
        reasons: List[str] = []

        if outcome == "home_win":
            reasons.append(f"{home} are playing at home and hold a goal-scoring advantage.")
            if match_info.get("home_form"):
                reasons.append(f"{home} recent form: {match_info['home_form']}")
        elif outcome == "away_win":
            reasons.append(f"{away} carry superior attacking statistics into this fixture.")
            if match_info.get("away_form"):
                reasons.append(f"{away} recent form: {match_info['away_form']}")
        else:
            reasons.append("Both teams are closely matched – models lean toward a share of the spoils.")

        if eg and eg.get("total", 0) > 0:
            reasons.append(
                f"Richard expected goals: {home} {eg.get('home', '?')} – "
                f"{eg.get('away', '?')} {away} (total {eg.get('total', '?')})"
            )

        mr = prediction.get("match_result", {})
        reasons.append(
            f"Richard probabilities – Home: {mr.get('home_win', 0):.1%}, "
            f"Draw: {mr.get('draw', 0):.1%}, Away: {mr.get('away_win', 0):.1%}"
        )
        return reasons

    def _build_ou_reasoning(
        self,
        selection: str,
        match_info: Dict,
        eg: Dict,
    ) -> List[str]:
        home = match_info.get("home_team_name", "Home")
        away = match_info.get("away_team_name", "Away")
        total = eg.get("total", "N/A")
        reasons: List[str] = []

        if "Over 2.5" in selection:
            if total and float(total) > 0:
                reasons.append(f"Richard expects {total} total goals, above the 2.5 threshold.")
            reasons.append(
                f"Both {home} and {away} show attacking output that suggests an open game."
            )
        elif "Under 3.5" in selection:
            if total and float(total) > 0:
                reasons.append(f"Richard expects {total} total goals, below the 3.5 threshold.")
            reasons.append("Match is unlikely to produce 4 or more goals based on both teams' defensive records.")
        else:
            if total and float(total) > 0:
                reasons.append(f"Richard expects {total} total goals, below the 2.5 threshold.")
            reasons.append("Defensive records favour a low-scoring, tight contest.")
        return reasons

    def _build_dc_reasoning(
        self,
        selection: str,
        match_info: Dict,
        home_prob: float,
        draw_prob: float,
        away_prob: float,
    ) -> List[str]:
        home = match_info.get("home_team_name", "Home")
        away = match_info.get("away_team_name", "Away")
        reasons: List[str] = []
        if selection == "1X":
            reasons.append(
                f"1X covers both a {home} win and a draw — protects against the away win scenario."
            )
            reasons.append(
                f"Richard probabilities – Home: {home_prob:.1%}, Draw: {draw_prob:.1%}, Away: {away_prob:.1%}"
            )
            reasons.append(
                f"Combined 1X probability: {home_prob + draw_prob:.1%}"
            )
        else:
            reasons.append(
                f"2X covers both an {away} win and a draw — protects against the home win scenario."
            )
            reasons.append(
                f"Richard probabilities – Home: {home_prob:.1%}, Draw: {draw_prob:.1%}, Away: {away_prob:.1%}"
            )
            reasons.append(
                f"Combined 2X probability: {away_prob + draw_prob:.1%}"
            )
        return reasons

    def _build_btts_reasoning(
        self,
        selection: str,
        match_info: Dict,
    ) -> List[str]:
        home = match_info.get("home_team_name", "Home")
        away = match_info.get("away_team_name", "Away")

        if "Yes" in selection:
            return [
                f"Both {home} and {away} have been scoring regularly this season.",
                "Historical H2H and current form support goals at both ends.",
            ]
        return [
            f"At least one of {home} or {away} has a high clean-sheet rate.",
            "Defensive solidity makes a shutout likely for one side.",
        ]
