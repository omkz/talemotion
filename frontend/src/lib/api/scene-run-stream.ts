import type {
  SceneRunAsset,
  SceneRunEvent,
  SceneRunFailureCode,
  StartSceneRunInput,
} from "@/types";

const EVENT_TYPES = new Set([
  "scene_run.started",
  "scene_image.started",
  "scene_image.progress",
  "scene_image.completed",
  "scene_video.started",
  "scene_video.progress",
  "scene_video.completed",
  "scene_run.completed",
  "scene_run.failed",
]);

const FAILURE_CODES = new Set<SceneRunFailureCode>([
  "missing_configuration",
  "provider_authentication_failed",
  "provider_rate_limited",
  "provider_generation_failed",
  "storage_failed",
  "invalid_request",
  "unknown_error",
]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The scene generation stream returned invalid data.");
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`The scene generation event is missing ${field}.`);
  }
  return value;
}

function asset(value: unknown): SceneRunAsset {
  const data = record(value);
  const kind = string(data.kind, "asset kind");
  if (kind !== "image" && kind !== "video") {
    throw new Error("The scene generation event has an invalid asset kind.");
  }
  return {
    kind,
    media_type: string(data.media_type, "media type"),
    asset_url: string(data.asset_url, "asset URL"),
    preview_url: string(data.preview_url, "preview URL"),
    sha256: string(data.sha256, "SHA-256"),
    provider: "GMICloud",
    model: string(data.model, "model"),
  };
}

export function parseSceneRunEvent(value: unknown): SceneRunEvent {
  const data = record(value);
  const type = string(data.type, "type");
  if (!EVENT_TYPES.has(type)) {
    throw new Error(`Unknown scene generation event: ${type}`);
  }
  const base = {
    run_id: string(data.run_id, "run ID"),
    project_id: string(data.project_id, "project ID"),
    scene_id: string(data.scene_id, "scene ID"),
  };
  if (type === "scene_run.started") return { type, ...base };
  if (type === "scene_image.started" || type === "scene_video.started") {
    return { type, ...base, model: string(data.model, "model") };
  }
  if (type === "scene_image.progress" || type === "scene_video.progress") {
    return {
      type,
      ...base,
      progress: typeof data.progress === "number" ? data.progress : undefined,
      elapsed_seconds:
        typeof data.elapsed_seconds === "number" ? data.elapsed_seconds : undefined,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  }
  if (type === "scene_image.completed" || type === "scene_video.completed") {
    return {
      type,
      ...base,
      asset: asset(data.asset),
      manifest_url: string(data.manifest_url, "manifest URL"),
    };
  }
  if (type === "scene_run.completed") {
    return {
      type,
      ...base,
      image: asset(data.image),
      video: data.video === null ? null : asset(data.video),
      manifest_url: string(data.manifest_url, "manifest URL"),
    };
  }
  const code = string(data.code, "failure code") as SceneRunFailureCode;
  if (!FAILURE_CODES.has(code) || typeof data.retryable !== "boolean") {
    throw new Error("The scene generation failure event is invalid.");
  }
  return {
    type: "scene_run.failed",
    ...base,
    code,
    message: string(data.message, "failure message"),
    retryable: data.retryable,
    image: data.image ? asset(data.image) : undefined,
  };
}

export function createSseDataParser(
  onEvent: (event: SceneRunEvent) => void,
) {
  let buffer = "";
  const consume = (final = false) => {
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = final ? "" : (frames.pop() ?? "");
    for (const frame of frames) {
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(parseSceneRunEvent(JSON.parse(data) as unknown));
    }
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      consume();
    },
    finish() {
      if (buffer.trim()) buffer += "\n\n";
      consume(true);
    },
  };
}

export async function streamSceneRun(
  input: StartSceneRunInput,
  options: {
    signal?: AbortSignal;
    onEvent: (event: SceneRunEvent) => void;
  },
): Promise<void> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
  const response = await fetch(`${baseUrl}/scene-runs/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Scene generation request failed (${response.status}).`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseDataParser(options.onEvent);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.finish();
}

export function resolveScenePreviewUrl(previewUrl: string): string {
  if (/^https?:\/\//.test(previewUrl)) return previewUrl;
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
  return new URL(previewUrl, baseUrl).toString();
}

export const realSceneGenerationEnabled =
  process.env.NEXT_PUBLIC_REAL_SCENE_GENERATION === "true";
