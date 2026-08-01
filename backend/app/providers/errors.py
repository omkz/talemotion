from dataclasses import dataclass


@dataclass(slots=True)
class ProviderError(Exception):
    code: str
    message: str
    retryable: bool


def missing_configuration_error(names: list[str]) -> ProviderError:
    return ProviderError(
        code="missing_configuration",
        message="Provider configuration is incomplete. "
        f"Missing: {', '.join(names)}.",
        retryable=False,
    )
