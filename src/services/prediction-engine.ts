/**
 * Step 18 – Prediction Engine client
 *
 * Thin HTTP wrapper around the Python FastAPI microservice.
 * The Next.js backend calls this; it never talks to the prediction
 * engine from the browser.
 */

import axios, { AxiosInstance } from "axios";

// ── Request / Response shapes (mirror app/schemas/models.py) ──────────────────

export interface TeamStatsInput {
  team_id: number;
  matches_played: number;
  goals_for: number;
  goals_against: number;
  wins: number;
  draws: number;
  losses: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  home_goals_for: number;
  home_goals_against: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
  away_goals_for: number;
  away_goals_against: number;
  elo_rating: number;
  form: string;
  clean_sheets: number;
  btts_rate: number;
  over25_rate: number;
}

export interface OddsInput {
  bookmaker: string;
  market: string;
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  overLine?: number;
  overOdds?: number;
  underOdds?: number;
  bttsYes?: number;
  bttsNo?: number;
}

export interface H2HInput {
  home_wins: number;
  away_wins: number;
  draws: number;
  total_matches: number;
  avg_goals: number;
}

export interface TrainingMatch {
  home_stats: TeamStatsInput;
  away_stats: TeamStatsInput;
  result: "H" | "D" | "A";
  home_goals: number;
  away_goals: number;
  h2h?: H2HInput | null;
}

export interface PredictRequest {
  match_id: number;
  home_team_name: string;
  away_team_name: string;
  home_team_stats: TeamStatsInput;
  away_team_stats: TeamStatsInput;
  league_slug: string;
  league_avg_goals: number;
  home_form: string;
  away_form: string;
  odds_data: OddsInput[];
}

export interface MLPredictRequest {
  match_id: number;
  home_team_name: string;
  away_team_name: string;
  home_team_stats: TeamStatsInput;
  away_team_stats: TeamStatsInput;
  league_slug: string;
  league_avg_goals: number;
  home_form: string;
  away_form: string;
  odds_data: OddsInput[];
  h2h?: H2HInput | null;
}

export interface MLPredictResponse {
  match_id: number;
  ml_prediction: {
    match_result: { home_win: number; draw: number; away_win: number };
    over_under: {
      "over_2.5": number; "under_2.5": number;
      "over_1.5": number; "under_1.5": number;
      "over_3.5": number; "under_3.5": number;
    };
    btts: { yes: number; no: number };
    expected_goals: { home: number; away: number; total: number };
    most_likely_scores: Array<{ score: string; probability: number }>;
    model: string;
    trained_on: number;
  };
  value_bets: Array<{
    market: string;
    selection: string;
    our_probability: number;
    implied_probability: number;
    edge: number;
    odds: number;
    bookmaker: string;
    kelly_stake: number;
  }>;
  tips: Array<{
    tip_type: string;
    prediction: string;
    confidence: number;
    calculated_probability: number;
    implied_probability: number | null;
    value_rating: number;
    best_odds: number | null;
    best_bookmaker: string | null;
    suggested_stake: number;
    reasoning: string[];
    model_breakdown: Record<string, unknown>;
  }>;
  model_info: { model: string; trained_on: number; is_trained: boolean };
}

export interface PredictResponse {
  match_id: number;
  poisson_prediction: {
    expected_goals: { home: number; away: number; total: number };
    match_result: { home_win: number; draw: number; away_win: number };
    over_under: {
      "over_1.5": number; "under_1.5": number;
      "over_2.5": number; "under_2.5": number;
      "over_3.5": number; "under_3.5": number;
    };
    btts: { yes: number; no: number };
    most_likely_scores: Array<{ score: string; probability: number }>;
  };
  value_bets: Array<{
    market: string;
    selection: string;
    our_probability: number;
    implied_probability: number;
    edge: number;
    odds: number;
    bookmaker: string;
    kelly_stake: number;
  }>;
  tips: Array<{
    tip_type: string;
    prediction: string;
    confidence: number;
    calculated_probability: number;
    implied_probability: number | null;
    value_rating: number;
    best_odds: number | null;
    best_bookmaker: string | null;
    suggested_stake: number;
    reasoning: string[];
    model_breakdown: Record<string, unknown>;
  }>;
}

// ── Client ────────────────────────────────────────────────────────────────────

class PredictionEngineClient {
  private http: AxiosInstance;

  constructor() {
    const baseURL = process.env.PREDICTION_ENGINE_URL ?? "http://localhost:8000";

    this.http = axios.create({
      baseURL,
      timeout: 30_000,
      headers: { "Content-Type": "application/json" },
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status  = err.response?.status;
        const detail  = err.response?.data?.detail ?? err.message ?? "Unknown";
        console.error(`[prediction-engine] ${status ?? "?"} – ${detail}`);
        return Promise.reject(new Error(`Prediction engine error: ${detail}`));
      }
    );
  }

  /** Call the /predict endpoint (Poisson model). */
  async predict(payload: PredictRequest): Promise<PredictResponse> {
    const { data } = await this.http.post<PredictResponse>("/predict", payload);
    return data;
  }

  /** Train the ML model with finished match data. */
  async trainML(matches: TrainingMatch[]): Promise<{ trained: boolean; n_samples?: number; reason?: string }> {
    const { data } = await this.http.post<{ ok: boolean; result: { trained: boolean; n_samples?: number; reason?: string } }>(
      "/train",
      { matches }
    );
    return data.result;
  }

  /** Call the /predict/ml endpoint (ML model). */
  async predictML(payload: MLPredictRequest): Promise<MLPredictResponse> {
    const { data } = await this.http.post<MLPredictResponse>("/predict/ml", payload);
    return data;
  }

  /** Health check against the Python service. */
  async healthCheck(): Promise<boolean> {
    try {
      await this.http.get("/health");
      return true;
    } catch {
      return false;
    }
  }
}

export const predictionEngine = new PredictionEngineClient();
