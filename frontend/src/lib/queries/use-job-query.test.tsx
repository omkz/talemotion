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

  it("exposes a request error without spinning into a fast, uncontrolled polling loop", async () => {
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

    // The next attempt still waits for the full 1500ms interval — no tight
    // retry loop — and recovering to a terminal status stops polling again.
    getPersistedJobMock.mockResolvedValueOnce(fakeJob({ status: "completed" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
    expect(jobState(client, "job_1")?.data?.status).toBe("completed");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getPersistedJobMock).toHaveBeenCalledTimes(2);
  });
});
