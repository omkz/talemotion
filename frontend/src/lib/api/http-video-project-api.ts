import type {
  AppSettings,
  MediaAssetFilters,
  VideoProject,
} from "@/types";
import { ApiClient } from "./client";
import type {
  AssetListResponse,
  AssetResponse,
  CreateRenderRequest,
  GenerationJobResponse,
  ProjectListResponse,
  ProjectResponse,
  RenderListResponse,
  RenderResponse,
  SettingsResponse,
  SignedAssetUrlResponse,
} from "./contracts";
import { ApiError } from "./errors";
import {
  mapAssetResponseToDomain,
  mapCreateProjectInputToRequest,
  mapGenerationJobResponseToDomain,
  mapProjectResponseToDomain,
  mapProjectUpdateToRequest,
  mapRenderResponseToDomain,
  mapSettingsResponseToDomain,
  mapSettingsToUpdateRequest,
} from "./mappers";
import {
  generationJobResponseSchema,
  projectResponseSchema,
} from "./validation";
import type {
  CreateRenderOptions,
  CreateVideoProjectInput,
  GenerateSceneOptions,
  GenerateStoryboardOptions,
  ProjectListFilters,
  RequestContext,
  VideoProjectApi,
} from "./video-project-api";

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function mapProjectStatus(status?: ProjectListFilters["status"]) {
  return status === "storyboard-ready" ? "storyboard_ready" : status;
}

function mapVideoMode(mode?: ProjectListFilters["mode"]) {
  if (mode === "historical-documentary") return "historical_documentary";
  if (mode === "custom-video") return "custom_video";
  if (mode === "product-advertisement") return "product_advertisement";
  return mode;
}

function generationContext(context?: RequestContext) {
  return {
    signal: context?.signal,
    idempotencyKey: context?.idempotencyKey,
  };
}

/**
 * Inactive HTTP implementation for the future FastAPI service. Constructing
 * this class performs no request; methods only use native fetch when called.
 */
export class HttpVideoProjectApi implements VideoProjectApi {
  private readonly client: ApiClient;

  constructor(baseUrl: string) {
    this.client = new ApiClient(baseUrl);
  }

  async listProjects(
    filters: ProjectListFilters = {},
    context?: RequestContext
  ) {
    const response = await this.client.get<ProjectListResponse>("/projects", {
      query: {
        status: mapProjectStatus(filters.status),
        mode: mapVideoMode(filters.mode),
        search: filters.search,
        limit: filters.limit ?? 100,
        cursor: filters.cursor,
      },
      signal: context?.signal,
    });
    const projects = projectResponseSchema.array().parse(response.items);
    return projects.map(mapProjectResponseToDomain);
  }

  async getProject(projectId: string, context?: RequestContext) {
    try {
      const response = await this.client.get<ProjectResponse>(
        `/projects/${projectId}`,
        { signal: context?.signal }
      );
      return mapProjectResponseToDomain(
        projectResponseSchema.parse(response)
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async createProject(
    input: CreateVideoProjectInput,
    context?: RequestContext
  ) {
    const response = await this.client.post<ProjectResponse>("/projects", {
      body: mapCreateProjectInputToRequest(input),
      signal: context?.signal,
    });
    return mapProjectResponseToDomain(projectResponseSchema.parse(response));
  }

  async updateProject(
    project: VideoProject,
    context?: RequestContext
  ) {
    const response = await this.client.patch<ProjectResponse>(
      `/projects/${project.id}`,
      {
        body: mapProjectUpdateToRequest(project),
        signal: context?.signal,
      }
    );
    return mapProjectResponseToDomain(projectResponseSchema.parse(response));
  }

  deleteProject(projectId: string, context?: RequestContext) {
    return this.client.delete<void>(`/projects/${projectId}`, {
      signal: context?.signal,
    });
  }

  async generateStoryboard(
    projectId: string,
    options: GenerateStoryboardOptions = {},
    context?: RequestContext
  ) {
    const response = await this.client.post<GenerationJobResponse>(
      `/projects/${projectId}/storyboard`,
      {
        body: {
          scene_count: options.sceneCount,
          additional_instruction: options.additionalInstruction ?? null,
        },
        ...generationContext(context),
      }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async generateAllScenes(
    projectId: string,
    context?: RequestContext
  ) {
    const response = await this.client.post<GenerationJobResponse>(
      `/projects/${projectId}/generations`,
      {
        body: { scope: "all_scenes" },
        ...generationContext(context),
      }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async generateScene(
    sceneId: string,
    options: GenerateSceneOptions = {},
    context?: RequestContext
  ) {
    const response = await this.client.post<GenerationJobResponse>(
      `/scenes/${sceneId}/generations`,
      {
        body: {
          stages: options.stages ?? ["image", "video", "narration"],
          additional_instruction: options.additionalInstruction ?? null,
        },
        ...generationContext(context),
      }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async regenerateScene(
    sceneId: string,
    instruction = "",
    context?: RequestContext
  ) {
    const response = await this.client.post<GenerationJobResponse>(
      `/scenes/${sceneId}/regenerations`,
      {
        body: {
          stages: ["image", "video"],
          additional_instruction: instruction,
        },
        ...generationContext(context),
      }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async getJob(jobId: string, context?: RequestContext) {
    const response = await this.client.get<GenerationJobResponse>(
      `/jobs/${jobId}`,
      { signal: context?.signal }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async retryJob(jobId: string, context?: RequestContext) {
    const response = await this.client.post<GenerationJobResponse>(
      `/jobs/${jobId}/retry`,
      generationContext(context)
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async cancelJob(jobId: string, context?: RequestContext) {
    const response = await this.client.post<GenerationJobResponse>(
      `/jobs/${jobId}/cancel`,
      { signal: context?.signal }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async listAssets(
    filters: MediaAssetFilters = {},
    context?: RequestContext
  ) {
    const response = await this.client.get<AssetListResponse>("/assets", {
      query: {
        project_id:
          filters.projectId === "all" ? undefined : filters.projectId,
        chapter_id: filters.chapterId,
        scene_id: filters.sceneId,
        type:
          filters.type === "all"
            ? undefined
            : filters.type === "final-render"
              ? "final_render"
              : filters.type,
        status: filters.status === "all" ? undefined : filters.status,
        search: filters.search,
        sort: filters.sort,
        limit: filters.limit ?? 15,
        cursor: filters.cursor,
      },
      signal: context?.signal,
    });
    return {
      items: response.items.map(mapAssetResponseToDomain),
      nextCursor: response.next_cursor,
      total: response.total,
    };
  }

  async getAsset(assetId: string, context?: RequestContext) {
    try {
      const response = await this.client.get<AssetResponse>(
        `/assets/${assetId}`,
        { signal: context?.signal }
      );
      return mapAssetResponseToDomain(response);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getAssetPreviewUrl(assetId: string, context?: RequestContext) {
    const response = await this.client.post<SignedAssetUrlResponse>(
      `/assets/${assetId}/preview-url`,
      { signal: context?.signal }
    );
    return response.url;
  }

  async getAssetDownloadUrl(assetId: string, context?: RequestContext) {
    const response = await this.client.post<SignedAssetUrlResponse>(
      `/assets/${assetId}/download-url`,
      { signal: context?.signal }
    );
    return response.url;
  }

  async archiveAsset(assetId: string, context?: RequestContext) {
    const response = await this.client.post<AssetResponse>(
      `/assets/${assetId}/archive`,
      { signal: context?.signal }
    );
    return mapAssetResponseToDomain(response);
  }

  async restoreAsset(assetId: string, context?: RequestContext) {
    const response = await this.client.post<AssetResponse>(
      `/assets/${assetId}/restore`,
      { signal: context?.signal }
    );
    return mapAssetResponseToDomain(response);
  }

  deleteAsset(assetId: string, context?: RequestContext) {
    return this.client.delete<void>(`/assets/${assetId}`, {
      signal: context?.signal,
    });
  }

  async createRender(
    projectId: string,
    options: CreateRenderOptions = {},
    context?: RequestContext
  ) {
    const request: CreateRenderRequest = {
      captions_enabled: options.captionsEnabled ?? false,
      background_music_enabled: options.backgroundMusicEnabled ?? false,
      resolution: options.resolution ?? "1080x1920",
    };
    const response = await this.client.post<GenerationJobResponse>(
      `/projects/${projectId}/renders`,
      {
        body: request,
        ...generationContext(context),
      }
    );
    return mapGenerationJobResponseToDomain(
      generationJobResponseSchema.parse(response)
    );
  }

  async getRender(renderId: string, context?: RequestContext) {
    try {
      const response = await this.client.get<RenderResponse>(
        `/renders/${renderId}`,
        { signal: context?.signal }
      );
      return mapRenderResponseToDomain(response);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async listProjectRenders(
    projectId: string,
    context?: RequestContext
  ) {
    const response = await this.client.get<RenderListResponse>(
      `/projects/${projectId}/renders`,
      { signal: context?.signal }
    );
    return response.items.map(mapRenderResponseToDomain);
  }

  async getSettings(context?: RequestContext) {
    const response = await this.client.get<SettingsResponse>("/settings", {
      signal: context?.signal,
    });
    return mapSettingsResponseToDomain(response);
  }

  async updateSettings(
    settings: AppSettings,
    context?: RequestContext
  ) {
    const response = await this.client.patch<SettingsResponse>("/settings", {
      body: mapSettingsToUpdateRequest(settings),
      signal: context?.signal,
    });
    return mapSettingsResponseToDomain(response);
  }
}
