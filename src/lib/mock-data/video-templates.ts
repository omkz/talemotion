import type { AspectRatio, Duration, SceneCountSetting, VideoMode } from "@/types";

/**
 * Quick-start presets for the "How do you want to start?" wizard step.
 * Templates are a wizard-only convenience — they prefill output settings
 * for one of the existing VideoMode values, they do not add new modes.
 */
export interface VideoTemplatePreset {
  id: string;
  name: string;
  description: string;
  icon: TemplateIconKey;
  mode: VideoMode;
  duration: Duration;
  aspectRatio: AspectRatio;
  sceneCount: SceneCountSetting;
  visualStyle: string;
  narrationStyle: string;
  guidance: string;
}

export type TemplateIconKey =
  | "historical-fact"
  | "empire"
  | "microdrama"
  | "mystery"
  | "product-solution";

export const VIDEO_TEMPLATES: VideoTemplatePreset[] = [
  {
    id: "historical-fact-short",
    name: "Historical Fact Short",
    description: "A fast-paced short spotlighting a single surprising historical fact.",
    icon: "historical-fact",
    mode: "historical-documentary",
    duration: 30,
    aspectRatio: "9:16",
    sceneCount: 4,
    visualStyle: "Cinematic Realistic",
    narrationStyle: "Energetic Documentary",
    guidance: "Describe the specific historical fact or moment you want to spotlight.",
  },
  {
    id: "rise-and-fall-of-an-empire",
    name: "Rise and Fall of an Empire",
    description: "An epic arc covering an empire's origin, peak, decline, and legacy.",
    icon: "empire",
    mode: "historical-documentary",
    duration: 60,
    aspectRatio: "9:16",
    sceneCount: 6,
    visualStyle: "Epic Historical",
    narrationStyle: "Documentary",
    guidance:
      "Describe the kingdom or empire whose origin, peak, decline, and legacy should be covered.",
  },
  {
    id: "cinematic-microdrama",
    name: "Cinematic Microdrama",
    description: "A short, emotionally-driven drama scene built around one character.",
    icon: "microdrama",
    mode: "microdrama",
    duration: 45,
    aspectRatio: "9:16",
    sceneCount: 5,
    visualStyle: "Cinematic Drama",
    narrationStyle: "Emotional",
    guidance:
      "Describe the premise, main character, and emotional turning point of your scene.",
  },
  {
    id: "mystery-story",
    name: "Mystery Story",
    description: "A suspenseful microdrama built around an unresolved mystery.",
    icon: "mystery",
    mode: "microdrama",
    duration: 45,
    aspectRatio: "9:16",
    sceneCount: 5,
    visualStyle: "Dark Cinematic",
    narrationStyle: "Suspenseful",
    guidance: "Describe the mystery, central character, and key secret.",
  },
  {
    id: "product-problem-and-solution",
    name: "Product Problem and Solution",
    description: "A promotional spot framing a customer problem and your product's solution.",
    icon: "product-solution",
    mode: "product-advertisement",
    duration: 30,
    aspectRatio: "9:16",
    sceneCount: 4,
    visualStyle: "Clean Commercial",
    narrationStyle: "Promotional",
    guidance: "Describe the customer problem your product solves and how it solves it.",
  },
];
