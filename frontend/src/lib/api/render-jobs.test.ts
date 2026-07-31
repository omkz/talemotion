import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFinalRender,
  getPersistedRender,
  mapPersistedRender,
} from "./render-jobs";
import { pollPersistedJob } from "./scene-generation-jobs";
import type { PersistedGenerationJob } from "./scene-generation-jobs";

const completedJob: PersistedGenerationJob = {
  id: "job_render",
  project_id: "project_123",
  scene_id: null,
  parent_job_id: null,
  type: "render",
  status: "completed",
  progress: 100,
  current_stage: "completed",
  input_payload: { render_id: "render_123" },
  result_payload: { render_id: "render_123", asset_id: "asset_final" },
  error_code: null,
  error_message: null,
  children: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("final render jobs", () => {
  it("submits output options and polls the persisted render job", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedJob), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedJob), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const queued = await createFinalRender(
      "project_123",
      {
        narration_enabled: true,
        captions_enabled: false,
        music_enabled: false,
      },
      undefined,
      "render-key",
    );
    const completed = await pollPersistedJob(queued.id, {
      onUpdate: () => undefined,
    });

    expect(completed.status).toBe("completed");
    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      narration_enabled: true,
      captions_enabled: false,
      music_enabled: false,
    });
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe(
      "render-key",
    );
  });

  it("maps a completed persisted render to the video player model", async () => {
    const persisted = {
      id: "render_123",
      project_id: "project_123",
      job_id: "job_render",
      version: 2,
      status: "completed" as const,
      asset_id: "asset_final",
      duration_seconds: 45,
      file_size_bytes: 10_485_760,
      narration_enabled: true,
      captions_enabled: true,
      music_enabled: false,
      created_at: "2026-07-31T00:00:00Z",
      completed_at: "2026-07-31T00:01:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(persisted), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await getPersistedRender("render_123");
    const render = mapPersistedRender(
      response,
      "https://signed.example.invalid/final.mp4",
    );

    expect(render.status).toBe("rendered");
    expect(render.fileSizeMb).toBe(10);
    expect(render.shareUrl).toContain("final.mp4");
  });
});
