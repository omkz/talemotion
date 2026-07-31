import type {
  ProjectStatus,
  Scene,
  SceneStatus,
  VideoProject,
} from "@/types";
import { ApiClient } from "./client";
import { ApiError } from "./errors";

interface PersistedSceneResponse {
  id: string;
  title: string;
  narration: string;
  visual_prompt: string;
  duration_seconds: number;
  position: number;
  status: "draft" | "ready" | "queued" | "generating" | "completed" | "failed";
  active_asset_id: string | null;
  active_asset_version: number;
  created_at: string;
}

interface PersistedChapterResponse {
  id: string;
  title: string;
  position: number;
  scenes: PersistedSceneResponse[];
}

export interface PersistedProjectResponse {
  id: string;
  mode: "historical_documentary";
  status:
    | "draft"
    | "storyboard_pending"
    | "storyboard_generating"
    | "storyboard_ready"
    | "media_generating"
    | "rendering"
    | "ready"
    | "failed";
  title: string;
  topic: string;
  additional_direction: string;
  language: string;
  duration_seconds: 30 | 45;
  aspect_ratio: "9:16";
  visual_style: string;
  narration_style: string;
  captions_enabled: boolean;
  narration_enabled: boolean;
  music_enabled: boolean;
  historical_accuracy_note: string | null;
  generation_progress: number;
  chapters: PersistedChapterResponse[];
  created_at: string;
  updated_at: string;
}

interface PersistedProjectListResponse {
  items: PersistedProjectResponse[];
  next_cursor: string | null;
  has_more: boolean;
}

function client(): ApiClient {
  return new ApiClient(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
  );
}

function mapProjectStatus(status: PersistedProjectResponse["status"]): ProjectStatus {
  if (status === "storyboard_ready") return "storyboard-ready";
  if (
    status === "storyboard_pending" ||
    status === "storyboard_generating" ||
    status === "media_generating" ||
    status === "rendering"
  ) {
    return "generating";
  }
  return status;
}

function mapSceneStatus(status: PersistedSceneResponse["status"]): SceneStatus {
  if (status === "ready") return "draft";
  if (status === "queued") return "waiting";
  if (status === "generating") return "generating-image";
  return status;
}

function mapScene(scene: PersistedSceneResponse): Scene {
  const activeVersion = Math.max(1, scene.active_asset_version);
  return {
    id: scene.id,
    position: scene.position,
    title: scene.title,
    narration: scene.narration,
    visualPrompt: scene.visual_prompt,
    durationSeconds: scene.duration_seconds,
    status: mapSceneStatus(scene.status),
    activeVersion,
    activeAssetId: scene.active_asset_id,
    versions: [
      {
        version: activeVersion,
        visualPrompt: scene.visual_prompt,
        instruction: null,
        asset: null,
        createdAt: scene.created_at,
      },
    ],
    currentJob: null,
    approved: false,
  };
}

export function mapPersistedProject(response: PersistedProjectResponse): VideoProject {
  return {
    id: response.id,
    mode: "historical-documentary",
    status: mapProjectStatus(response.status),
    brief: {
      mode: "historical-documentary",
      topic: response.topic,
      additionalDirection: response.additional_direction,
      sourceNotes: "",
    },
    output: {
      title: response.title,
      language: response.language,
      duration: response.duration_seconds,
      aspectRatio: response.aspect_ratio,
      visualStyle: response.visual_style,
      narrationStyle: response.narration_style,
      sceneCount: 4,
      captionsEnabled: response.captions_enabled,
      narrationEnabled: response.narration_enabled,
      musicEnabled: response.music_enabled,
    },
    chapters: response.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      position: chapter.position,
      scenes: chapter.scenes.map(mapScene),
    })),
    thumbnailUrl: null,
    historicalAccuracyNote: response.historical_accuracy_note,
    createdAt: response.created_at,
    updatedAt: response.updated_at,
    generationProgress: response.generation_progress,
  };
}

export async function getPersistedProject(
  projectId: string,
  signal?: AbortSignal,
): Promise<VideoProject | null> {
  try {
    const response = await client().get<PersistedProjectResponse>(
      `/projects/${projectId}`,
      { signal },
    );
    return mapPersistedProject(response);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createPersistedHistoricalProject(
  input: {
    title: string;
    topic: string;
    additional_direction: string;
    language: string;
    duration_seconds: 30 | 45;
    visual_style: string;
    narration_style: string;
    captions_enabled: boolean;
    narration_enabled: boolean;
    music_enabled: boolean;
    historical_accuracy_note?: string | null;
  },
  signal?: AbortSignal,
): Promise<VideoProject> {
  const response = await client().post<PersistedProjectResponse>("/projects", {
    body: {
      mode: "historical_documentary",
      aspect_ratio: "9:16",
      ...input,
    },
    signal,
  });
  return mapPersistedProject(response);
}

export async function listPersistedProjects(
  signal?: AbortSignal,
): Promise<VideoProject[]> {
  const response = await client().get<PersistedProjectListResponse>("/projects", {
    signal,
  });
  return response.items.map(mapPersistedProject);
}

export async function updatePersistedProject(
  projectId: string,
  patch: {
    topic?: string;
    additional_direction?: string;
    visual_style?: string;
    narration_style?: string;
    narration_enabled?: boolean;
    captions_enabled?: boolean;
    music_enabled?: boolean;
    historical_accuracy_note?: string | null;
  },
  signal?: AbortSignal,
): Promise<VideoProject> {
  const response = await client().patch<PersistedProjectResponse>(
    `/projects/${projectId}`,
    { body: patch, signal },
  );
  return mapPersistedProject(response);
}

export async function updatePersistedScene(
  sceneId: string,
  patch: {
    title: string;
    narration: string;
    visual_prompt: string;
    duration_seconds: number;
  },
  signal?: AbortSignal,
): Promise<void> {
  await client().patch(`/scenes/${sceneId}`, {
    body: patch,
    signal,
  });
}
