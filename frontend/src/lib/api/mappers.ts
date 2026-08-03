import type {
  AppSettings,
  Asset,
  GenerationJob,
  GenerationStage,
  MediaLibraryAsset,
  ModeBrief,
  Render,
  Scene,
  SceneStatus,
  VideoMode,
  VideoProject,
} from "@/types";
import type {
  AssetResponse,
  CreateProjectRequest,
  GenerationJobResponse,
  ProjectResponse,
  RenderResponse,
  SceneResponse,
  SettingsResponse,
  UpdateProjectRequest,
  UpdateSettingsRequest,
  VideoBriefDto,
  VideoModeDto,
} from "./contracts";
import type { CreateVideoProjectInput } from "./video-project-api";

function mapVideoModeToDto(mode: VideoMode): VideoModeDto {
  switch (mode) {
    case "historical-documentary":
      return "historical_documentary";
    case "custom-video":
      return "custom_video";
    case "product-advertisement":
      return "product_advertisement";
    case "microdrama":
      return "microdrama";
  }
}

function mapVideoModeToDomain(mode: VideoModeDto): VideoMode {
  switch (mode) {
    case "historical_documentary":
      return "historical-documentary";
    case "custom_video":
      return "custom-video";
    case "product_advertisement":
      return "product-advertisement";
    case "microdrama":
      return "microdrama";
  }
}

function mapBriefToDto(brief: ModeBrief): VideoBriefDto {
  switch (brief.mode) {
    case "historical-documentary":
      return {
        mode: "historical_documentary",
        topic: brief.topic,
        additional_direction: brief.additionalDirection,
        source_notes: brief.sourceNotes,
        content_type: "documentary",
        language: brief.language,
        tone: brief.tone,
        target_audience: brief.targetAudience,
      };
    case "custom-video":
      return {
        mode: "custom_video",
        prompt: brief.prompt,
        source_notes: brief.sourceNotes,
        language: brief.language,
        target_audience: brief.targetAudience,
      };
    case "microdrama":
      return {
        mode: "microdrama",
        premise: brief.premise,
        main_character: brief.mainCharacter,
        genre: brief.genre,
        desired_ending: brief.desiredEnding,
      };
    case "product-advertisement":
      return {
        mode: "product_advertisement",
        product_name: brief.productName,
        product_description: brief.productDescription,
        main_benefit: brief.mainBenefit,
        target_audience: brief.targetAudience,
        call_to_action: brief.callToAction,
      };
  }
}

function mapBriefToDomain(brief: VideoBriefDto): ModeBrief {
  switch (brief.mode) {
    case "historical_documentary":
      return {
        mode: "historical-documentary",
        topic: brief.topic,
        additionalDirection: brief.additional_direction,
        sourceNotes: brief.source_notes,
        language: brief.language ?? "en",
        tone: brief.tone ?? "cinematic",
        targetAudience: brief.target_audience ?? "General audience",
      };
    case "custom_video":
      return {
        mode: "custom-video",
        prompt: brief.prompt,
        sourceNotes: brief.source_notes,
        language: brief.language,
        targetAudience: brief.target_audience,
      };
    case "microdrama":
      return {
        mode: "microdrama",
        premise: brief.premise,
        mainCharacter: brief.main_character,
        genre: brief.genre,
        desiredEnding: brief.desired_ending,
      };
    case "product_advertisement":
      return {
        mode: "product-advertisement",
        productName: brief.product_name,
        productDescription: brief.product_description,
        mainBenefit: brief.main_benefit,
        targetAudience: brief.target_audience,
        callToAction: brief.call_to_action,
      };
  }
}

function mapJobStage(job: GenerationJobResponse): GenerationStage {
  if (job.status === "completed") return "completed";
  if (job.status === "failed" || job.status === "cancelled") return "failed";
  switch (job.current_stage) {
    case "generating_image":
      return "generating-image";
    case "generating_video":
      return "generating-video";
    case "generating_narration":
      return "generating-narration";
    case "uploading_assets":
      return "uploading-assets";
    default:
      return "waiting";
  }
}

function mapSceneStatus(status: SceneResponse["status"]): SceneStatus {
  switch (status) {
    case "queued":
      return "waiting";
    case "generating_image":
      return "generating-image";
    case "generating_video":
      return "generating-video";
    case "generating_narration":
      return "generating-narration";
    case "uploading_assets":
      return "uploading-assets";
    default:
      return status;
  }
}

function mapEmbeddedAssetToDomain(asset: AssetResponse): Asset {
  return {
    id: asset.id,
    sceneId: asset.scene_id ?? "",
    kind:
      asset.type === "audio"
        ? "narration-audio"
        : asset.type === "image" || asset.type === "thumbnail"
          ? "image"
          : "video",
    previewUrl: asset.preview_url,
    version: asset.version,
    provider: asset.provider ?? "Unknown provider",
    model: asset.model ?? "Unknown model",
    orchestration: "Genblaze",
    storageProvider: "Backblaze B2",
    manifestStatus:
      asset.manifest_status === "unavailable"
        ? "failed"
        : asset.manifest_status,
    promptSaved: asset.prompt_saved,
    sha256: asset.sha256 ?? "",
    generationDurationMs: 0,
    createdAt: asset.created_at,
  };
}

export function mapGenerationJobResponseToDomain(
  job: GenerationJobResponse
): GenerationJob {
  return {
    id: job.id,
    sceneId: job.scene_id ?? "",
    stage: mapJobStage(job),
    progress: job.progress,
    errorMessage: job.error?.message ?? null,
    startedAt: job.started_at ?? job.created_at,
    completedAt: job.completed_at,
  };
}

export function mapSceneResponseToDomain(scene: SceneResponse): Scene {
  return {
    id: scene.id,
    position: scene.position,
    title: scene.title,
    narration: scene.narration,
    visualPrompt: scene.visual_prompt,
    durationSeconds: scene.duration_seconds,
    status: mapSceneStatus(scene.status),
    activeVersion: scene.active_version,
    versions: scene.versions.map((version) => ({
      version: version.version,
      visualPrompt: version.visual_prompt,
      instruction: version.instruction,
      asset: version.asset
        ? mapEmbeddedAssetToDomain(version.asset)
        : null,
      createdAt: version.created_at,
    })),
    currentJob: scene.current_job
      ? mapGenerationJobResponseToDomain(scene.current_job)
      : null,
    approved: scene.approved,
  };
}

export function mapProjectResponseToDomain(
  project: ProjectResponse
): VideoProject {
  return {
    id: project.id,
    mode: mapVideoModeToDomain(project.mode),
    status:
      project.status === "storyboard_ready"
        ? "storyboard-ready"
        : project.status === "deleted"
          ? "failed"
          : project.status,
    brief: mapBriefToDomain(project.brief),
    output: {
      title: project.output_config.title,
      language: project.output_config.language,
      duration: project.output_config.duration_seconds,
      aspectRatio: project.output_config.aspect_ratio,
      visualStyle: project.output_config.visual_style,
      narrationStyle: project.output_config.narration_style,
      sceneCount: project.output_config.scene_count,
      captionsEnabled: project.output_config.captions_enabled,
      musicEnabled: project.output_config.background_music_enabled,
    },
    chapters: project.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      position: chapter.position,
      scenes: chapter.scenes.map(mapSceneResponseToDomain),
    })),
    thumbnailUrl: project.thumbnail_url,
    historicalAccuracyNote: project.historical_accuracy_note,
    generationProgress: project.generation_progress,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

export function mapAssetResponseToDomain(
  asset: AssetResponse
): MediaLibraryAsset {
  return {
    id: asset.id,
    projectId: asset.project_id,
    projectTitle: asset.project_title,
    chapterId: asset.chapter_id ?? undefined,
    sceneId: asset.scene_id ?? undefined,
    sceneTitle: asset.scene_title ?? undefined,
    name: asset.name,
    type: asset.type === "final_render" ? "final-render" : asset.type,
    status: asset.status,
    version: asset.version,
    mimeType: asset.mime_type,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    durationSeconds: asset.duration_seconds ?? undefined,
    fileSizeBytes: asset.file_size_bytes,
    previewUrl: asset.preview_url,
    storageKey: asset.storage_key,
    provider: asset.provider ?? undefined,
    model: asset.model ?? undefined,
    orchestration: "genblaze",
    storageProvider: "backblaze-b2",
    storageState: asset.storage_state,
    manifestStatus: asset.manifest_status,
    sha256: asset.sha256 ?? undefined,
    generationStage: asset.generation_stage,
    promptSaved: asset.prompt_saved,
    signedUrlStatus: asset.preview_url ? "available" : "unavailable",
    createdAt: asset.created_at,
    updatedAt: asset.updated_at,
  };
}

export function mapRenderResponseToDomain(render: RenderResponse): Render {
  return {
    id: render.id,
    projectId: render.project_id,
    version: render.version,
    status:
      render.status === "completed"
        ? "rendered"
        : render.status === "queued" || render.status === "rendering"
          ? "rendering"
          : "failed",
    resolution: render.resolution,
    durationSeconds: render.duration_seconds,
    fileSizeMb: render.file_size_bytes / 1_000_000,
    captionsBurned: render.captions_burned,
    musicIncluded: render.music_included,
    thumbnailUrl: render.thumbnail_url,
    shareUrl: render.preview_url,
    createdAt: render.created_at,
  };
}

const imageProviders: AppSettings["generation"]["preferredImageProvider"][] =
  ["Automatic", "GMI Cloud", "OpenAI", "Google", "NVIDIA NIM"];
const videoProviders: AppSettings["generation"]["preferredVideoProvider"][] =
  ["Automatic", "GMI Cloud", "Runway", "Luma", "Decart"];
const voiceProviders: AppSettings["generation"]["preferredVoiceProvider"][] =
  ["Automatic", "ElevenLabs", "OpenAI", "Google"];
const visualStyles: AppSettings["generation"]["defaultVisualStyle"][] = [
  "Cinematic Realistic",
  "Epic Historical",
  "Cinematic Drama",
  "Dark Cinematic",
  "Clean Commercial",
  "Animated Illustration",
];
const narrationStyles: AppSettings["generation"]["defaultNarrationStyle"][] = [
  "Documentary",
  "Energetic Documentary",
  "Emotional",
  "Suspenseful",
  "Promotional",
  "Conversational",
];
const languages: AppSettings["general"]["defaultLanguage"][] = [
  "English",
  "Indonesian",
  "Spanish",
  "French",
  "German",
];

function includesValue<T extends string>(
  values: readonly T[],
  value: string
): value is T {
  return values.some((candidate) => candidate === value);
}

export function mapSettingsResponseToDomain(
  settings: SettingsResponse
): AppSettings {
  return {
    general: {
      defaultLanguage: includesValue(
        languages,
        settings.general.default_language
      )
        ? settings.general.default_language
        : "English",
      defaultAspectRatio: settings.general.default_aspect_ratio,
      defaultDuration: settings.general.default_duration_seconds,
      captionsEnabled: settings.general.captions_enabled,
      backgroundMusicEnabled:
        settings.general.background_music_enabled,
    },
    generation: {
      defaultVisualStyle: includesValue(
        visualStyles,
        settings.generation.default_visual_style
      )
        ? settings.generation.default_visual_style
        : "Cinematic Realistic",
      defaultNarrationStyle: includesValue(
        narrationStyles,
        settings.generation.default_narration_style
      )
        ? settings.generation.default_narration_style
        : "Documentary",
      preferredImageProvider: includesValue(
        imageProviders,
        settings.generation.preferred_image_provider
      )
        ? settings.generation.preferred_image_provider
        : "Automatic",
      preferredVideoProvider: includesValue(
        videoProviders,
        settings.generation.preferred_video_provider
      )
        ? settings.generation.preferred_video_provider
        : "Automatic",
      preferredVoiceProvider: includesValue(
        voiceProviders,
        settings.generation.preferred_voice_provider
      )
        ? settings.generation.preferred_voice_provider
        : "Automatic",
      autoRetryFailedGenerations:
        settings.generation.auto_retry_failed_generations,
      maximumAutomaticRetries:
        settings.generation.maximum_automatic_retries,
    },
    integrations: {
      genblazeMode: settings.integrations.genblaze_mode,
      backblazeMode: settings.integrations.backblaze_mode,
      b2BucketName: settings.integrations.b2_bucket_name,
      b2Region: settings.integrations.b2_region,
    },
  };
}

export function mapCreateProjectInputToRequest(
  input: CreateVideoProjectInput
): CreateProjectRequest {
  return {
    mode: mapVideoModeToDto(input.mode),
    brief: mapBriefToDto(input.brief),
    output_config: {
      title: input.output.title,
      language: input.output.language,
      duration_seconds: input.output.duration,
      aspect_ratio: input.output.aspectRatio,
      visual_style: input.output.visualStyle,
      narration_style: input.output.narrationStyle,
      scene_count: input.output.sceneCount,
      captions_enabled: input.output.captionsEnabled,
      background_music_enabled: input.output.musicEnabled,
    },
  };
}

export function mapProjectUpdateToRequest(
  project: VideoProject
): UpdateProjectRequest {
  return {
    title: project.output.title,
    brief: mapBriefToDto(project.brief),
    output_config: {
      title: project.output.title,
      language: project.output.language,
      duration_seconds: project.output.duration,
      aspect_ratio: project.output.aspectRatio,
      visual_style: project.output.visualStyle,
      narration_style: project.output.narrationStyle,
      scene_count: project.output.sceneCount,
      captions_enabled: project.output.captionsEnabled,
      background_music_enabled: project.output.musicEnabled,
    },
    historical_accuracy_note: project.historicalAccuracyNote,
  };
}

export function mapSettingsToUpdateRequest(
  settings: AppSettings
): UpdateSettingsRequest {
  return {
    general: {
      default_language: settings.general.defaultLanguage,
      default_aspect_ratio: settings.general.defaultAspectRatio,
      default_duration_seconds: settings.general.defaultDuration,
      captions_enabled: settings.general.captionsEnabled,
      background_music_enabled:
        settings.general.backgroundMusicEnabled,
    },
    generation: {
      default_visual_style: settings.generation.defaultVisualStyle,
      default_narration_style:
        settings.generation.defaultNarrationStyle,
      preferred_image_provider:
        settings.generation.preferredImageProvider,
      preferred_video_provider:
        settings.generation.preferredVideoProvider,
      preferred_voice_provider:
        settings.generation.preferredVoiceProvider,
      auto_retry_failed_generations:
        settings.generation.autoRetryFailedGenerations,
      maximum_automatic_retries:
        settings.generation.maximumAutomaticRetries,
    },
    integrations: {
      genblaze_mode: settings.integrations.genblazeMode,
      backblaze_mode: settings.integrations.backblazeMode,
      b2_bucket_name: settings.integrations.b2BucketName,
      b2_region: settings.integrations.b2Region,
    },
  };
}
