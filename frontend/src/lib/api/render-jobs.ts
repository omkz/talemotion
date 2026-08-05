import type { Render } from "@/types";
import { ApiClient } from "./client";
import type { PersistedGenerationJob } from "./scene-generation-jobs";

export interface PersistedRender {
  id: string;
  project_id: string;
  job_id: string | null;
  version: number;
  status: "queued" | "rendering" | "completed" | "failed" | "cancelled";
  asset_id: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  narration_enabled: boolean;
  captions_enabled: boolean;
  music_enabled: boolean;
  created_at: string;
  completed_at: string | null;
}

interface SignedPreviewUrl {
  url: string;
  expires_at: string;
}

interface PersistedRenderList {
  items: PersistedRender[];
}

function client(): ApiClient {
  return new ApiClient(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  );
}

export interface CreateFinalRenderInput {
  narration_enabled: boolean;
  captions_enabled: boolean;
  music_enabled: boolean;
}

export function createFinalRender(
  projectId: string,
  options: CreateFinalRenderInput,
  signal?: AbortSignal,
  idempotencyKey?: string,
): Promise<PersistedGenerationJob> {
  return client().post(`/projects/${projectId}/renders`, {
    body: options,
    signal,
    idempotencyKey,
  });
}

export function getPersistedRender(
  renderId: string,
  signal?: AbortSignal,
): Promise<PersistedRender> {
  return client().get(`/renders/${renderId}`, { signal });
}

export async function getLatestProjectRender(
  projectId: string,
  signal?: AbortSignal,
): Promise<Render | null> {
  const response = await client().get<PersistedRenderList>(
    `/projects/${projectId}/renders`,
    { signal },
  );
  const completed = response.items.find((item) => item.status === "completed");
  if (!completed) return null;
  const previewUrl = await getRenderPreviewUrl(completed.id, signal);
  return mapPersistedRender(completed, previewUrl);
}

export async function getRenderPreviewUrl(
  renderId: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await client().post<SignedPreviewUrl>(
    `/renders/${renderId}/preview-url`,
    { signal },
  );
  return response.url;
}

export function mapPersistedRender(
  render: PersistedRender,
  previewUrl: string,
): Render {
  const status =
    render.status === "completed"
      ? "rendered"
      : render.status === "failed" || render.status === "cancelled"
        ? "failed"
        : "rendering";
  return {
    id: render.id,
    projectId: render.project_id,
    version: render.version,
    status,
    resolution: "1080 × 1920",
    durationSeconds: render.duration_seconds ?? 0,
    fileSizeMb: Number(
      ((render.file_size_bytes ?? 0) / (1024 * 1024)).toFixed(1),
    ),
    captionsBurned: render.captions_enabled,
    narrationIncluded: render.narration_enabled,
    musicIncluded: render.music_enabled,
    thumbnailUrl: null,
    shareUrl: previewUrl,
    createdAt: render.created_at,
  };
}
