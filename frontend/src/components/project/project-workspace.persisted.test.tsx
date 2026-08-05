/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Render, VideoProject } from "@/types";
import type { PersistedProjectUpdateInput } from "@/lib/api/persisted-projects";
import type {
  CreateFinalRenderInput,
  PersistedRender,
} from "@/lib/api/render-jobs";
import type { PersistedGenerationJob } from "@/lib/api/scene-generation-jobs";
import { projectQueryKeys } from "@/lib/queries/project-query-keys";
import { jobQueryKeys } from "@/lib/queries/job-query-keys";

afterEach(cleanup);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;

const pushMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const refreshCreditsMock = vi.fn().mockResolvedValue(undefined);
const getPersistedProjectMock = vi.fn<(id: string) => Promise<VideoProject | null>>();
const updatePersistedProjectMock =
  vi.fn<(id: string, patch: PersistedProjectUpdateInput) => Promise<VideoProject>>();
const deletePersistedProjectMock = vi.fn<(id: string) => Promise<void>>();
const getPersistedJobMock =
  vi.fn<(jobId: string, signal?: AbortSignal) => Promise<PersistedGenerationJob>>();
const createFinalRenderMock = vi.fn<
  (
    projectId: string,
    input: CreateFinalRenderInput,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ) => Promise<PersistedGenerationJob>
>();
const getPersistedRenderMock = vi.fn<(renderId: string) => Promise<PersistedRender>>();
const getRenderPreviewUrlMock = vi.fn<(renderId: string) => Promise<string>>();
const mapPersistedRenderMock =
  vi.fn<(render: PersistedRender, previewUrl: string) => Render>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));
// Real (persisted) mode never calls the mock API, but the module is still
// statically imported by project-workspace.tsx / use-project-query.ts.
vi.mock("@/lib/mock-api", () => ({
  getProject: vi.fn(),
  renderFinalVideo: vi.fn(),
}));
vi.mock("@/lib/mock-api/render", () => ({
  buildInitialRender: () => null,
}));
vi.mock("@/lib/mock-api/projects", () => ({
  replaceProject: vi.fn(),
}));
vi.mock("@/lib/api/persisted-projects", () => ({
  getPersistedProject: (id: string) => getPersistedProjectMock(id),
  updatePersistedProject: (id: string, patch: PersistedProjectUpdateInput) =>
    updatePersistedProjectMock(id, patch),
  deletePersistedProject: (id: string) => deletePersistedProjectMock(id),
}));
// isPersistedJobActive is kept real (both project-workspace.tsx and
// useJobQuery rely on its actual logic); only the network calls are mocked.
vi.mock("@/lib/api/scene-generation-jobs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/scene-generation-jobs")>();
  return {
    ...actual,
    realSceneGenerationEnabled: true,
    listPersistedJobs: vi.fn().mockResolvedValue([]),
    pollPersistedJob: vi.fn(),
    getPersistedJob: (jobId: string, signal?: AbortSignal) =>
      getPersistedJobMock(jobId, signal),
  };
});
vi.mock("@/lib/api/render-jobs", () => ({
  createFinalRender: (
    projectId: string,
    input: CreateFinalRenderInput,
    signal?: AbortSignal,
    idempotencyKey?: string,
  ) => createFinalRenderMock(projectId, input, signal, idempotencyKey),
  getLatestProjectRender: vi.fn().mockResolvedValue(null),
  getPersistedRender: (renderId: string) => getPersistedRenderMock(renderId),
  getRenderPreviewUrl: (renderId: string) => getRenderPreviewUrlMock(renderId),
  mapPersistedRender: (render: PersistedRender, previewUrl: string) =>
    mapPersistedRenderMock(render, previewUrl),
}));
// Real mode never calls videoProjectApi, but it is still statically imported.
vi.mock("@/lib/api/provider", () => ({
  videoProjectApi: { deleteProject: vi.fn() },
}));
vi.mock("@/components/credits/credits-provider", () => ({
  useCredits: () => ({
    estimate: () => 5,
    canAfford: () => true,
    refresh: refreshCreditsMock,
  }),
}));

vi.mock("./brief-section", () => ({
  BriefSection: ({
    brief,
    output,
    historicalAccuracyNote,
    onSave,
  }: {
    brief: VideoProject["brief"];
    output: VideoProject["output"];
    historicalAccuracyNote: string | null;
    onSave: (next: unknown) => Promise<boolean>;
  }) => (
    <div>
      <p>Brief: {output.title}</p>
      <button
        onClick={() =>
          void onSave({
            brief,
            title: "Updated title",
            language: output.language,
            duration: output.duration,
            visualStyle: output.visualStyle,
            narrationStyle: output.narrationStyle,
            narrationEnabled: output.narrationEnabled ?? true,
            captionsEnabled: output.captionsEnabled,
            musicEnabled: output.musicEnabled,
            toneChanged: false,
            historicalAccuracyNote,
          })
        }
      >
        Save Brief
      </button>
    </div>
  ),
}));
vi.mock("@/components/storyboard/storyboard-section", () => ({
  StoryboardSection: () => <div>Storyboard stub</div>,
}));
vi.mock("@/components/generation/generation-section", () => ({
  GenerationSection: () => <div>Generation stub</div>,
}));
vi.mock("@/components/final-video/final-video-section", () => ({
  FinalVideoSection: ({
    isRendering,
    renderProgress,
    renderStage,
    render,
    onStartRender,
  }: {
    isRendering: boolean;
    renderProgress: number;
    renderStage: string | null;
    render: Render | null;
    onStartRender: () => void;
  }) => (
    <div>
      <p>Final video stub</p>
      <p>isRendering: {String(isRendering)}</p>
      <p>renderProgress: {renderProgress}</p>
      <p>renderStage: {renderStage ?? "null"}</p>
      <p>render: {render ? `v${render.version} ${render.shareUrl}` : "none"}</p>
      <button onClick={onStartRender}>Start Render</button>
    </div>
  ),
}));

const { ProjectWorkspace } = await import("./project-workspace");

function fakeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: "proj_1",
    mode: "historical-documentary",
    status: "draft",
    brief: {
      mode: "historical-documentary",
      topic: "The rise of Majapahit",
      sourceNotes: "",
      language: "en",
      tone: "cinematic",
      targetAudience: "General audience",
      additionalDirection: "",
    },
    output: {
      title: "Majapahit Documentary",
      language: "en",
      duration: 45,
      aspectRatio: "9:16",
      visualStyle: "Cinematic Realism",
      narrationStyle: "Documentary",
      sceneCount: 4,
      narrationEnabled: true,
      captionsEnabled: false,
      musicEnabled: false,
    },
    chapters: [{ id: "ch1", title: "Main", position: 0, scenes: [] }],
    thumbnailUrl: null,
    historicalAccuracyNote: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    generationProgress: 0,
    ...overrides,
  };
}

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

function fakePersistedRender(overrides: Partial<PersistedRender> = {}): PersistedRender {
  return {
    id: "render_1",
    project_id: "proj_1",
    job_id: "job_1",
    version: 1,
    status: "completed",
    asset_id: "asset_1",
    duration_seconds: 45,
    file_size_bytes: 1_000_000,
    narration_enabled: true,
    captions_enabled: false,
    music_enabled: false,
    created_at: "2026-01-01T00:00:00.000Z",
    completed_at: "2026-01-01T00:05:00.000Z",
    ...overrides,
  };
}

function fakeRender(overrides: Partial<Render> = {}): Render {
  return {
    id: "render_1",
    projectId: "proj_1",
    version: 1,
    status: "rendered",
    resolution: "1080 × 1920",
    durationSeconds: 45,
    fileSizeMb: 1,
    captionsBurned: false,
    narrationIncluded: true,
    musicIncluded: false,
    thumbnailUrl: null,
    shareUrl: "https://cdn.example/preview",
    createdAt: "2026-01-01T00:00:00.000Z",
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

function renderWorkspace(projectId = "proj_1", client = createTestQueryClient()) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ProjectWorkspace projectId={projectId} />
      </QueryClientProvider>,
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function startOnFinalTab(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "Majapahit Documentary" });
  await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
  await user.click(await screen.findByRole("button", { name: "Start Render" }));
}

describe("ProjectWorkspace (persisted mode)", () => {
  beforeEach(() => {
    getPersistedProjectMock.mockReset();
    updatePersistedProjectMock.mockReset();
    deletePersistedProjectMock.mockReset();
    getPersistedJobMock.mockReset();
    createFinalRenderMock.mockReset();
    getPersistedRenderMock.mockReset();
    getRenderPreviewUrlMock.mockReset();
    mapPersistedRenderMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    refreshCreditsMock.mockReset().mockResolvedValue(undefined);
  });

  it("writes the updated project to the detail cache and invalidates the list query on a successful update", async () => {
    getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
    const updated = fakeProject({
      output: { ...fakeProject().output, title: "Updated title" },
    });
    updatePersistedProjectMock.mockResolvedValueOnce(updated);
    const user = userEvent.setup();

    const { client } = renderWorkspace();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(screen.getByRole("button", { name: "Save Brief" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Updated title" })).toBeTruthy(),
    );
    expect(updatePersistedProjectMock).toHaveBeenCalledWith(
      "proj_1",
      expect.objectContaining({ title: "Updated title" }),
    );
    expect(client.getQueryData(projectQueryKeys.detail("proj_1"))).toEqual(updated);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectQueryKeys.lists() });
    expect(toastSuccessMock).toHaveBeenCalledWith("Output settings updated");
  });

  it("restores saveState, shows one error toast, and keeps local project data on a failed update", async () => {
    getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
    updatePersistedProjectMock.mockRejectedValueOnce(new Error("Server rejected the update."));
    const user = userEvent.setup();

    renderWorkspace();
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(screen.getByRole("button", { name: "Save Brief" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock).toHaveBeenCalledWith("Server rejected the update.");
    // The workspace stays mounted with the last-known-good title, not blanked out.
    expect(screen.getByRole("heading", { name: "Majapahit Documentary" })).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("removes the detail cache, invalidates the list query, and redirects on successful deletion", async () => {
    getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
    deletePersistedProjectMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    const { client } = renderWorkspace();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(
      screen.getByRole("button", { name: "Delete Majapahit Documentary" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete project" }));

    await waitFor(() => expect(deletePersistedProjectMock).toHaveBeenCalledWith("proj_1"));
    expect(client.getQueryData(projectQueryKeys.detail("proj_1"))).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectQueryKeys.lists() });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Project deleted",
      expect.objectContaining({
        description: expect.stringContaining("Majapahit Documentary"),
      }),
    );
    expect(replaceMock).toHaveBeenCalledWith("/projects");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("keeps the dialog open while pending, shows Deleting…, disables confirm/cancel, blocks Escape, and does not duplicate the request", async () => {
    getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
    const { promise, resolve } = deferred<void>();
    deletePersistedProjectMock.mockReturnValueOnce(promise);
    const user = userEvent.setup();

    renderWorkspace();
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(
      screen.getByRole("button", { name: "Delete Majapahit Documentary" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete project" }));

    // Still visible, confirm label swapped, both actions disabled.
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    const pendingConfirmButton = (await screen.findByRole("button", {
      name: "Deleting…",
    })) as HTMLButtonElement;
    expect(pendingConfirmButton.disabled).toBe(true);
    const cancelButton = screen.getByRole("button", {
      name: "Cancel",
    }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);

    // A disabled button does not dispatch a click; no duplicate request.
    await user.click(pendingConfirmButton);
    // Escape cannot dismiss the dialog while pending.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(deletePersistedProjectMock).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/projects"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps the dialog open on failure, shows the error toast, re-enables confirm/cancel, and allows a retry that succeeds", async () => {
    getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
    deletePersistedProjectMock.mockRejectedValueOnce(new Error("Delete failed."));
    deletePersistedProjectMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    renderWorkspace();
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(
      screen.getByRole("button", { name: "Delete Majapahit Documentary" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete project" }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Project could not be deleted",
      expect.objectContaining({ description: "Delete failed." }),
    );
    expect(replaceMock).not.toHaveBeenCalled();

    // The dialog itself stayed open (not just the header entry point), and
    // confirm/cancel are usable again for a retry from the same dialog.
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    const confirmButton = screen.getByRole("button", {
      name: "Delete project",
    }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(false);
    const cancelButton = screen.getByRole("button", {
      name: "Cancel",
    }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(false);

    await user.click(confirmButton);

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/projects"));
    expect(deletePersistedProjectMock).toHaveBeenCalledTimes(2);
  });

  describe("final render", () => {
    it("starts a render via the mutation, caches the queued job, refreshes credits, and never calls pollPersistedJob", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued", progress: 0 });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);

      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      expect(createFinalRenderMock).toHaveBeenCalledWith(
        "proj_1",
        { narration_enabled: true, captions_enabled: false, music_enabled: false },
        undefined,
        expect.any(String),
      );
      expect(screen.getByText("isRendering: true")).toBeTruthy();
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(queuedJob);
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(1));

      const { pollPersistedJob } = await import("@/lib/api/scene-generation-jobs");
      expect(pollPersistedJob).not.toHaveBeenCalled();
    });

    it("updates progress and stage as the active render job polls from queued to running", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued", progress: 0, current_stage: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);

      await waitFor(() => expect(screen.getByText("renderStage: queued")).toBeTruthy());
      expect(screen.getByText("isRendering: true")).toBeTruthy();

      const runningJob = fakeJob({
        id: "job_1",
        status: "running",
        progress: 42,
        current_stage: "rendering_video",
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), runningJob);

      await waitFor(() => expect(screen.getByText("renderProgress: 42")).toBeTruthy());
      expect(screen.getByText("renderStage: rendering_video")).toBeTruthy();
      expect(screen.getByText("isRendering: true")).toBeTruthy();
    });

    it("on completion: resolves the render id, fetches persisted render + preview, maps it, updates readiness, shows one success toast, refreshes credits again, and clears rendering/active job", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const persistedRender = fakePersistedRender({ id: "render_1", version: 3 });
      getPersistedRenderMock.mockResolvedValueOnce(persistedRender);
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/preview");
      mapPersistedRenderMock.mockReturnValueOnce(
        fakeRender({ version: 3, shareUrl: "https://cdn.example/preview" }),
      );
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(1));

      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        progress: 100,
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);

      await waitFor(() => expect(getPersistedRenderMock).toHaveBeenCalledWith("render_1"));
      expect(getRenderPreviewUrlMock).toHaveBeenCalledWith("render_1");
      await waitFor(() =>
        expect(
          screen.getByText("render: v3 https://cdn.example/preview"),
        ).toBeTruthy(),
      );
      expect(toastSuccessMock).toHaveBeenCalledTimes(1);
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Rendered v3",
        expect.objectContaining({
          description: expect.stringContaining("Majapahit Documentary"),
        }),
      );
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
    });

    it("processes a completed job exactly once even if the cache notifies twice in quick succession", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      getPersistedRenderMock.mockResolvedValueOnce(fakePersistedRender());
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/preview");
      mapPersistedRenderMock.mockReturnValueOnce(fakeRender());
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));

      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      // Two distinct object references, same content, set back to back
      // before the first terminal effect run has a chance to finish.
      client.setQueryData(jobQueryKeys.detail("job_1"), { ...completedJob });
      client.setQueryData(jobQueryKeys.detail("job_1"), { ...completedJob });

      await waitFor(() => expect(getPersistedRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledTimes(1));
    });

    it("on failed: shows the server error, does not fetch render details, stops rendering, refreshes credits, and allows a new attempt", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(1));

      const failedJob = fakeJob({
        id: "job_1",
        status: "failed",
        error_message: "GPU exploded",
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), failedJob);

      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("GPU exploded"));
      expect(getPersistedRenderMock).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(2));

      const secondQueuedJob = fakeJob({ id: "job_2", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(secondQueuedJob);
      getPersistedJobMock.mockResolvedValue(secondQueuedJob);
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(2));
    });

    it("on cancelled: behaves as a terminal failure using the provided error message", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));

      const cancelledJob = fakeJob({
        id: "job_1",
        status: "cancelled",
        error_message: "Cancelled by user",
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), cancelledJob);

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith("Cancelled by user"),
      );
      expect(getPersistedRenderMock).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
    });

    it("when createFinalRender rejects: shows an error toast, never starts polling, clears rendering state, refreshes credits once, and allows retry", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      createFinalRenderMock.mockRejectedValueOnce(
        new Error("Server rejected the render request."),
      );
      const user = userEvent.setup();

      renderWorkspace();
      await startOnFinalTab(user);

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith(
          "Server rejected the render request.",
        ),
      );
      expect(getPersistedJobMock).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
      expect(refreshCreditsMock).toHaveBeenCalledTimes(1);

      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(2));
    });

    it("prevents duplicate render requests while creating or an active job is polling", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const { promise, resolve } = deferred<PersistedGenerationJob>();
      createFinalRenderMock.mockReturnValueOnce(promise);
      const user = userEvent.setup();

      renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      const startButton = screen.getByRole("button", { name: "Start Render" });

      await user.click(startButton);
      await user.click(startButton);
      await user.click(startButton);

      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      getPersistedJobMock.mockResolvedValue(queuedJob);
      resolve(queuedJob);

      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(createFinalRenderMock).toHaveBeenCalledTimes(1);
    });

    it("a recoverable getPersistedJob error does not stop rendering, clear the active job, or show a terminal error toast", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValueOnce(queuedJob);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());

      getPersistedJobMock.mockRejectedValueOnce(new Error("network blip"));
      await client.refetchQueries({ queryKey: jobQueryKeys.detail("job_1") });

      expect(screen.getByText("isRendering: true")).toBeTruthy();
      expect(toastErrorMock).not.toHaveBeenCalled();
      // Last-known-good data survives the background refetch error.
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(queuedJob);
      expect(
        client.getQueryState<PersistedGenerationJob>(jobQueryKeys.detail("job_1"))
          ?.status,
      ).toBe("error");
    });
  });
});
