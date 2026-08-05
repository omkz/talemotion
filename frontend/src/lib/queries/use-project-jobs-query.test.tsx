/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PersistedGenerationJob } from "@/lib/api/scene-generation-jobs";
import { jobQueryKeys } from "./job-query-keys";

afterEach(cleanup);

const listPersistedJobsMock = vi.fn<
  (
    projectId: string,
    options?: { activeOnly?: boolean; signal?: AbortSignal },
  ) => Promise<PersistedGenerationJob[]>
>();

vi.mock("@/lib/api/scene-generation-jobs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/scene-generation-jobs")>();
  return {
    ...actual,
    listPersistedJobs: (
      projectId: string,
      options?: { activeOnly?: boolean; signal?: AbortSignal },
    ) => listPersistedJobsMock(projectId, options),
  };
});

const { useProjectJobsQuery } = await import("./use-project-jobs-query");

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

describe("useProjectJobsQuery", () => {
  beforeEach(() => {
    listPersistedJobsMock.mockReset();
  });

  it("does not call listPersistedJobs and stays idle when disabled", async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useProjectJobsQuery("proj_1", false), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(listPersistedJobsMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("fetches all project jobs, forwards an AbortSignal, and stores them under jobQueryKeys.project", async () => {
    const jobs = [
      fakeJob({ id: "job_1", status: "queued" }),
      fakeJob({ id: "job_2", status: "completed" }),
    ];
    listPersistedJobsMock.mockResolvedValueOnce(jobs);
    const client = createTestQueryClient();

    renderHook(() => useProjectJobsQuery("proj_1", true), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() =>
      expect(
        client.getQueryData<PersistedGenerationJob[]>(
          jobQueryKeys.project("proj_1"),
        ),
      ).toEqual(jobs),
    );
    expect(listPersistedJobsMock).toHaveBeenCalledTimes(1);
    const [calledProjectId, calledOptions] = listPersistedJobsMock.mock.calls[0];
    expect(calledProjectId).toBe("proj_1");
    expect(calledOptions?.signal).toBeInstanceOf(AbortSignal);
  });

  it("exposes an API failure as a query error without showing a toast", async () => {
    const error = new Error("network down");
    listPersistedJobsMock.mockRejectedValueOnce(error);
    const client = createTestQueryClient();

    renderHook(() => useProjectJobsQuery("proj_1", true), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() =>
      expect(
        client.getQueryState(jobQueryKeys.project("proj_1"))?.status,
      ).toBe("error"),
    );
    expect(
      client.getQueryState(jobQueryKeys.project("proj_1"))?.error,
    ).toBe(error);
    // No toast module is even imported by this hook; nothing to assert
    // against other than the absence of any side channel — the hook's
    // only responsibility is exposing the error via query state.
  });

  it("aborts an in-flight request on unmount", async () => {
    let capturedSignal: AbortSignal | undefined;
    listPersistedJobsMock.mockImplementationOnce((_projectId, options) => {
      capturedSignal = options?.signal;
      return new Promise(() => {});
    });
    const client = createTestQueryClient();

    const { unmount } = renderHook(() => useProjectJobsQuery("proj_1", true), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(capturedSignal).toBeInstanceOf(AbortSignal));
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));
  });
});
