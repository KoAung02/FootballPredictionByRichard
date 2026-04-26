# FootballEdge

A full-stack football betting intelligence platform that combines statistical modelling, machine learning, and bookmaker odds to generate value betting tips across 5 leagues including the UEFA Champions League.

## Overview

FootballEdge fetches live fixture data, team statistics, and bookmaker odds via external APIs, then runs them through an ML prediction engine to surface high-confidence tips with value ratings. Tips cover match result (1X2 or double chance) and Over/Under 2.5 goals markets across the top European leagues. A performance dashboard tracks P&L and ROI across all settled tips.

## Architecture

Three services run together:

**Local development**
```
┌─────────────────────┐     HTTP      ┌──────────────────────────┐
│  Next.js 16 App     │ ──────────── ▶ │  Python FastAPI Engine   │
│  (port 3000)        │               │  (port 8000)             │
│                     │               │                          │
│  • UI / API routes  │               │  • ML model (XGBoost)    │
│  • Cron jobs        │               │  • Expected goals calc   │
│  • Prisma ORM       │               │  • Value bet detector    │
└────────┬────────────┘               │  • Tip generator         │
         │                            └──────────────────────────┘
         │ Prisma / ioredis
         ▼
┌──────────────────────┐
│  PostgreSQL + Redis  │
│  (Homebrew, local)   │
└──────────────────────┘
```

**Production**
```
┌─────────────────────┐     HTTP      ┌──────────────────────────┐
│  Next.js 16 App     │ ──────────── ▶ │  Python FastAPI Engine   │
│  (Vercel)           │               │  (Railway)               │
│                     │               │                          │
│  • UI / API routes  │               │  • ML model (XGBoost)    │
│  • Cron jobs        │               │  • Expected goals calc   │
│  • Prisma ORM       │               │  • Value bet detector    │
└────────┬────────────┘               │  • Tip generator         │
         │                            └──────────────────────────┘
         │ Prisma / ioredis
         ▼
┌──────────────────────┐
│  Neon PostgreSQL     │
│  + Upstash Redis     │
└──────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend / Backend | Next.js 16.2, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7.6 |
| Database | PostgreSQL — Neon (prod) / Homebrew (local) |
| Cache | Redis — Upstash (prod) / Homebrew (local), ioredis |
| Prediction engine | Python 3, FastAPI, XGBoost 2.1, scikit-learn 1.6 |
| Hosting | Vercel (Next.js), Railway (Python engine) |
| Charts | Recharts |
| External data | football-data.org, The Odds API |

## Prerequisites

- Node.js 20+
- Python 3.11+
- PostgreSQL running locally (Homebrew: `brew services start postgresql@14`)
- Redis running locally (Homebrew: `brew services start redis`)

## Setup

### 1. Environment variables

```bash
cp .env.example .env
```

Fill in your API keys in `.env`:

```
DATABASE_URL="postgresql://footballedge:footballedge_secret@localhost:5432/footballedge"
REDIS_URL="redis://:redis_secret@localhost:6379"
FOOTBALL_DATA_API_KEY="your_football_data_api_key"   # football-data.org
ODDS_API_KEY="your_odds_api_key"                      # the-odds-api.com
PREDICTION_ENGINE_URL="http://localhost:8000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2. Database

```bash
npm install
npx prisma migrate deploy
npm run db:seed        # seeds leagues and teams
```

### 3. Python prediction engine

```bash
cd prediction-engine
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Running Locally

Open three terminal tabs:

**Terminal 1 — Start background services (once)**
```bash
brew services start postgresql@14
brew services start redis
```

**Terminal 2 — Python prediction engine**
```bash
cd prediction-engine
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```
Wait for `Application startup complete.`

**Terminal 3 — Next.js app**
```bash
npm run dev
```
Wait for `Ready in ...ms`, then open [http://localhost:3000](http://localhost:3000).

## Cron Jobs

Jobs run automatically via the cron runner. They can also be triggered manually — all routes are `GET`.

| Job | Schedule | Route | Description |
|---|---|---|---|
| fixtures | every 6h | `GET /api/crons/fixtures` | Fetch match results and upcoming fixtures (TBD knockout teams skipped) |
| team-stats | 4 AM daily | `GET /api/crons/team-stats` | Recalculate team statistics and ELO ratings |
| odds | every 30 min | `GET /api/crons/odds` | Fetch latest bookmaker odds (h2h + totals; BTTS skipped on free tier) |
| predictions | every 6h | `GET /api/crons/predictions` | Train ML model and generate tips |
| update-results | every 1h | `GET /api/crons/update-results` | Mark tips as WIN/LOSS/PUSH based on results |

### First-run / daily refresh order

```bash
# 1. Pull fixtures and results
curl http://localhost:3000/api/crons/fixtures

# 2. Compute team stats
curl http://localhost:3000/api/crons/team-stats

# 3. Fetch bookmaker odds
curl http://localhost:3000/api/crons/odds

# 4. Clear stale cache, then generate predictions (trains ML model, stores tips)
redis-cli FLUSHALL
curl http://localhost:3000/api/crons/predictions

# 5. Evaluate past tip performance
curl http://localhost:3000/api/crons/update-results
```

## ML Prediction Engine

### Model

The engine uses **XGBoost** (scikit-learn compatible) with three binary/multi-class classifiers:

- `result_clf` — Home / Draw / Away (3-class, `multi:softprob`)
- `ou_clf` — Over 2.5 goals / Under (binary)
- `btts_clf` — Both teams score Yes / No (binary, used internally)

Each classifier uses `n_estimators=100, max_depth=3, learning_rate=0.1`. Predictions are a **50/50 blend** of the ML output and market-implied probabilities derived from bookmaker odds.

### Tip selection logic

For the match result market, the engine picks between an outright result and a double chance based on draw risk:

- Draw probability **≥ 22%** + home favourite → recommend **2X** (away or draw)
- Draw probability **≥ 22%** + away favourite → recommend **1X** (home or draw)
- Draw probability **< 22%** → recommend outright **Home Win / Away Win**
- Draw is the single most likely outcome → recommend **Draw**

Over/Under 2.5 is generated when either side exceeds 55% probability.

### Feature vector (21 features)

| # | Feature | Description |
|---|---|---|
| 0 | home_home_attack | Goals per home game (home team) |
| 1 | home_home_defense | Conceded per home game (home team) |
| 2 | home_home_win_rate | Home win rate |
| 3 | away_away_attack | Goals per away game (away team) |
| 4 | away_away_defense | Conceded per away game (away team) |
| 5 | away_away_win_rate | Away win rate |
| 6 | home_overall_win_rate | Overall win rate (home team) |
| 7 | home_draw_rate | Overall draw rate (home team) |
| 8 | away_overall_win_rate | Overall win rate (away team) |
| 9 | away_draw_rate | Overall draw rate (away team) |
| 10 | home_form | Weighted form score [0,1] — last 5 results |
| 11 | away_form | Weighted form score [0,1] — last 5 results |
| 12 | home_btts_rate | BTTS rate (home team) |
| 13 | away_btts_rate | BTTS rate (away team) |
| 14 | home_over25_rate | Over 2.5 rate (home team) |
| 15 | away_over25_rate | Over 2.5 rate (away team) |
| 16 | home_clean_sheet_rate | Clean sheet rate (home team) |
| 17 | away_clean_sheet_rate | Clean sheet rate (away team) |
| 18 | elo_diff_norm | (home ELO − away ELO) / 400 |
| 19 | h2h_home_win_rate | H2H home win rate (last 5 meetings; prior = 0.45) |
| 20 | h2h_avg_goals_norm | H2H average goals / 5 |

Odds are **excluded from the feature vector** so training data (historical matches, no stored odds) and inference data (upcoming matches, has odds) are compatible. Bookmaker odds are used only in the post-prediction blend.

The model persists to `/tmp/footballedge_ml.pkl` and auto-loads on engine restart. Requires ≥ 20 finished matches to train.

Tips include an `estimatedOdds` field (derived from model probability) so P&L and ROI are tracked for all tips, including those without bookmaker odds coverage. The performance dashboard displays win rate, total P&L, and ROI across all settled tips.

### Python API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| POST | `/train` | Train ML model on finished match data |
| POST | `/predict/ml` | ML model prediction (active) |
| GET | `/ml/status` | ML model training status |

## Covered Leagues

| League | Country | football-data.org code |
|---|---|---|
| Premier League | England | PL |
| La Liga | Spain | PD |
| Serie A | Italy | SA |
| Bundesliga | Germany | BL1 |
| UEFA Champions League | Europe | CL |

## Project Structure

```
footballedge/
├── src/
│   ├── app/                  # Next.js App Router pages and API routes
│   │   └── api/
│   │       ├── crons/        # Cron job HTTP triggers (GET routes)
│   │       ├── leagues/      # League data API
│   │       ├── matches/      # Match data API
│   │       └── tips/         # Tips API
│   ├── jobs/                 # Job implementations
│   │   ├── fixtures.ts
│   │   ├── team-stats.ts
│   │   ├── odds.ts
│   │   ├── run-predictions.ts
│   │   └── update-results.ts
│   ├── services/
│   │   ├── football-data.ts      # football-data.org API client
│   │   ├── odds-api.ts           # The Odds API client
│   │   └── prediction-engine.ts  # HTTP client for Python engine
│   └── lib/                  # Prisma, Redis, constants, cache keys
├── prediction-engine/        # Python FastAPI service
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   │   ├── ml_model.py   # Logistic Regression classifiers
│   │   │   └── poisson.py    # Legacy Poisson model
│   │   ├── schemas/
│   │   │   ├── ml_schemas.py
│   │   │   └── models.py
│   │   └── services/
│   │       ├── feature_engineer.py  # 21-feature vector builder
│   │       ├── tip_generator.py     # Tip selection + reasoning
│   │       └── value_detector.py    # Edge / value bet detection
│   └── requirements.txt
├── prisma/
│   ├── schema.prisma
│   └── seed.ts               # Seeds leagues + teams from football-data.org
└── .env.example
```
