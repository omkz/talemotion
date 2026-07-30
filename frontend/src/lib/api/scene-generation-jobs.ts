import { ApiClient } from "./client";

export const realSceneGenerationEnabled =
  process.env.NEXT_PUBLIC_REAL_SCENE_GENERATION === "true";

export type PersistedJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export interface PersistedJobChild {
  id: string;
  scene_id: string | null;
  status: PersistedJobStatus;
  progress: number;
  result_asset_id: string | null;
}

export interface PersistedGenerationJob {
  id: string;
  project_id: string;
  scene_id: string | null;
  parent_job_id: string | null;
  type:
    | "storyboard"
    | "scene_generation"
    | "scene_regeneration"
    | "project_generation"
    | "render";
  status: PersistedJobStatus;
  progress: number;
  current_stage: string | null;
  result_payload: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  children: PersistedJobChild[];
}

export interface PersistedAsset {
  id: string;
  scene_id: string | null;
  type: "image" | "video" | "audio" | "subtitle" | "manifest" | "thumbnail" | "final_video";
  status: "pending" | "available" | "failed" | "archived";
  version: number;
  provider: string | null;
  model_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  sha256: string | null;
  provenance_object_key: string | null;
  created_at: string;
}

interface SignedPreviewUrl {
  url: string;
  expires_at: string;
}

function client(): ApiClient {
  return new ApiClient(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  );
}

export function createSceneGeneration(
  sceneId: string,
  signal?: AbortSignal,
): Promise<PersistedGenerationJob> {
  return client().post(`/scenes/${sceneId}/generations`, {
    body: { duration_seconds: 5, generate_video: true },
    signal,
  });
}

export function createStoryboardGeneration(
  projectId: string,
  replaceExisting: boolean,
  signal?: AbortSignal,
): Promise<PersistedGenerationJob> {
  return client().post(`/projects/${projectId}/storyboard`, {
    body: { replace_existing: replaceExisting },
    signal,
  });
}

export function createProjectGeneration(
  projectId: string,
  signal?: AbortSignal,
): Promise<PersistedGenerationJob> {
  return client().post(`/projects/${projectId}/generations`, {
    body: { generate_video: true },
    signal,
  });
}

export function getPersistedJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<PersistedGenerationJob> {
  return client().get(`/jobs/${jobId}`, { signal });
}

export function retryPersistedJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<PersistedGenerationJob> {
  return client().post(`/jobs/${jobId}/retry`, { signal });
}

export function getPersistedAsset(
  assetId: string,
  signal?: AbortSignal,
): Promise<PersistedAsset> {
  return client().get(`/assets/${assetId}`, { signal });
}

export async function getAssetPreviewUrl(
  assetId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await client().post<SignedPreviewUrl>(
    `/assets/${assetId}/preview-url`,
    { signal },
  );
  return response.url;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function pollPersistedJob(
  jobId: string,
  options: {
    signal?: AbortSignal;
    onUpdate: (job: PersistedGenerationJob) => void | Promise<void>;
  },
): Promise<PersistedGenerationJob> {
  while (true) {
    const job = await getPersistedJob(jobId, options.signal);
    await options.onUpdate(job);
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    ) {
      return job;
    }
    await wait(1_500, options.signal);
  }
}

export function resultAssetId(
  job: PersistedGenerationJob,
): string | null {
  const value =
    job.result_payload?.video_asset_id ??
    job.result_payload?.image_asset_id ??
    job.result_payload?.asset_id;
  return typeof value === "string" ? value : null;
}
