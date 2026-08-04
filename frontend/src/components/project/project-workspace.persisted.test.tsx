/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VideoProject } from "@/types";
import type { PersistedProjectUpdateInput } from "@/lib/api/persisted-projects";
import { projectQueryKeys } from "@/lib/queries/project-query-keys";

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
const getPersistedProjectMock = vi.fn<(id: string) => Promise<VideoProject | null>>();
const updatePersistedProjectMock =
  vi.fn<(id: string, patch: PersistedProjectUpdateInput) => Promise<VideoProject>>();
const deletePersistedProjectMock = vi.fn<(id: string) => Promise<void>>();

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
vi.mock("@/lib/api/scene-generation-jobs", () => ({
  realSceneGenerationEnabled: true,
  listPersistedJobs: vi.fn().mockResolvedValue([]),
  pollPersistedJob: vi.fn(),
}));
vi.mock("@/lib/api/render-jobs", () => ({
  createFinalRender: vi.fn(),
  getLatestProjectRender: vi.fn().mockResolvedValue(null),
  getPersistedRender: vi.fn(),
  getRenderPreviewUrl: vi.fn(),
  mapPersistedRender: vi.fn(),
}));
// Real mode never calls videoProjectApi, but it is still statically imported.
vi.mock("@/lib/api/provider", () => ({
  videoProjectApi: { deleteProject: vi.fn() },
}));
vi.mock("@/components/credits/credits-provider", () => ({
  useCredits: () => ({
    estimate: () => 0,
    canAfford: () => true,
    refresh: vi.fn(),
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
  FinalVideoSection: () => <div>Final video stub</div>,
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

describe("ProjectWorkspace (persisted mode)", () => {
  beforeEach(() => {
    getPersistedProjectMock.mockReset();
    updatePersistedProjectMock.mockReset();
    deletePersistedProjectMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
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

  it("shows an error toast, does not navigate, and leaves the workspace usable on a failed deletion", async () => {
    getPersistedProjectMock.mockResolvedValueOnce(fakeProject());
    deletePersistedProjectMock.mockRejectedValueOnce(new Error("Delete failed."));
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
    // Pending state cleared and the workspace (including the delete entry
    // point, which reopens the confirm dialog) is usable again.
    expect(screen.getByRole("heading", { name: "Majapahit Documentary" })).toBeTruthy();
    const retryButton = screen.getByRole("button", {
      name: "Delete Majapahit Documentary",
    }) as HTMLButtonElement;
    expect(retryButton).toBeTruthy();
    expect(retryButton.disabled).toBe(false);
  });

  it("disables the delete entry point while pending, preventing duplicate requests", async () => {
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

    // The dialog's own confirm action closes it on click (Radix), so the
    // real protection against a second submission while pending is the
    // header's delete entry point becoming disabled — it can't be used to
    // reopen the dialog and confirm again until the mutation settles.
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Delete Majapahit Documentary",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true),
    );

    resolve();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/projects"));
    expect(deletePersistedProjectMock).toHaveBeenCalledTimes(1);
  });
});
