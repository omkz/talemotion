import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProjectGeneration,
  createSceneRegeneration,
  createStoryboardGeneration,
  listPersistedJobs,
  pollPersistedJob,
  resultAssetId,
} from "./scene-generation-jobs";
import type { PersistedGenerationJob } from "./scene-generation-jobs";

const completedJob: PersistedGenerationJob = {
  id: "job_123",
  project_id: "project_123",
  scene_id: "scene_123",
  parent_job_id: null,
  type: "scene_generation",
  status: "completed",
  progress: 100,
  current_stage: "completed",
  input_payload: {},
  result_payload: {
    image_asset_id: "asset_image",
    video_asset_id: "asset_video",
    asset_id: "asset_video",
  },
  error_code: null,
  error_message: null,
  children: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persisted scene-generation jobs", () => {
  it("prefers the completed video asset", () => {
    expect(resultAssetId(completedJob)).toBe("asset_video");
  });

  it("polls the job endpoint and stops on a terminal status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completedJob), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const updates: PersistedGenerationJob[] = [];

    const result = await pollPersistedJob("job_123", {
      onUpdate: (job) => {
        updates.push(job);
      },
    });

    expect(result.status).toBe("completed");
    expect(updates).toEqual([completedJob]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("starts storyboard generation with explicit replacement intent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completedJob), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createStoryboardGeneration(
      "project_123",
      true,
      undefined,
      "storyboard-key",
    );

    const [, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toEqual({
      replace_existing: true,
    });
    expect(new Headers(request.headers).get("Idempotency-Key")).toBe(
      "storyboard-key",
    );
  });

  it("submits regeneration instructions and restores project jobs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(completedJob), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [completedJob] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await createSceneRegeneration(
      "scene_123",
      "Use a wider harbor view.",
      undefined,
      "regenerate-key",
    );
    const jobs = await listPersistedJobs("project_123", { activeOnly: true });

    const [, regenerationRequest] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(JSON.parse(String(regenerationRequest.body))).toMatchObject({
      additional_instruction: "Use a wider harbor view.",
    });
    expect(new Headers(regenerationRequest.headers).get("Idempotency-Key")).toBe(
      "regenerate-key",
    );
    expect(jobs).toEqual([completedJob]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("active_only=true");
  });

  it("preserves parent child summaries while polling Generate All", async () => {
    const parent: PersistedGenerationJob = {
      ...completedJob,
      id: "job_parent",
      scene_id: null,
      type: "project_generation",
      result_payload: null,
      children: [
        {
          id: "job_child",
          scene_id: "scene_123",
          status: "completed",
          progress: 100,
          result_asset_id: "asset_video",
          error_code: null,
          error_message: null,
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(parent), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(parent), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const queued = await createProjectGeneration("project_123");
    const updates: PersistedGenerationJob[] = [];
    const result = await pollPersistedJob(queued.id, {
      onUpdate: (job) => {
        updates.push(job);
      },
    });

    expect(result.children[0]?.result_asset_id).toBe("asset_video");
    expect(updates).toHaveLength(1);
  });
});
