import type {
  AppSettings,
  GenerationJob,
  MediaAssetFilters,
  MediaAssetPage,
  ModeBrief,
  OutputConfig,
  Render,
  VideoMode,
  VideoProject,
} from "@/types";

export interface RequestContext {
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export interface ProjectListFilters {
  status?: VideoProject["status"];
  mode?: VideoMode;
  search?: string;
  limit?: number;
  cursor?: string | null;
}

export interface CreateVideoProjectInput {
  mode: VideoMode;
  brief: ModeBrief;
  output: OutputConfig;
}

export interface GenerateStoryboardOptions {
  sceneCount?: number;
  additionalInstruction?: string | null;
}

export interface GenerateSceneOptions {
  stages?: Array<"image" | "video" | "narration">;
  additionalInstruction?: string | null;
}

export interface CreateRenderOptions {
  captionsEnabled?: boolean;
  backgroundMusicEnabled?: boolean;
  resolution?: string;
}

/**
 * Stable frontend boundary. UI code consumes domain types; implementations
 * own persistence, HTTP DTOs, validation, and mapping.
 */
export interface VideoProjectApi {
  listProjects(
    filters?: ProjectListFilters,
    context?: RequestContext
  ): Promise<VideoProject[]>;
  getProject(
    projectId: string,
    context?: RequestContext
  ): Promise<VideoProject | null>;
  createProject(
    input: CreateVideoProjectInput,
    context?: RequestContext
  ): Promise<VideoProject>;
  updateProject(
    project: VideoProject,
    context?: RequestContext
  ): Promise<VideoProject>;
  deleteProject(
    projectId: string,
    context?: RequestContext
  ): Promise<void>;

  generateStoryboard(
    projectId: string,
    options?: GenerateStoryboardOptions,
    context?: RequestContext
  ): Promise<GenerationJob>;
  generateAllScenes(
    projectId: string,
    context?: RequestContext
  ): Promise<GenerationJob>;
  generateScene(
    sceneId: string,
    options?: GenerateSceneOptions,
    context?: RequestContext
  ): Promise<GenerationJob>;
  regenerateScene(
    sceneId: string,
    instruction?: string,
    context?: RequestContext
  ): Promise<GenerationJob>;
  getJob(jobId: string, context?: RequestContext): Promise<GenerationJob>;
  retryJob(jobId: string, context?: RequestContext): Promise<GenerationJob>;
  cancelJob(jobId: string, context?: RequestContext): Promise<GenerationJob>;

  listAssets(
    filters?: MediaAssetFilters,
    context?: RequestContext
  ): Promise<MediaAssetPage>;
  getAsset(
    assetId: string,
    context?: RequestContext
  ): Promise<MediaAssetPage["items"][number] | null>;
  getAssetPreviewUrl(
    assetId: string,
    context?: RequestContext
  ): Promise<string>;
  getAssetDownloadUrl(
    assetId: string,
    context?: RequestContext
  ): Promise<string>;
  archiveAsset(
    assetId: string,
    context?: RequestContext
  ): Promise<MediaAssetPage["items"][number]>;
  restoreAsset(
    assetId: string,
    context?: RequestContext
  ): Promise<MediaAssetPage["items"][number]>;
  deleteAsset(assetId: string, context?: RequestContext): Promise<void>;

  createRender(
    projectId: string,
    options?: CreateRenderOptions,
    context?: RequestContext
  ): Promise<GenerationJob>;
  getRender(
    renderId: string,
    context?: RequestContext
  ): Promise<Render | null>;
  listProjectRenders(
    projectId: string,
    context?: RequestContext
  ): Promise<Render[]>;

  getSettings(context?: RequestContext): Promise<AppSettings>;
  updateSettings(
    settings: AppSettings,
    context?: RequestContext
  ): Promise<AppSettings>;
}
