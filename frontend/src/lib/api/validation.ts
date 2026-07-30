import { z } from "zod";
import type {
  ApiErrorBody,
  GenerationJobResponse,
  ProjectResponse,
} from "./contracts";

const nullableString = z.string().nullable();

export const errorResponseSchema: z.ZodType<ApiErrorBody> = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()])
    ),
    request_id: z.string(),
  }),
});

export const generationJobResponseSchema: z.ZodType<GenerationJobResponse> =
  z.object({
    id: z.string(),
    type: z.enum([
      "storyboard",
      "project_generation",
      "scene_generation",
      "scene_regeneration",
      "final_render",
      "thumbnail_generation",
    ]),
    status: z.enum([
      "queued",
      "running",
      "completed",
      "failed",
      "cancelled",
    ]),
    progress: z.number().min(0).max(100),
    current_stage: nullableString,
    project_id: nullableString,
    chapter_id: nullableString,
    scene_id: nullableString,
    parent_job_id: nullableString,
    child_job_ids: z.array(z.string()),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean(), z.null()])
        ),
      })
      .nullable(),
    created_at: z.string().datetime(),
    started_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
  });

const assetResponseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  project_title: z.string(),
  chapter_id: nullableString,
  scene_id: nullableString,
  scene_title: nullableString,
  name: z.string(),
  type: z.enum([
    "image",
    "video",
    "audio",
    "subtitle",
    "thumbnail",
    "final_render",
  ]),
  status: z.enum(["generating", "ready", "failed", "archived"]),
  version: z.number().int().positive(),
  mime_type: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  duration_seconds: z.number().nonnegative().nullable(),
  file_size_bytes: z.number().int().nonnegative(),
  preview_url: nullableString,
  download_url: nullableString,
  url_expires_at: nullableString,
  storage_key: z.string(),
  bucket_display_name: z.string(),
  storage_state: z.enum([
    "stored",
    "uploading",
    "unavailable",
    "archived",
  ]),
  provider: nullableString,
  model: nullableString,
  orchestration: z.literal("genblaze"),
  storage_provider: z.literal("backblaze_b2"),
  manifest_status: z.enum(["verified", "pending", "unavailable"]),
  sha256: nullableString,
  generation_stage: z.string(),
  prompt_saved: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

const sceneResponseSchema = z.lazy(() =>
  z.object({
    id: z.string(),
    chapter_id: z.string(),
    position: z.number().int().positive(),
    title: z.string(),
    narration: z.string(),
    visual_prompt: z.string(),
    duration_seconds: z.number().nonnegative(),
    status: z.enum([
      "draft",
      "queued",
      "generating_image",
      "generating_video",
      "generating_narration",
      "uploading_assets",
      "completed",
      "failed",
    ]),
    active_version: z.number().int().positive(),
    versions: z.array(
      z.object({
        version: z.number().int().positive(),
        visual_prompt: z.string(),
        instruction: nullableString,
        asset: assetResponseSchema.nullable(),
        created_at: z.string().datetime(),
      })
    ),
    current_job: generationJobResponseSchema.nullable(),
    approved: z.boolean(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
);

const briefSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("historical_documentary"),
    topic: z.string(),
    additional_direction: z.string(),
    source_notes: z.string(),
  }),
  z.object({
    mode: z.literal("microdrama"),
    premise: z.string(),
    main_character: z.string(),
    genre: z.string(),
    desired_ending: z.string(),
  }),
  z.object({
    mode: z.literal("product_advertisement"),
    product_name: z.string(),
    product_description: z.string(),
    main_benefit: z.string(),
    target_audience: z.string(),
    call_to_action: z.string(),
  }),
]);

export const projectResponseSchema: z.ZodType<ProjectResponse> = z.object({
  id: z.string(),
  mode: z.enum([
    "historical_documentary",
    "microdrama",
    "product_advertisement",
  ]),
  status: z.enum([
    "draft",
    "storyboard_ready",
    "generating",
    "ready",
    "failed",
    "deleted",
  ]),
  brief: briefSchema,
  output_config: z.object({
    title: z.string(),
    language: z.string(),
    duration_seconds: z.union([
      z.literal(30),
      z.literal(45),
      z.literal(60),
    ]),
    aspect_ratio: z.enum(["9:16", "16:9"]),
    visual_style: z.string(),
    narration_style: z.string(),
    scene_count: z.union([
      z.literal("auto"),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    captions_enabled: z.boolean(),
    background_music_enabled: z.boolean(),
  }),
  chapters: z.array(
    z.object({
      id: z.string(),
      project_id: z.string(),
      title: z.string(),
      position: z.number().int().positive(),
      scenes: z.array(sceneResponseSchema),
    })
  ),
  thumbnail_url: nullableString,
  historical_accuracy_note: nullableString,
  generation_progress: z.number().min(0).max(100),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
