from dataclasses import dataclass
from decimal import Decimal

from app.core.config import AppConfig, settings
from app.models.credits import UsageOperation


@dataclass(frozen=True, slots=True)
class CreditPricing:
    rates: dict[UsageOperation, Decimal]

    @classmethod
    def from_config(cls, config: AppConfig) -> "CreditPricing":
        return cls(
            {
                UsageOperation.STORYBOARD_GENERATION: (
                    config.credit_rate_storyboard_generation
                ),
                UsageOperation.IMAGE_GENERATION: (
                    config.credit_rate_image_generation
                ),
                UsageOperation.VIDEO_GENERATION: (
                    config.credit_rate_video_generation
                ),
                UsageOperation.TTS_GENERATION: (
                    config.credit_rate_tts_generation
                ),
                UsageOperation.MUSIC_GENERATION: (
                    config.credit_rate_music_generation
                ),
                UsageOperation.FINAL_RENDER: config.credit_rate_final_render,
            }
        )

    def rate(self, operation: UsageOperation) -> Decimal:
        return self.rates[operation]

    def scene_generation(self, *, generate_video: bool) -> Decimal:
        estimate = self.rate(UsageOperation.IMAGE_GENERATION)
        if generate_video:
            estimate += self.rate(UsageOperation.VIDEO_GENERATION)
        return estimate

    def project_generation(
        self,
        *,
        scene_count: int,
        generate_video: bool,
    ) -> Decimal:
        return self.scene_generation(generate_video=generate_video) * scene_count

    def render(
        self,
        *,
        scene_count: int,
        narration_enabled: bool,
        music_enabled: bool,
    ) -> Decimal:
        estimate = self.rate(UsageOperation.FINAL_RENDER)
        if narration_enabled:
            estimate += self.rate(UsageOperation.TTS_GENERATION) * scene_count
        if music_enabled:
            estimate += self.rate(UsageOperation.MUSIC_GENERATION)
        return estimate


pricing = CreditPricing.from_config(settings)
