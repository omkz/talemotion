import type { AspectRatio, Duration } from "./project";

export type SettingsLanguage =
  | "English"
  | "Indonesian"
  | "Spanish"
  | "French"
  | "German";

export type SettingsVisualStyle =
  | "Cinematic Realistic"
  | "Epic Historical"
  | "Cinematic Drama"
  | "Dark Cinematic"
  | "Clean Commercial"
  | "Animated Illustration";

export type SettingsNarrationStyle =
  | "Documentary"
  | "Energetic Documentary"
  | "Emotional"
  | "Suspenseful"
  | "Promotional"
  | "Conversational";

export type ImageProviderPreference =
  | "Automatic"
  | "GMI Cloud"
  | "OpenAI"
  | "Google"
  | "NVIDIA NIM";

export type VideoProviderPreference =
  | "Automatic"
  | "GMI Cloud"
  | "Runway"
  | "Luma"
  | "Decart";

export type VoiceProviderPreference =
  | "Automatic"
  | "ElevenLabs"
  | "OpenAI"
  | "Google";

export interface AppSettings {
  general: {
    defaultLanguage: SettingsLanguage;
    defaultAspectRatio: AspectRatio;
    defaultDuration: Duration;
    captionsEnabled: boolean;
    backgroundMusicEnabled: boolean;
  };
  generation: {
    defaultVisualStyle: SettingsVisualStyle;
    defaultNarrationStyle: SettingsNarrationStyle;
    preferredImageProvider: ImageProviderPreference;
    preferredVideoProvider: VideoProviderPreference;
    preferredVoiceProvider: VoiceProviderPreference;
    autoRetryFailedGenerations: boolean;
    maximumAutomaticRetries: number;
  };
  integrations: {
    genblazeMode: "mock";
    backblazeMode: "mock";
    b2BucketName: string;
    b2Region: string;
  };
}

export interface IntegrationCheckHistory {
  genblazeLastCheckedAt: string | null;
  backblazeLastCheckedAt: string | null;
}

export interface MockIntegrationCheckResult {
  status: "mock-connected";
  checkedAt: string;
}
