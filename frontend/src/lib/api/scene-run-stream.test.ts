import { describe, expect, it } from "vitest";
import {
  createSseDataParser,
  parseSceneRunEvent,
} from "./scene-run-stream";
import type { SceneRunEvent } from "@/types";

const base = {
  run_id: "run_123",
  project_id: "project_majapahit",
  scene_id: "scene_01",
};

describe("scene run SSE parser", () => {
  it("parses events split across stream chunks", () => {
    const events: SceneRunEvent[] = [];
    const parser = createSseDataParser((event) => events.push(event));
    const payload = JSON.stringify({ type: "scene_run.started", ...base });
    parser.push(`event: scene_run.started\ndata: ${payload.slice(0, 20)}`);
    parser.push(`${payload.slice(20)}\n\n`);
    parser.finish();

    expect(events).toEqual([{ type: "scene_run.started", ...base }]);
  });

  it("preserves image data on a retryable video failure", () => {
    const event = parseSceneRunEvent({
      type: "scene_run.failed",
      ...base,
      code: "provider_generation_failed",
      message: "Video generation failed.",
      retryable: true,
      image: {
        kind: "image",
        media_type: "image/png",
        asset_url: "s3://bucket/image.png",
        preview_url: "/api/v1/media/key/preview",
        sha256: "a".repeat(64),
        provider: "GMICloud",
        model: "image-model",
      },
    });

    expect(event.type).toBe("scene_run.failed");
    if (event.type !== "scene_run.failed") throw new Error("Unexpected event");
    expect(event.retryable).toBe(true);
    expect(event.image?.kind).toBe("image");
  });

  it("rejects unknown event types", () => {
    expect(() =>
      parseSceneRunEvent({ type: "provider.internal", ...base }),
    ).toThrow("Unknown scene generation event");
  });
});
