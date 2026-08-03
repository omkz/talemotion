import type { VideoMode } from "./video-mode";
import type { Chapter } from "./scene";

export type ProjectStatus =
  | "draft"
  | "storyboard-ready"
  | "generating"
  | "ready"
  | "failed";

export type Duration = 30 | 45 | 60;
export type AspectRatio = "9:16" | "16:9";
export type SceneCountSetting = "auto" | 4 | 5 | 6;

export interface HistoricalDocumentaryBrief {
  mode: "historical-documentary";
  topic: string;
  sourceNotes: string;
  language: string;
  tone: "cinematic" | "informative" | "dramatic" | "inspirational" | "neutral";
  targetAudience: string;
  additionalDirection: string;
}

export interface CustomVideoBrief {
  mode: "custom-video";
  prompt: string;
  sourceNotes: string;
  language: string;
  targetAudience: string;
}

export interface MicrodramaBrief {
  mode: "microdrama";
  premise: string;
  mainCharacter: string;
  genre: string;
  desiredEnding: string;
}

export interface ProductAdvertisementBrief {
  mode: "product-advertisement";
  productName: string;
  productDescription: string;
  mainBenefit: string;
  targetAudience: string;
  callToAction: string;
}

/** The mode-specific content collected in wizard step 2. */
export type ModeBrief =
  | HistoricalDocumentaryBrief
  | CustomVideoBrief
  | MicrodramaBrief
  | ProductAdvertisementBrief;

export interface OutputConfig {
  title: string;
  language: string;
  duration: Duration;
  aspectRatio: AspectRatio;
  visualStyle: string;
  narrationStyle: string;
  sceneCount: SceneCountSetting;
  narrationEnabled?: boolean;
  captionsEnabled: boolean;
  musicEnabled: boolean;
}

/**
 * A VideoProject always owns at least one Chapter, even for short-form
 * videos where the UI never surfaces chapters. This keeps the model ready
 * for long-form videos (multiple chapters) without a future migration.
 */
export interface VideoProject {
  id: string;
  mode: VideoMode;
  status: ProjectStatus;
  brief: ModeBrief;
  output: OutputConfig;
  chapters: Chapter[];
  thumbnailUrl: string | null;
  historicalAccuracyNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** 0-100 overall generation progress, only meaningful while status is "generating". */
  generationProgress: number;
}
