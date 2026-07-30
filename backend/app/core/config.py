from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    app_env: str = "development"
    app_name: str = "talemotion-backend"
    app_version: str = "0.1.0"
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


settings = AppConfig()
