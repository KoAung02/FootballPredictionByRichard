from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "FootballEdge Prediction Engine"
    app_version: str = "1.0.0"
    debug: bool = False

    # Poisson model
    home_advantage: float = 1.25
    poisson_max_goals: int = 7

    # Value detection
    min_value_threshold: float = 0.03

    # Monte Carlo (reserved for later phases)
    monte_carlo_simulations: int = 10000

    class Config:
        env_file = ".env"


settings = Settings()
