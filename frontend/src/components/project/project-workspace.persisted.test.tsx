/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Render, Scene, VideoProject } from "@/types";
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
const getLatestProjectRenderMock = vi.fn<(projectId: string) => Promise<Render | null>>();
const listPersistedJobsMock = vi.fn<
  (
    projectId: string,
    options?: { activeOnly?: boolean; signal?: AbortSignal },
  ) => Promise<PersistedGenerationJob[]>
>();
const pollPersistedJobMock = vi.fn();

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
    listPersistedJobs: (
      projectId: string,
      options?: { activeOnly?: boolean; signal?: AbortSignal },
    ) => listPersistedJobsMock(projectId, options),
    pollPersistedJob: (...args: unknown[]) => pollPersistedJobMock(...args),
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
  getLatestProjectRender: (projectId: string) =>
    getLatestProjectRenderMock(projectId),
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
    renderStartDisabled,
  }: {
    isRendering: boolean;
    renderProgress: number;
    renderStage: string | null;
    render: Render | null;
    onStartRender: () => void;
    renderStartDisabled?: boolean;
  }) => (
    <div>
      <p>Final video stub</p>
      <p>isRendering: {String(isRendering)}</p>
      <p>renderProgress: {renderProgress}</p>
      <p>renderStage: {renderStage ?? "null"}</p>
      <p>render: {render ? `v${render.version} ${render.shareUrl}` : "none"}</p>
      <p>renderStartDisabled: {String(Boolean(renderStartDisabled))}</p>
      <button onClick={onStartRender} disabled={renderStartDisabled || isRendering}>
        Start Render
      </button>
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

function fakeCompletedScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene_1",
    position: 0,
    title: "Scene 1",
    narration: "",
    visualPrompt: "",
    durationSeconds: 5,
    status: "completed",
    activeVersion: 1,
    versions: [],
    currentJob: null,
    approved: true,
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
    pollPersistedJobMock.mockReset();
    // Defaults so existing (non-restoration) tests see no restoration at
    // all, matching the previous static empty-list/no-render mocks.
    getLatestProjectRenderMock.mockReset().mockResolvedValue(null);
    listPersistedJobsMock.mockReset().mockResolvedValue([]);
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

      expect(pollPersistedJobMock).not.toHaveBeenCalled();
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

  describe("render restoration on load", () => {
    async function goToFinalTab(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole("heading", { name: "Majapahit Documentary" });
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
    }

    it("restores the latest completed preview when there is no active render job", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const latestRender = fakeRender({
        version: 2,
        shareUrl: "https://cdn.example/latest",
      });
      getLatestProjectRenderMock.mockResolvedValueOnce(latestRender);
      listPersistedJobsMock.mockResolvedValueOnce([]);
      const user = userEvent.setup();

      renderWorkspace();
      await goToFinalTab(user);

      await waitFor(() =>
        expect(
          screen.getByText("render: v2 https://cdn.example/latest"),
        ).toBeTruthy(),
      );
      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(getPersistedJobMock).not.toHaveBeenCalled();
    });

    it("restores an active render job: seeds the job-detail cache, opens Final tab, sets rendering state, and never calls pollPersistedJob", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const activeJob = fakeJob({
        id: "job_1",
        status: "running",
        progress: 55,
        current_stage: "rendering_video",
      });
      listPersistedJobsMock.mockResolvedValueOnce([activeJob]);
      getPersistedJobMock.mockResolvedValue(activeJob);

      const { client } = renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });

      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(screen.getByText("renderProgress: 55")).toBeTruthy();
      expect(screen.getByText("renderStage: rendering_video")).toBeTruthy();
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(activeJob);
      expect(pollPersistedJobMock).not.toHaveBeenCalled();
    });

    it("on restored job completion: applies the render and readiness but shows no success toast and does not refresh credits", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const activeJob = fakeJob({ id: "job_1", status: "running", progress: 80 });
      listPersistedJobsMock.mockResolvedValueOnce([activeJob]);
      getPersistedJobMock.mockResolvedValue(activeJob);
      getPersistedRenderMock.mockResolvedValueOnce(
        fakePersistedRender({ id: "render_1", version: 5 }),
      );
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/preview-5");
      mapPersistedRenderMock.mockReturnValueOnce(
        fakeRender({ version: 5, shareUrl: "https://cdn.example/preview-5" }),
      );

      const { client } = renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());

      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);

      await waitFor(() => expect(getPersistedRenderMock).toHaveBeenCalledWith("render_1"));
      await waitFor(() =>
        expect(
          screen.getByText("render: v5 https://cdn.example/preview-5"),
        ).toBeTruthy(),
      );
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(refreshCreditsMock).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
    });

    it("on restored job failure or cancellation: shows the server error but does not fetch render details or refresh credits", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const activeJob = fakeJob({ id: "job_1", status: "running" });
      listPersistedJobsMock.mockResolvedValueOnce([activeJob]);
      getPersistedJobMock.mockResolvedValue(activeJob);

      const { client } = renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());

      const failedJob = fakeJob({
        id: "job_1",
        status: "failed",
        error_message: "Restored render blew up",
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), failedJob);

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith("Restored render blew up"),
      );
      expect(getPersistedRenderMock).not.toHaveBeenCalled();
      expect(refreshCreditsMock).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
    });

    it("opens Final tab and shows the failure toast once when there is no active render but a previously failed one exists", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const failedJob = fakeJob({
        id: "job_old",
        status: "failed",
        progress: 30,
        current_stage: "rendering_video",
        error_message: "Ran out of GPU memory",
      });
      listPersistedJobsMock.mockResolvedValueOnce([failedJob]);

      renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith("Ran out of GPU memory"),
      );
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());
      expect(screen.getByText("renderProgress: 30")).toBeTruthy();
      expect(screen.getByText("renderStage: rendering_video")).toBeTruthy();
      expect(getPersistedJobMock).not.toHaveBeenCalled();
    });

    it("shows one restoration-error toast when the initial project-jobs request fails, and still restores once it later succeeds", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      listPersistedJobsMock.mockRejectedValueOnce(new Error("jobs endpoint down"));

      const { client } = renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith("jobs endpoint down"),
      );
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      // Editor stays mounted; no terminal render-error toast was shown.
      expect(screen.getByRole("heading", { name: "Majapahit Documentary" })).toBeTruthy();

      const activeJob = fakeJob({ id: "job_1", status: "running" });
      listPersistedJobsMock.mockResolvedValueOnce([activeJob]);
      getPersistedJobMock.mockResolvedValue(activeJob);
      await client.refetchQueries({ queryKey: jobQueryKeys.project("proj_1") });

      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(activeJob);
    });

    it("does not let a slower latest-preview response overwrite an already-restored active job or its completed render", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const { promise: latestPromise, resolve: resolveLatest } =
        deferred<Render | null>();
      getLatestProjectRenderMock.mockReturnValueOnce(latestPromise);
      const activeJob = fakeJob({ id: "job_1", status: "running" });
      listPersistedJobsMock.mockResolvedValueOnce([activeJob]);
      getPersistedJobMock.mockResolvedValue(activeJob);
      getPersistedRenderMock.mockResolvedValueOnce(
        fakePersistedRender({ id: "render_1", version: 9 }),
      );
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/new");
      mapPersistedRenderMock.mockReturnValueOnce(
        fakeRender({ version: 9, shareUrl: "https://cdn.example/new" }),
      );
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await goToFinalTab(user);

      // Project jobs already resolved (queued as *Once above), but
      // restoration must not apply them yet — latest preview is pending.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toBeUndefined();

      resolveLatest(
        fakeRender({ version: 1, shareUrl: "https://cdn.example/old" }),
      );

      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(activeJob);

      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);

      await waitFor(() =>
        expect(
          screen.getByText("render: v9 https://cdn.example/new"),
        ).toBeTruthy(),
      );
    });

    it("does not unlock rendering from a stale cached project-jobs list while the fresh mount refetch is still pending", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const { promise: jobsPromise, resolve: resolveJobs } =
        deferred<PersistedGenerationJob[]>();
      listPersistedJobsMock.mockReturnValueOnce(jobsPromise);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      // Simulate a previous visit that cached an empty jobs list; a fresh
      // mount must still refetch (refetchOnMount: "always") rather than
      // trusting this stale snapshot.
      client.setQueryData(jobQueryKeys.project("proj_1"), []);

      renderWorkspace("proj_1", client);
      await goToFinalTab(user);

      expect(screen.getByText("renderStartDisabled: true")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      expect(createFinalRenderMock).not.toHaveBeenCalled();

      const activeJob = fakeJob({ id: "job_1", status: "running", progress: 40 });
      getPersistedJobMock.mockResolvedValue(activeJob);
      resolveJobs([activeJob]);

      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(screen.getByText("renderProgress: 40")).toBeTruthy();
      expect(createFinalRenderMock).not.toHaveBeenCalled();
    });

    it("unlocks rendering once the fresh project-jobs refetch resolves empty, even though a stale cached list was present at mount", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(
        fakeProject({
          chapters: [
            { id: "ch1", title: "Main", position: 0, scenes: [fakeCompletedScene()] },
          ],
        }),
      );
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const { promise: jobsPromise, resolve: resolveJobs } =
        deferred<PersistedGenerationJob[]>();
      listPersistedJobsMock.mockReturnValueOnce(jobsPromise);
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      client.setQueryData(jobQueryKeys.project("proj_1"), []);

      renderWorkspace("proj_1", client);
      await goToFinalTab(user);

      expect(screen.getByText("renderStartDisabled: true")).toBeTruthy();

      resolveJobs([]);

      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
    });

    it("a later project-jobs background refetch does not reinitialize render state or re-show the failed-render toast", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const failedJob = fakeJob({
        id: "job_old",
        status: "failed",
        error_message: "boom",
      });
      listPersistedJobsMock.mockResolvedValueOnce([failedJob]);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await goToFinalTab(user);
      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));

      const newActiveJob = fakeJob({ id: "job_new", status: "running" });
      listPersistedJobsMock.mockResolvedValueOnce([newActiveJob]);
      await client.refetchQueries({ queryKey: jobQueryKeys.project("proj_1") });

      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_new")),
      ).toBeUndefined();
    });
  });

  describe("render creation locked until restoration completes", () => {
    async function goToFinalTab(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole("heading", { name: "Majapahit Documentary" });
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
    }

    function primaryRenderButton() {
      return screen.getByRole("button", {
        name: /Render (Final Video|New Version)/,
      }) as HTMLButtonElement;
    }

    it("keeps both render entry points disabled while the latest-preview request is still pending", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const { promise: latestPromise } = deferred<Render | null>();
      getLatestProjectRenderMock.mockReturnValueOnce(latestPromise);
      listPersistedJobsMock.mockResolvedValueOnce([
        fakeJob({ id: "job_1", status: "running" }),
      ]);
      const user = userEvent.setup();

      renderWorkspace();
      await goToFinalTab(user);

      expect(screen.getByText("renderStartDisabled: true")).toBeTruthy();
      expect(primaryRenderButton().disabled).toBe(true);

      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await user.click(primaryRenderButton());
      expect(createFinalRenderMock).not.toHaveBeenCalled();
    });

    it("keeps render creation disabled while the project jobs request is still pending, even after the preview settles", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const { promise: jobsPromise } = deferred<PersistedGenerationJob[]>();
      listPersistedJobsMock.mockReturnValueOnce(jobsPromise);
      const user = userEvent.setup();

      renderWorkspace();
      await goToFinalTab(user);

      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: true")).toBeTruthy(),
      );
      expect(primaryRenderButton().disabled).toBe(true);
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      expect(createFinalRenderMock).not.toHaveBeenCalled();
    });

    it("keeps render creation locked after a jobs-query failure, with the error toast shown once", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      listPersistedJobsMock.mockRejectedValueOnce(new Error("jobs endpoint down"));
      const user = userEvent.setup();

      renderWorkspace();
      await goToFinalTab(user);

      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith("jobs endpoint down"),
      );
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText("renderStartDisabled: true")).toBeTruthy();
      expect(primaryRenderButton().disabled).toBe(true);

      await user.click(screen.getByRole("button", { name: "Start Render" }));
      expect(createFinalRenderMock).not.toHaveBeenCalled();
    });

    it("unlocks render creation once preview and jobs restoration both complete successfully with no active job", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(
        fakeProject({
          chapters: [
            { id: "ch1", title: "Main", position: 0, scenes: [fakeCompletedScene()] },
          ],
        }),
      );
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      listPersistedJobsMock.mockResolvedValueOnce([]);
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      renderWorkspace();
      await goToFinalTab(user);

      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );
      expect(primaryRenderButton().disabled).toBe(false);

      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
    });

    it("keeps render start disabled while an existing active render is restored, and never starts a duplicate mutation", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      const activeJob = fakeJob({ id: "job_1", status: "running" });
      listPersistedJobsMock.mockResolvedValueOnce([activeJob]);
      getPersistedJobMock.mockResolvedValue(activeJob);

      renderWorkspace();
      await screen.findByRole("heading", { name: "Majapahit Documentary" });

      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      // Restoration itself completed (jobs were inspected), but the button
      // stays disabled because a render is already actively in progress.
      const startButton = screen.getByRole("button", {
        name: "Start Render",
      }) as HTMLButtonElement;
      expect(startButton.disabled).toBe(true);
      expect(createFinalRenderMock).not.toHaveBeenCalled();
    });

    it("does not let a deferred old preview overwrite a completed user-triggered render", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      const { promise: latestPromise, resolve: resolveLatest } =
        deferred<Render | null>();
      getLatestProjectRenderMock.mockReturnValueOnce(latestPromise);
      listPersistedJobsMock.mockResolvedValueOnce([]);
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      getPersistedRenderMock.mockResolvedValueOnce(
        fakePersistedRender({ id: "render_1", version: 7 }),
      );
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/v7");
      mapPersistedRenderMock.mockReturnValueOnce(
        fakeRender({ version: 7, shareUrl: "https://cdn.example/v7" }),
      );
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await goToFinalTab(user);

      // Locked while the old preview request is still pending.
      expect(screen.getByText("renderStartDisabled: true")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      expect(createFinalRenderMock).not.toHaveBeenCalled();

      // Old preview settles (with nothing); jobs were already empty -> unlocked.
      resolveLatest(null);
      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );

      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));

      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);

      await waitFor(() =>
        expect(
          screen.getByText("render: v7 https://cdn.example/v7"),
        ).toBeTruthy(),
      );
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Rendered v7",
        expect.anything(),
      );
    });

    it("isolates restoration readiness across a project change: a new project stays locked until its own restoration completes", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1"
          ? fakeProject({ id: "proj_1" })
          : fakeProject({
              id: "proj_2",
              output: { ...fakeProject().output, title: "Second Project" },
            }),
      );
      const latest1 = deferred<Render | null>();
      getLatestProjectRenderMock.mockReturnValueOnce(latest1.promise);
      const jobs1 = deferred<PersistedGenerationJob[]>();
      listPersistedJobsMock.mockReturnValueOnce(jobs1.promise);

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Majapahit Documentary" });

      // Switch to project_2 while project_1's restoration is still pending.
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      listPersistedJobsMock.mockResolvedValueOnce([]);
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });

      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );

      // Resolve project_1's stale requests now — they must not affect project_2.
      latest1.resolve(fakeRender({ id: "stale_render", version: 99 }));
      jobs1.resolve([fakeJob({ id: "stale_job", status: "running" })]);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.getByText("renderStartDisabled: false")).toBeTruthy();
      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(screen.getByText("render: none")).toBeTruthy();
      expect(
        client.getQueryData<PersistedGenerationJob>(
          jobQueryKeys.detail("stale_job"),
        ),
      ).toBeUndefined();
    });
  });

  describe("active render job is scoped to a project", () => {
    function fakeProjectTwo(): VideoProject {
      return fakeProject({
        id: "proj_2",
        output: { ...fakeProject().output, title: "Second Project" },
      });
    }

    it("does not leak an active user-triggered render job into a new project after a projectId change", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const queuedJob = fakeJob({ id: "job_1", status: "queued", progress: 10 });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      // job_1 stays "queued" (active) indefinitely for every subsequent poll.
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(queuedJob);

      // Switch to a different project while job_1 is still actively polling.
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_2 restoration: nothing active
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });

      // project_1's now-irrelevant user job must not block project_2's own
      // restoration from unlocking render creation, nor leave stale render
      // state visible once the Final Video tab is revisited.
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));

      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(screen.getByText("renderProgress: 0")).toBeTruthy();
      expect(screen.getByText("renderStage: null")).toBeTruthy();
      expect(screen.getByText("render: none")).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );

      // job_1 completing after the switch must not resurrect project_2's state.
      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(screen.getByText("render: none")).toBeTruthy();
      expect(toastSuccessMock).not.toHaveBeenCalled();
      expect(getPersistedRenderMock).not.toHaveBeenCalled();
    });

    it("does not leak an active restored render job into a new project after a projectId change", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      const restoredJob = fakeJob({
        id: "job_restored",
        status: "running",
        progress: 60,
      });
      listPersistedJobsMock.mockResolvedValueOnce([restoredJob]); // proj_1 restores this as active
      getPersistedJobMock.mockResolvedValue(restoredJob);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Majapahit Documentary" });
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      expect(screen.getByText("renderProgress: 60")).toBeTruthy();

      // Switch to a different project while the restored job is still active.
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_2: nothing to restore
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });

      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));

      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(screen.getByText("renderProgress: 0")).toBeTruthy();
      expect(screen.getByText("renderStage: null")).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );

      const completedJob = fakeJob({
        id: "job_restored",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_restored"), completedJob);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(screen.getByText("render: none")).toBeTruthy();
      expect(getPersistedRenderMock).not.toHaveBeenCalled();
    });

    it("ignores a stale terminal render-detail fetch that resolves after switching to a different project", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const { promise: persistedPromise, resolve: resolvePersisted } =
        deferred<PersistedRender>();
      getPersistedRenderMock.mockReturnValueOnce(persistedPromise);
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/stale");
      mapPersistedRenderMock.mockReturnValueOnce(
        fakeRender({ version: 7, shareUrl: "https://cdn.example/stale" }),
      );
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(1));

      // job_1 completes while still on proj_1, kicking off the async
      // render-detail fetch below — left pending for now.
      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);
      await waitFor(() =>
        expect(getPersistedRenderMock).toHaveBeenCalledWith("render_1"),
      );

      // Switch to project_2 before that fetch resolves.
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_2 restoration: nothing active
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });

      // Now let the stale fetch resolve — it must be discarded, not applied
      // to project_2.
      resolvePersisted(fakePersistedRender({ id: "render_1", version: 7 }));
      await new Promise((resolve) => setTimeout(resolve, 20));

      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      expect(screen.getByText("render: none")).toBeTruthy();
      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(toastSuccessMock).not.toHaveBeenCalled();
      // Only the initial queue-time refresh happened; the stale completion
      // must not trigger a second one for project_2.
      expect(refreshCreditsMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("asynchronous render operations remain scoped to their project", () => {
    function fakeProjectTwo(): VideoProject {
      return fakeProject({
        id: "proj_2",
        output: { ...fakeProject().output, title: "Second Project" },
      });
    }

    it("does not attach a stale create-render success response to a different project after switching", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const { promise: createPromise, resolve: resolveCreate } =
        deferred<PersistedGenerationJob>();
      createFinalRenderMock.mockReturnValueOnce(createPromise);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));

      // Switch to project_2 before project_1's create-render request settles.
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_2 restoration: nothing active
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      await waitFor(() =>
        expect(screen.getByText("renderStartDisabled: false")).toBeTruthy(),
      );

      // Now resolve project_1's stale create-render request successfully.
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      resolveCreate(queuedJob);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.getByText("isRendering: false")).toBeTruthy();
      expect(screen.getByText("renderProgress: 0")).toBeTruthy();
      expect(screen.getByText("renderStage: null")).toBeTruthy();
      // The mutation hook's own onSuccess seeds the job-detail cache because
      // the request genuinely succeeded server-side — that is expected and
      // harmless. The workspace must simply never attach it to project_2.
      expect(
        client.getQueryData<PersistedGenerationJob>(jobQueryKeys.detail("job_1")),
      ).toEqual(queuedJob);
      expect(getPersistedJobMock).not.toHaveBeenCalledWith(
        "job_1",
        expect.anything(),
      );

      // project_2 must still be free to start its own render.
      const secondJob = fakeJob({ id: "job_2", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(secondJob);
      getPersistedJobMock.mockResolvedValue(secondJob);
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(2));
    });

    it("does not show a stale error toast or disturb a different project's render state when a create-render request fails after switching", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const { promise: createPromise, reject: rejectCreate } =
        deferred<PersistedGenerationJob>();
      createFinalRenderMock.mockReturnValueOnce(createPromise);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));

      // Switch to project_2 and restore an active render there, so we can
      // verify the stale project_1 failure doesn't disturb it.
      const proj2ActiveJob = fakeJob({
        id: "job_2",
        status: "running",
        progress: 70,
      });
      listPersistedJobsMock.mockResolvedValueOnce([proj2ActiveJob]);
      getPersistedJobMock.mockResolvedValue(proj2ActiveJob);
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      expect(screen.getByText("renderProgress: 70")).toBeTruthy();

      // Now reject project_1's stale create-render request.
      rejectCreate(new Error("Server rejected the render request."));
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(screen.getByText("isRendering: true")).toBeTruthy();
      expect(screen.getByText("renderProgress: 70")).toBeTruthy();
    });

    it("keeps project_2 rendering intact when project_1's queue-time credit refresh resolves after switching", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const { promise: creditsPromise, resolve: resolveCredits } =
        deferred<void>();
      refreshCreditsMock.mockReturnValueOnce(creditsPromise);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      // project_1's queue-time credit refresh is now pending (deferred).

      // Switch to project_2 and restore an active render there.
      const proj2ActiveJob = fakeJob({
        id: "job_2",
        status: "running",
        progress: 55,
        current_stage: "rendering_video",
      });
      listPersistedJobsMock.mockResolvedValueOnce([proj2ActiveJob]);
      getPersistedJobMock.mockResolvedValue(proj2ActiveJob);
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      expect(screen.getByText("renderProgress: 55")).toBeTruthy();
      expect(screen.getByText("renderStage: rendering_video")).toBeTruthy();

      // Now resolve project_1's stale queue-time credit refresh.
      resolveCredits();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.getByText("isRendering: true")).toBeTruthy();
      expect(screen.getByText("renderProgress: 55")).toBeTruthy();
      expect(screen.getByText("renderStage: rendering_video")).toBeTruthy();
    });

    it("keeps project_2 rendering intact when project_1's terminal credit refresh resolves after switching", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(1));

      // job_1 completes; defer the terminal credit refresh this time.
      const { promise: creditsPromise, resolve: resolveCredits } =
        deferred<void>();
      refreshCreditsMock.mockReturnValueOnce(creditsPromise);
      getPersistedRenderMock.mockResolvedValueOnce(
        fakePersistedRender({ id: "render_1", version: 3 }),
      );
      getRenderPreviewUrlMock.mockResolvedValueOnce("https://cdn.example/v3");
      mapPersistedRenderMock.mockReturnValueOnce(
        fakeRender({ version: 3, shareUrl: "https://cdn.example/v3" }),
      );
      const completedJob = fakeJob({
        id: "job_1",
        status: "completed",
        result_payload: { render_id: "render_1" },
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), completedJob);
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(2));
      // The success toast for project_1's own completion is legitimate —
      // it fired while the user was still on project_1, before any switch.
      expect(toastSuccessMock).toHaveBeenCalledTimes(1);

      // Switch to project_2 and restore an active render there.
      const proj2ActiveJob = fakeJob({
        id: "job_2",
        status: "running",
        progress: 20,
      });
      listPersistedJobsMock.mockResolvedValueOnce([proj2ActiveJob]);
      getPersistedJobMock.mockResolvedValue(proj2ActiveJob);
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      expect(screen.getByText("renderProgress: 20")).toBeTruthy();
      expect(screen.getByText("render: none")).toBeTruthy();

      // Resolve project_1's stale terminal credit refresh.
      resolveCredits();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(screen.getByText("isRendering: true")).toBeTruthy();
      expect(screen.getByText("renderProgress: 20")).toBeTruthy();
      expect(screen.getByText("render: none")).toBeTruthy();
      // No extra toast from the stale project_1 credit-refresh resolution.
      expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    });

    it("does not show a stale project_1 terminal failure toast while viewing project_2", async () => {
      getPersistedProjectMock.mockImplementation(async (id: string) =>
        id === "proj_1" ? fakeProject({ id: "proj_1" }) : fakeProjectTwo(),
      );
      getLatestProjectRenderMock.mockResolvedValue(null);
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_1 restoration: nothing active
      const queuedJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(queuedJob);
      getPersistedJobMock.mockResolvedValue(queuedJob);
      const user = userEvent.setup();

      const client = createTestQueryClient();
      const { rerender } = render(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_1" />
        </QueryClientProvider>,
      );
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));

      // Switch to project_2 while job_1 is still active/polling.
      listPersistedJobsMock.mockResolvedValueOnce([]); // proj_2 restoration: nothing active
      rerender(
        <QueryClientProvider client={client}>
          <ProjectWorkspace projectId="proj_2" />
        </QueryClientProvider>,
      );
      await screen.findByRole("heading", { name: "Second Project" });

      // job_1 fails only after the switch — the workspace no longer even
      // observes job_1's query once it belongs to a different project.
      const failedJob = fakeJob({
        id: "job_1",
        status: "failed",
        error_message: "GPU exploded",
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), failedJob);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(toastErrorMock).not.toHaveBeenCalled();
      await user.click(screen.getByRole("tab", { name: "4. Final Video" }));
      expect(screen.getByText("isRendering: false")).toBeTruthy();
    });

    // A literal "job_2 replaces job_1 in the same project while job_1's
    // terminal credit refresh is still pending" cannot actually happen
    // through the UI: `activeRenderJob` stays non-null (blocking a new
    // render) until job_1's own cleanup nulls it out, and that null-out is
    // exactly the last step gated behind the credit refresh. The defensive
    // job-identity check in the cleanup (see isTerminalStillCurrent) still
    // guards against it, but the closest genuinely reachable regression is
    // the sequencing invariant below: the gate reopens only after the first
    // job's cleanup fully resolves, and the next job in the same project
    // then gets fully independent state.
    it("only reopens the render gate after the previous job's terminal cleanup fully resolves, and the next job gets independent state", async () => {
      getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
      getLatestProjectRenderMock.mockResolvedValueOnce(null);
      listPersistedJobsMock.mockResolvedValueOnce([]);
      const firstJob = fakeJob({ id: "job_1", status: "queued" });
      createFinalRenderMock.mockResolvedValueOnce(firstJob);
      getPersistedJobMock.mockResolvedValue(firstJob);
      const user = userEvent.setup();

      const { client } = renderWorkspace();
      await startOnFinalTab(user);
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(refreshCreditsMock).toHaveBeenCalledTimes(1));

      const { promise: creditsPromise, resolve: resolveCredits } =
        deferred<void>();
      refreshCreditsMock.mockReturnValueOnce(creditsPromise);
      const failedJob = fakeJob({
        id: "job_1",
        status: "failed",
        error_message: "boom",
      });
      client.setQueryData(jobQueryKeys.detail("job_1"), failedJob);
      await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("boom"));

      // While job_1's terminal credit refresh is still pending, the render
      // gate must still be closed for this project.
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      expect(createFinalRenderMock).toHaveBeenCalledTimes(1);

      resolveCredits();
      await waitFor(() => expect(screen.getByText("isRendering: false")).toBeTruthy());

      // Only now is a fresh render for the same project allowed, and it gets
      // its own independent state, unaffected by job_1's finished cleanup.
      const secondJob = fakeJob({ id: "job_2", status: "queued", progress: 0 });
      createFinalRenderMock.mockResolvedValueOnce(secondJob);
      getPersistedJobMock.mockResolvedValue(secondJob);
      await user.click(screen.getByRole("button", { name: "Start Render" }));
      await waitFor(() => expect(createFinalRenderMock).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText("isRendering: true")).toBeTruthy());

      const runningSecondJob = fakeJob({
        id: "job_2",
        status: "running",
        progress: 30,
        current_stage: "rendering_video",
      });
      client.setQueryData(jobQueryKeys.detail("job_2"), runningSecondJob);
      await waitFor(() => expect(screen.getByText("renderProgress: 30")).toBeTruthy());
      expect(screen.getByText("renderStage: rendering_video")).toBeTruthy();
    });
  });
});
