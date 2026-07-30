import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pollPersistedJob,
  resultAssetId,
} from "./scene-generation-jobs";
import type { PersistedGenerationJob } from "./scene-generation-jobs";

const completedJob: PersistedGenerationJob = {
  id: "job_123",
  scene_id: "scene_123",
  status: "completed",
  progress: 100,
  current_stage: "completed",
  result_payload: {
    image_asset_id: "asset_image",
    video_asset_id: "asset_video",
    asset_id: "asset_video",
  },
  error_code: null,
  error_message: null,
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
});
