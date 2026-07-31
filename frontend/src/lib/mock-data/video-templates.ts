import type { AspectRatio, Duration, SceneCountSetting, VideoMode } from "@/types";

/**
 * Quick-start presets for the wizard's "Choose a story format" step.
 *
 * All four templates currently target the only production-ready
 * combination the real-generation backend supports: Historical
 * Documentary, 4 scenes, 9:16, and a 30- or 45-second duration. Custom
 * Setup (freely choosing a video mode) is intentionally not offered here
 * — it should return once multiple production-ready video modes and
 * broader duration/scene-count combinations are supported. Until then,
 * showing it alongside these templates would just produce near-identical
 * projects, so `step-mode-select.tsx` is kept around unused rather than
 * deleted.
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
  /** Per-template placeholder copy shown in step 2/3 fields — never a default value. */
  example: {
    title: string;
    topic: string;
    additionalDirection: string;
  };
}

export type TemplateIconKey =
  | "historical-fact"
  | "battle-and-betrayal"
  | "empire"
  | "mystery";

export const VIDEO_TEMPLATES: VideoTemplatePreset[] = [
  {
    id: "historical-fact",
    name: "Historical Fact",
    description: "Reveal one surprising historical event with a strong opening hook.",
    icon: "historical-fact",
    mode: "historical-documentary",
    duration: 30,
    aspectRatio: "9:16",
    sceneCount: 4,
    visualStyle: "Cinematic Historical Realism",
    narrationStyle: "Energetic Documentary",
    guidance:
      "Describe the historical event, surprising fact, or unexpected outcome you want to reveal.",
    example: {
      title: "The Volcano That Buried a Kingdom Overnight",
      topic:
        "Nobody expected Mount Kelud's eruption to end a 500-year-old kingdom in a single night.",
      additionalDirection:
        "Open with the surprising fact immediately. Keep pacing quick and revelation-driven.",
    },
  },
  {
    id: "battle-and-betrayal",
    name: "Battle & Betrayal",
    description:
      "Tell a fast historical story built around conflict, deception, and a dramatic reversal.",
    icon: "battle-and-betrayal",
    mode: "historical-documentary",
    duration: 30,
    aspectRatio: "9:16",
    sceneCount: 4,
    visualStyle: "Epic Cinematic Realism",
    narrationStyle: "Dramatic Documentary",
    guidance:
      "Describe the opposing sides, the conflict, the deception or turning point, and the final outcome.",
    example: {
      title: "When Genghis Khan’s Grandson Was Defeated by Ancient Indonesia",
      topic:
        "The failed Mongol invasion of Java and Raden Wijaya's strategy against Kublai Khan's forces.",
      additionalDirection:
        "Open with a strong hook. Focus on deception, tropical warfare, the retreat of the Mongol forces, and the rise of Majapahit. Use historically plausible Javanese clothing, weapons, architecture, rivers, and Southeast Asian ships. Avoid European-looking armor, castles, and vessels.",
    },
  },
  {
    id: "rise-of-an-empire",
    name: "Rise of an Empire",
    description: "Show how a kingdom rose through ambition, strategy, and military power.",
    icon: "empire",
    mode: "historical-documentary",
    duration: 45,
    aspectRatio: "9:16",
    sceneCount: 4,
    visualStyle: "Epic Historical Cinema",
    narrationStyle: "Grand Documentary",
    guidance:
      "Describe the kingdom, its early challenge, the leader or strategy behind its rise, and its moment of dominance.",
    example: {
      title: "How a River Port Became Southeast Asia's Greatest Empire",
      topic:
        "The founding of the Majapahit Empire — how Raden Wijaya turned defeat into the birth of a kingdom.",
      additionalDirection:
        "Emphasize strategy and resilience over spectacle. Keep tone reverent and cinematic.",
    },
  },
  {
    id: "mystery-from-history",
    name: "Mystery from History",
    description: "Explore an unresolved event, lost place, disputed story, or historical mystery.",
    icon: "mystery",
    mode: "historical-documentary",
    duration: 30,
    aspectRatio: "9:16",
    sceneCount: 4,
    visualStyle: "Dark Historical Cinema",
    narrationStyle: "Suspenseful Documentary",
    guidance:
      "Describe the mystery, what is known, the strongest theory, and why the truth remains uncertain.",
    example: {
      title: "The Ship That Vanished From Every Record",
      topic:
        "A historical mystery — a lost expedition, an unexplained disappearance, or a disputed event historians still can't agree on.",
      additionalDirection:
        "Present competing theories fairly. End on the specific detail that keeps the mystery alive.",
    },
  },
];
