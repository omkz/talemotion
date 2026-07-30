export interface SceneRunAsset {
  kind: "image" | "video";
  media_type: string;
  asset_url: string;
  preview_url: string;
  sha256: string;
  provider: "GMICloud";
  model: string;
}

interface SceneRunEventBase {
  run_id: string;
  project_id: string;
  scene_id: string;
}

export interface SceneRunStartedEvent extends SceneRunEventBase {
  type: "scene_run.started";
}

export interface SceneStageStartedEvent extends SceneRunEventBase {
  type: "scene_image.started" | "scene_video.started";
  model: string;
}

export interface SceneStageProgressEvent extends SceneRunEventBase {
  type: "scene_image.progress" | "scene_video.progress";
  progress?: number;
  elapsed_seconds?: number;
  message?: string;
}

export interface SceneStageCompletedEvent extends SceneRunEventBase {
  type: "scene_image.completed" | "scene_video.completed";
  asset: SceneRunAsset;
  manifest_url: string;
}

export interface SceneRunCompletedEvent extends SceneRunEventBase {
  type: "scene_run.completed";
  image: SceneRunAsset;
  video: SceneRunAsset | null;
  manifest_url: string;
}

export type SceneRunFailureCode =
  | "missing_configuration"
  | "provider_authentication_failed"
  | "provider_rate_limited"
  | "provider_generation_failed"
  | "storage_failed"
  | "invalid_request"
  | "unknown_error";

export interface SceneRunFailedEvent extends SceneRunEventBase {
  type: "scene_run.failed";
  code: SceneRunFailureCode;
  message: string;
  retryable: boolean;
  image?: SceneRunAsset;
}

export type SceneRunEvent =
  | SceneRunStartedEvent
  | SceneStageStartedEvent
  | SceneStageProgressEvent
  | SceneStageCompletedEvent
  | SceneRunCompletedEvent
  | SceneRunFailedEvent;

export interface StartSceneRunInput {
  project_id: string;
  scene_id: string;
  title: string;
  visual_prompt: string;
  aspect_ratio: "9:16" | "16:9";
  duration_seconds: number;
  generate_video: boolean;
}
