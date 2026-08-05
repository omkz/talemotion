/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PersistedGenerationJob } from "@/lib/api/scene-generation-jobs";
import type { CreateFinalRenderInput } from "@/lib/api/render-jobs";
import { jobQueryKeys } from "./job-query-keys";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const createFinalRenderMock = vi.fn<
  (
    projectId: string,
    input: CreateFinalRenderInput,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ) => Promise<PersistedGenerationJob>
>();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("@/lib/api/render-jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/render-jobs")>();
  return {
    ...actual,
    createFinalRender: (
      projectId: string,
      input: CreateFinalRenderInput,
      signal?: AbortSignal,
      idempotencyKey?: string,
    ) => createFinalRenderMock(projectId, input, signal, idempotencyKey),
  };
});
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

const { useCreateFinalRenderMutation } = await import(
  "./use-create-final-render-mutation"
);

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
      mutations: { retry: false },
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

function stubRandomUUID() {
  let counter = 0;
  const randomUUID = vi.fn(
    () => `idempotency-key-${++counter}` as ReturnType<Crypto["randomUUID"]>,
  );
  vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID });
  return randomUUID;
}

describe("useCreateFinalRenderMutation", () => {
  beforeEach(() => {
    createFinalRenderMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("calls createFinalRender with the project id, exact options, an undefined signal, and a generated idempotency key", async () => {
    stubRandomUUID();
    const client = createTestQueryClient();
    createFinalRenderMock.mockResolvedValueOnce(fakeJob());
    const { result } = renderHook(
      () => useCreateFinalRenderMutation("proj_1"),
      { wrapper: wrapperFor(client) },
    );

    const input: CreateFinalRenderInput = {
      narration_enabled: true,
      captions_enabled: false,
      music_enabled: true,
    };
    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(createFinalRenderMock).toHaveBeenCalledTimes(1);
    const [calledProjectId, calledInput, calledSignal, calledIdempotencyKey] =
      createFinalRenderMock.mock.calls[0];
    expect(calledProjectId).toBe("proj_1");
    expect(calledInput).toEqual(input);
    expect(calledSignal).toBeUndefined();
    expect(calledIdempotencyKey).toBe("idempotency-key-1");
  });

  it("generates a new idempotency key for each mutation execution", async () => {
    stubRandomUUID();
    const client = createTestQueryClient();
    createFinalRenderMock
      .mockResolvedValueOnce(fakeJob({ id: "job_1" }))
      .mockResolvedValueOnce(fakeJob({ id: "job_2" }));
    const { result } = renderHook(
      () => useCreateFinalRenderMutation("proj_1"),
      { wrapper: wrapperFor(client) },
    );
    const input: CreateFinalRenderInput = {
      narration_enabled: true,
      captions_enabled: false,
      music_enabled: false,
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(createFinalRenderMock.mock.calls[0][3]).toBe("idempotency-key-1");
    expect(createFinalRenderMock.mock.calls[1][3]).toBe("idempotency-key-2");
  });

  it("writes the returned job to the job-detail cache", async () => {
    stubRandomUUID();
    const client = createTestQueryClient();
    const job = fakeJob({ id: "job_42", status: "queued" });
    createFinalRenderMock.mockResolvedValueOnce(job);
    const { result } = renderHook(
      () => useCreateFinalRenderMutation("proj_1"),
      { wrapper: wrapperFor(client) },
    );

    await act(async () => {
      await result.current.mutateAsync({
        narration_enabled: true,
        captions_enabled: true,
        music_enabled: true,
      });
    });

    expect(
      client.getQueryData<PersistedGenerationJob>(
        jobQueryKeys.detail("job_42"),
      ),
    ).toEqual(job);
  });

  it("exposes API errors without showing toasts or touching unrelated caches", async () => {
    stubRandomUUID();
    const client = createTestQueryClient();
    const error = new Error("Server rejected the render request.");
    createFinalRenderMock.mockRejectedValueOnce(error);
    const unrelatedJob = fakeJob({ id: "unrelated_job" });
    client.setQueryData(jobQueryKeys.detail("unrelated_job"), unrelatedJob);

    const { result } = renderHook(
      () => useCreateFinalRenderMutation("proj_1"),
      { wrapper: wrapperFor(client) },
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          narration_enabled: true,
          captions_enabled: false,
          music_enabled: false,
        }),
      ).rejects.toThrow("Server rejected the render request.");
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(error);
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(
      client.getQueryData<PersistedGenerationJob>(
        jobQueryKeys.detail("unrelated_job"),
      ),
    ).toEqual(unrelatedJob);
  });
});
