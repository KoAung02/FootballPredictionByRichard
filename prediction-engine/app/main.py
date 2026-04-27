"""
FastAPI entry point for the FootballEdge Prediction Engine.

Phase 2 (steps 6, 7, 11, 12, 13) – active models:
  • Poisson distribution model  (step 7)
  • Value Bet detector           (step 11)
  • Tip Generator                (step 12)

Deferred (later phases):
  • Elo rating system   (step 8)
  • Monte Carlo engine  (step 9)
  • Ensemble combiner   (step 10)
"""

from fastapi import FastAPI, HTTPException
from app.services.bbc_sport import scrape_standings

from app.config import settings
from app.models.poisson import PoissonModel
from app.models.ml_model import FootballMLModel
from app.schemas.models import MatchPredictionRequest, MatchPredictionResponse
from app.schemas.ml_schemas import TrainRequest, MLPredictRequest, MLPredictResponse
from app.services.tip_generator import TipGenerator
from app.services.value_detector import ValueDetector

# ── App instance ──────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Statistical football match prediction engine using Poisson distribution, "
        "value bet detection, and automated tip generation."
    ),
)

# ── Singleton model instances ─────────────────────────────────────────────────

poisson_model   = PoissonModel(
    home_advantage=settings.home_advantage,
    max_goals=settings.poisson_max_goals,
)
value_detector  = ValueDetector(min_value_threshold=settings.min_value_threshold)
tip_generator   = TipGenerator()
ml_model        = FootballMLModel()   # loads from /tmp if a saved model exists


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    """Liveness probe. Returns the status of each loaded model."""
    return {
        "status": "ok",
        "models_loaded": {
            "poisson": True,
            "elo": False,          # Phase 2 step 8 – not yet implemented
            "monte_carlo": False,  # Phase 2 step 9 – not yet implemented
            "ensemble": False,     # Phase 2 step 10 – not yet implemented
        },
    }


@app.post("/predict", response_model=MatchPredictionResponse)
async def predict_match(request: MatchPredictionRequest):
    """
    Main prediction endpoint.

    Accepts match data (team stats, optional odds) and returns:
    - Poisson model output (expected goals, 1X2, O/U, BTTS probabilities)
    - Value bets (when odds_data is provided)
    - Generated tips

    The response shape is forward-compatible: once the Ensemble combiner is
    added in a later phase, the ``poisson_prediction`` field will be replaced
    by an ``ensemble_prediction`` field with the same sub-keys.
    """
    try:
        hs = request.home_team_stats
        aws = request.away_team_stats

        # Guard: goals-per-game needs at least 1 match played (already validated
        # by Pydantic ge=1, but we double-check to avoid 0-division)
        gp_home = max(hs.matches_played, 1)
        gp_away = max(aws.matches_played, 1)

        # ── 1. Poisson model ──────────────────────────────────────────────
        poisson_pred = poisson_model.get_match_probabilities(
            home_attack=hs.goals_for   / gp_home,
            home_defense=hs.goals_against / gp_home,
            away_attack=aws.goals_for  / gp_away,
            away_defense=aws.goals_against / gp_away,
            league_avg_goals=request.league_avg_goals,
        )

        # ── 2. Value bet detection ────────────────────────────────────────
        odds_dicts = [o.model_dump() for o in request.odds_data]
        value_bets = value_detector.find_value_bets(poisson_pred, odds_dicts)

        # ── 3. Tip generation ─────────────────────────────────────────────
        match_info = {
            "home_team_name": request.home_team_name,
            "away_team_name": request.away_team_name,
            "home_form": request.home_form,
            "away_form": request.away_form,
        }
        tips = tip_generator.generate_tips(
            match_info=match_info,
            prediction=poisson_pred,
            value_bets=value_bets,
            odds_data=odds_dicts,
        )

        return MatchPredictionResponse(
            match_id=request.match_id,
            poisson_prediction=poisson_pred,
            value_bets=value_bets,
            tips=tips,
        )

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/train")
async def train_ml_model(request: TrainRequest):
    """
    Train (or retrain) the ML model on finished match data.

    Call this once before running predictions. The TypeScript predictions job
    will call this automatically when it switches to the ML endpoint.
    Returns training summary including number of samples used.
    """
    try:
        matches_dicts = []
        for m in request.matches:
            matches_dicts.append({
                "home_stats": m.home_stats,
                "away_stats": m.away_stats,
                "result":     m.result,
                "home_goals": m.home_goals,
                "away_goals": m.away_goals,
                "h2h":        m.h2h,
            })
        result = ml_model.train(matches_dicts)
        return {"ok": True, "result": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/predict/ml", response_model=MLPredictResponse)
async def predict_match_ml(request: MLPredictRequest):
    """
    ML-based prediction endpoint (replaces /predict when integrated).

    Uses a Logistic Regression model trained on finished matches, blended
    50/50 with market-implied probabilities from bookmaker odds.
    Falls back to pure odds-implied probabilities if not yet trained.

    Output shape is identical to /predict so TipGenerator works unchanged.
    """
    try:
        odds_dicts = [o.model_dump() for o in request.odds_data]

        ml_pred = ml_model.predict(
            home_stats=request.home_team_stats,
            away_stats=request.away_team_stats,
            odds_data=request.odds_data,
            h2h=request.h2h,
        )

        value_bets = value_detector.find_value_bets(ml_pred, odds_dicts)

        match_info = {
            "home_team_name":  request.home_team_name,
            "away_team_name":  request.away_team_name,
            "home_form":       request.home_form,
            "away_form":       request.away_form,
            "home_elo":        request.home_team_stats.elo_rating,
            "away_elo":        request.away_team_stats.elo_rating,
            "home_btts_rate":  request.home_team_stats.btts_rate,
            "away_btts_rate":  request.away_team_stats.btts_rate,
            "home_over25_rate": request.home_team_stats.over25_rate,
            "away_over25_rate": request.away_team_stats.over25_rate,
            "h2h":             request.h2h,
        }
        tips = tip_generator.generate_tips(
            match_info=match_info,
            prediction=ml_pred,
            value_bets=value_bets,
            odds_data=odds_dicts,
        )

        return MLPredictResponse(
            match_id=request.match_id,
            ml_prediction=ml_pred,
            value_bets=value_bets,
            tips=tips,
            model_info={
                "model":      ml_pred.get("model", "unknown"),
                "trained_on": ml_pred.get("trained_on", 0),
                "is_trained": ml_model.is_trained,
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/scrape/team-stats/{league_slug}")
async def scrape_bbc_team_stats(league_slug: str):
    """Scrape overall standings from BBC Sport for a given league."""
    try:
        data = await scrape_standings(league_slug)
        return {"ok": True, "league": league_slug, "teams": len(data), "data": data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/ml/status")
async def ml_status():
    """Check whether the ML model has been trained and how many samples it used."""
    return {
        "is_trained": ml_model.is_trained,
        "n_samples":  ml_model.n_samples,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.debug)
