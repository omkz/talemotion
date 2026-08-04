/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PersistedGenerationJob } from "@/lib/api/scene-generation-jobs";
import { jobQueryKeys } from "./job-query-keys";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const getPersistedJobMock =
  vi.fn<(jobId: string, signal?: AbortSignal) => Promise<PersistedGenerationJob>>();

vi.mock("@/lib/api/scene-generation-jobs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/scene-generation-jobs")>();
  return {
    ...actual,
    getPersistedJob: (jobId: string, signal?: AbortSignal) =>
      getPersistedJobMock(jobId, signal),
  };
});

const { useJobQuery } = await import("./use-job-query");

function fakeJob(overrides: Partial<PersistedGenerationJob> = {}): PersistedGenerationJob {
  return {
    id: "job_1",
    project_id: "proj_1",
    scene_id: null,
    parent_job_id: null,
    type: "render",
    status: "queued",
    progress: 0,
    current_stage: null,
    input_payload: {},
    result_payload: null,
    error_code: null,
    error_message: null,
    children: [],
    ...overrides,
  };
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// Assertions about status transitions and fetch counts are made against the
// QueryClient cache (a synchronous, public API) rather than the renderHook
// result. Under fake timers, React's own notification scheduling for
// interval-triggered updates does not reliably flush within act() in this
// environment/version combination, even though the underlying fetch, cache
// write, and observer notification all happen correctly — asserting on the
// cache sidesteps that render-timing flakiness and tests exactly what this
// hook is responsible for: fetching and caching, not rendering.
function jobState(client: QueryClient, jobId: string) {
  return client.getQueryState<PersistedGenerationJob>(
    jobQueryKeys.detail(jobId),
  );
}

describe("useJobQuery", () => {
  beforeEach(() => {
    getPersistedJobMock.mockReset();
  });

  it("does not call getPersistedJob and stays disabled when jobId is null", async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useJobQuery(null), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getPersistedJobMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("fetches the job by id and forwards an AbortSignal", async () => {
    const job = fakeJob({ status: "queued" });
    getPersistedJobMock.mockResolvedValueOnce(job);
    const client = createTestQueryClient();

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(jobState(client, "job_1")?.data).toEqual(job));
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);
    const [calledId, calledSignal] = getPersistedJobMock.mock.calls[0];
    expect(calledId).toBe("job_1");
    expect(calledSignal).toBeInstanceOf(AbortSignal);
  });

  it("polls active statuses every 1500ms and stops once the job completes", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    getPersistedJobMock
      .mockResolvedValueOnce(fakeJob({ status: "queued" }))
      .mockResolvedValueOnce(fakeJob({ status: "running" }))
      .mockResolvedValueOnce(fakeJob({ status: "completed" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("queued");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("running");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("completed");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);

    // No further requests once terminal, no matter how much time passes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);
  });

  it("continues polling while cancel_requested, then stops once cancelled", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    getPersistedJobMock
      .mockResolvedValueOnce(fakeJob({ status: "cancel_requested" }))
      .mockResolvedValueOnce(fakeJob({ status: "cancelled" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("cancel_requested");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("cancelled");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling once the job fails", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    getPersistedJobMock
      .mockResolvedValueOnce(fakeJob({ status: "running" }))
      .mockResolvedValueOnce(fakeJob({ status: "failed", error_message: "boom" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("running");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("failed");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
  });

  it("stops future polling after unmount", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    getPersistedJobMock.mockResolvedValueOnce(fakeJob({ status: "running" }));

    const { unmount } = renderHook(() => useJobQuery("job_1"), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("running");
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);
  });

  it("exposes a request error and does not issue any extra call before backing off", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const error = new Error("network down");
    getPersistedJobMock.mockRejectedValueOnce(error);

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(jobState(client, "job_1")?.status).toBe("error");
    expect(jobState(client, "job_1")?.error).toBe(error);
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    // retry: false means no internal retry sneaks in an extra call before
    // the explicit backoff interval elapses.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);
  });

  it("waits 5000ms after the initial request fails before retrying", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const error = new Error("network down");
    getPersistedJobMock
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(fakeJob({ status: "running" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
    expect(jobState(client, "job_1")?.data?.status).toBe("running");
  });

  it("escalates the backoff across consecutive failures: 5000ms, then 15000ms, then 30000ms and beyond", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const error = new Error("network down");
    getPersistedJobMock
      .mockRejectedValueOnce(error) // failure 1
      .mockRejectedValueOnce(error) // failure 2
      .mockRejectedValueOnce(error) // failure 3
      .mockRejectedValueOnce(error); // failure 4 — still the 30s tier

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);

    // 1st consecutive failure -> waits 5000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);

    // 2nd consecutive failure -> waits 15000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);

    // 3rd consecutive failure -> waits 30000ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(4);

    // 4th (3+) consecutive failure -> still waits 30000ms, not longer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(4);
  });

  it("resets to 1500ms polling once a request succeeds after failures", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const error = new Error("network down");
    getPersistedJobMock
      .mockRejectedValueOnce(error) // failure 1 -> next wait 5000ms
      .mockRejectedValueOnce(error) // failure 2 -> next wait 15000ms
      .mockResolvedValueOnce(fakeJob({ status: "running" }))
      .mockResolvedValueOnce(fakeJob({ status: "running" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);
    expect(jobState(client, "job_1")?.data?.status).toBe("running");

    // Back to the normal 1500ms cadence, not another backoff tier.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_499);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(4);
  });

  it("keeps the cached job available after a refetch failure and backs off before retrying", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const error = new Error("network down");
    getPersistedJobMock
      .mockResolvedValueOnce(fakeJob({ status: "running" }))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(fakeJob({ status: "running" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(jobState(client, "job_1")?.data?.status).toBe("running");

    // This poll fails; the previously cached job must remain available.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
    expect(jobState(client, "job_1")?.status).toBe("error");
    expect(jobState(client, "job_1")?.data?.status).toBe("running");

    // The next attempt waits the error backoff (5000ms), not 1500ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_499);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_501);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(3);
    expect(jobState(client, "job_1")?.data?.status).toBe("running");
    expect(jobState(client, "job_1")?.status).toBe("success");
  });

  it("stops polling once a terminal status is reached, even after prior failures", async () => {
    vi.useFakeTimers();
    const client = createTestQueryClient();
    const error = new Error("network down");
    getPersistedJobMock
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(fakeJob({ status: "completed" }));

    renderHook(() => useJobQuery("job_1"), { wrapper: wrapperFor(client) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
    expect(jobState(client, "job_1")?.data?.status).toBe("completed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
  });
});
