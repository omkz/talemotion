import type { Asset } from "./asset";
import type { GenerationJob } from "./generation";

/**
 * Chapters group scenes for long-form video. Short-form projects get a
 * single implicit "Main" chapter created automatically — the UI never
 * manages chapters directly today.
 */
export interface Chapter {
  id: string;
  title: string;
  position: number;
  scenes: Scene[];
}

export type SceneStatus =
  | "draft"
  | "waiting"
  | "generating-image"
  | "generating-video"
  | "generating-narration"
  | "uploading-assets"
  | "completed"
  | "failed";

export interface SceneVersion {
  version: number;
  visualPrompt: string;
  instruction: string | null;
  asset: Asset | null;
  createdAt: string;
}

export interface Scene {
  id: string;
  position: number;
  title: string;
  narration: string;
  visualPrompt: string;
  durationSeconds: number;
  status: SceneStatus;
  activeVersion: number;
  versions: SceneVersion[];
  currentJob: GenerationJob | null;
  approved: boolean;
}
