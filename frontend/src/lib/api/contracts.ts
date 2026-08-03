/**
 * JSON DTOs for the future FastAPI service. These types intentionally use
 * snake_case and remain separate from the camelCase frontend domain model.
 */

export type VideoModeDto =
  | "historical_documentary"
  | "microdrama"
  | "product_advertisement";

export type ProjectStatusDto =
  | "draft"
  | "storyboard_ready"
  | "generating"
  | "ready"
  | "failed"
  | "deleted";

export type SceneStatusDto =
  | "draft"
  | "queued"
  | "generating_image"
  | "generating_video"
  | "generating_narration"
  | "uploading_assets"
  | "completed"
  | "failed";

export type AssetTypeDto =
  | "image"
  | "video"
  | "audio"
  | "subtitle"
  | "thumbnail"
  | "final_render";

export type AssetStatusDto =
  | "generating"
  | "ready"
  | "failed"
  | "archived";

export type JobTypeDto =
  | "storyboard"
  | "project_generation"
  | "scene_generation"
  | "scene_regeneration"
  | "final_render"
  | "thumbnail_generation";

export type JobStatusDto =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type RenderStatusDto =
  | "queued"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";

export interface HistoricalDocumentaryBriefDto {
  mode: "historical_documentary";
  topic: string;
  additional_direction: string;
  source_notes: string;
  content_type?: "documentary" | "educational" | "explainer";
  language?: string;
  tone?: "cinematic" | "informative" | "dramatic" | "inspirational" | "neutral";
  target_audience?: string;
}

export interface MicrodramaBriefDto {
  mode: "microdrama";
  premise: string;
  main_character: string;
  genre: string;
  desired_ending: string;
}

export interface ProductAdvertisementBriefDto {
  mode: "product_advertisement";
  product_name: string;
  product_description: string;
  main_benefit: string;
  target_audience: string;
  call_to_action: string;
}

export type VideoBriefDto =
  | HistoricalDocumentaryBriefDto
  | MicrodramaBriefDto
  | ProductAdvertisementBriefDto;

export interface OutputConfigDto {
  title: string;
  language: string;
  duration_seconds: 30 | 45 | 60;
  aspect_ratio: "9:16" | "16:9";
  visual_style: string;
  narration_style: string;
  scene_count: "auto" | 4 | 5 | 6;
  captions_enabled: boolean;
  background_music_enabled: boolean;
}

export interface AssetResponse {
  id: string;
  project_id: string;
  project_title: string;
  chapter_id: string | null;
  scene_id: string | null;
  scene_title: string | null;
  name: string;
  type: AssetTypeDto;
  status: AssetStatusDto;
  version: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number;
  preview_url: string | null;
  download_url: string | null;
  url_expires_at: string | null;
  storage_key: string;
  bucket_display_name: string;
  storage_state: "stored" | "uploading" | "unavailable" | "archived";
  provider: string | null;
  model: string | null;
  orchestration: "genblaze";
  storage_provider: "backblaze_b2";
  manifest_status: "recorded" | "verified" | "pending" | "unavailable";
  sha256: string | null;
  generation_stage: string;
  prompt_saved: boolean;
  created_at: string;
  updated_at: string;
}

export interface SceneVersionResponse {
  version: number;
  visual_prompt: string;
  instruction: string | null;
  asset: AssetResponse | null;
  created_at: string;
}

export interface SceneResponse {
  id: string;
  chapter_id: string;
  position: number;
  title: string;
  narration: string;
  visual_prompt: string;
  duration_seconds: number;
  status: SceneStatusDto;
  active_version: number;
  versions: SceneVersionResponse[];
  current_job: GenerationJobResponse | null;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChapterResponse {
  id: string;
  project_id: string;
  title: string;
  position: number;
  scenes: SceneResponse[];
}

export interface ProjectResponse {
  id: string;
  mode: VideoModeDto;
  status: ProjectStatusDto;
  brief: VideoBriefDto;
  output_config: OutputConfigDto;
  chapters: ChapterResponse[];
  thumbnail_url: string | null;
  historical_accuracy_note: string | null;
  generation_progress: number;
  created_at: string;
  updated_at: string;
}

export interface CursorPageDto<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export type ProjectListResponse = CursorPageDto<ProjectResponse>;

export interface AssetListResponse extends CursorPageDto<AssetResponse> {
  total: number;
}

export interface CreateProjectRequest {
  mode: VideoModeDto;
  brief: VideoBriefDto;
  output_config: OutputConfigDto;
  template_id?: string | null;
}

export interface UpdateProjectRequest {
  title?: string;
  brief?: VideoBriefDto;
  output_config?: OutputConfigDto;
  historical_accuracy_note?: string | null;
}

export interface GenerateStoryboardRequest {
  scene_count?: number;
  additional_instruction?: string | null;
}

export interface GenerateScenesRequest {
  scope: "all_scenes";
}

export interface GenerateSceneRequest {
  stages: Array<"image" | "video" | "narration">;
  additional_instruction?: string | null;
}

export interface RegenerateSceneRequest extends GenerateSceneRequest {
  additional_instruction: string;
}

export interface GenerationJobErrorDto {
  code: string;
  message: string;
  details: Record<string, string | number | boolean | null>;
}

export interface GenerationJobResponse {
  id: string;
  type: JobTypeDto;
  status: JobStatusDto;
  progress: number;
  current_stage: string | null;
  project_id: string | null;
  chapter_id: string | null;
  scene_id: string | null;
  parent_job_id: string | null;
  child_job_ids: string[];
  error: GenerationJobErrorDto | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface CreateRenderRequest {
  captions_enabled: boolean;
  background_music_enabled: boolean;
  resolution: string;
}

export interface RenderResponse {
  id: string;
  project_id: string;
  version: number;
  status: RenderStatusDto;
  resolution: string;
  duration_seconds: number;
  file_size_bytes: number;
  captions_burned: boolean;
  music_included: boolean;
  thumbnail_url: string | null;
  preview_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenderListResponse {
  items: RenderResponse[];
}

export interface SettingsResponse {
  general: {
    default_language: string;
    default_aspect_ratio: "9:16" | "16:9";
    default_duration_seconds: 30 | 45 | 60;
    captions_enabled: boolean;
    background_music_enabled: boolean;
  };
  generation: {
    default_visual_style: string;
    default_narration_style: string;
    preferred_image_provider: string;
    preferred_video_provider: string;
    preferred_voice_provider: string;
    auto_retry_failed_generations: boolean;
    maximum_automatic_retries: number;
  };
  integrations: {
    genblaze_mode: "mock";
    backblaze_mode: "mock";
    b2_bucket_name: string;
    b2_region: string;
  };
  updated_at: string;
}

export interface UpdateSettingsRequest {
  general?: Partial<SettingsResponse["general"]>;
  generation?: Partial<SettingsResponse["generation"]>;
  integrations?: Partial<SettingsResponse["integrations"]>;
}

export interface SignedAssetUrlResponse {
  url: string;
  expires_at: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, string | number | boolean | null>;
    request_id: string;
  };
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  services: {
    database: string;
    queue: string;
    backblaze_b2: string;
    genblaze: string;
  };
}
