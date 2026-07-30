import type { SceneStatus } from "./scene";

export type GenerationStage =
  | "waiting"
  | "generating-image"
  | "generating-video"
  | "generating-narration"
  | "uploading-assets"
  | "completed"
  | "failed";

/** Tracks the in-flight (or most recent) generation attempt for a single scene. */
export interface GenerationJob {
  id: string;
  sceneId: string;
  stage: GenerationStage;
  progress: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export const SCENE_STATUS_LABEL: Record<SceneStatus, string> = {
  draft: "Draft",
  waiting: "Waiting",
  "generating-image": "Generating image",
  "generating-video": "Generating video",
  "generating-narration": "Generating narration",
  "uploading-assets": "Uploading assets",
  completed: "Completed",
  failed: "Failed",
};
