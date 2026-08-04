/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VideoProject } from "@/types";

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
const getProjectMock = vi.fn<(id: string) => Promise<VideoProject | null>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, refresh: refreshMock }),
}));
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args), error: (...args: unknown[]) => toastErrorMock(...args) },
}));
vi.mock("@/lib/mock-api", () => ({
  getProject: (id: string) => getProjectMock(id),
  renderFinalVideo: vi.fn(),
}));
vi.mock("@/lib/mock-api/render", () => ({
  buildInitialRender: () => null,
}));
vi.mock("@/lib/mock-api/projects", () => ({
  replaceProject: vi.fn(),
}));
vi.mock("@/lib/api/persisted-projects", () => ({
  getPersistedProject: vi.fn(),
  updatePersistedProject: vi.fn(),
  deletePersistedProject: vi.fn(),
}));
vi.mock("@/lib/api/scene-generation-jobs", () => ({
  realSceneGenerationEnabled: false,
  listPersistedJobs: vi.fn(),
  pollPersistedJob: vi.fn(),
}));
vi.mock("@/lib/api/render-jobs", () => ({
  createFinalRender: vi.fn(),
  getLatestProjectRender: vi.fn(),
  getPersistedRender: vi.fn(),
  getRenderPreviewUrl: vi.fn(),
  mapPersistedRender: vi.fn(),
}));
const deleteProjectApiMock = vi.fn<(id: string) => Promise<void>>();
vi.mock("@/lib/api/provider", () => ({
  videoProjectApi: { deleteProject: (id: string) => deleteProjectApiMock(id) },
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
      queries: {
        retry: false,
      },
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
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("ProjectWorkspace", () => {
  beforeEach(() => {
    getProjectMock.mockReset();
    deleteProjectApiMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
    refreshMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("renders the loading skeleton while the project query is pending", async () => {
    const { promise, resolve } = deferred<VideoProject | null>();
    getProjectMock.mockReturnValueOnce(promise);

    const { container } = renderWorkspace();

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);

    resolve(fakeProject());
    await screen.findByRole("heading", { name: "Majapahit Documentary" });
  });

  it("renders the Project not found UI when the project does not exist", async () => {
    getProjectMock.mockResolvedValueOnce(null);

    renderWorkspace("missing-project");

    expect(await screen.findByText("Project not found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to projects" })).toBeTruthy();
  });

  it("renders the Project not found UI and shows one error toast when the query fails", async () => {
    getProjectMock.mockRejectedValueOnce(new Error("network down"));

    renderWorkspace("proj_1");

    expect(await screen.findByText("Project not found")).toBeTruthy();
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledTimes(1));
    expect(toastErrorMock).toHaveBeenCalledWith("network down");
  });

  it("initializes the workspace from a successful query", async () => {
    getProjectMock.mockResolvedValueOnce(fakeProject());

    renderWorkspace();

    expect(await screen.findByRole("heading", { name: "Majapahit Documentary" })).toBeTruthy();
    // Draft status opens on the Brief tab; the storyboard tab's content is unmounted.
    expect(screen.getByText("Brief: Majapahit Documentary")).toBeTruthy();
    expect(screen.queryByText("Storyboard stub")).toBeNull();
  });

  it("keeps existing project interactions working: tab switching and brief saving", async () => {
    getProjectMock.mockResolvedValueOnce(fakeProject());
    const user = userEvent.setup();

    renderWorkspace();
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(screen.getByRole("tab", { name: "2. Storyboard" }));
    expect(await screen.findByText("Storyboard stub")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "1. Brief" }));
    await user.click(screen.getByRole("button", { name: "Save Brief" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Updated title" })).toBeTruthy(),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Brief updated");
  });

  it("does not reset activeTab or local edits when the project query refetches", async () => {
    const initial = fakeProject();
    getProjectMock.mockResolvedValueOnce(initial);
    const user = userEvent.setup();

    const { client } = renderWorkspace();
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    // Local edit: rename the project via the (mock-mode) brief save path.
    await user.click(screen.getByRole("button", { name: "Save Brief" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Updated title" })).toBeTruthy(),
    );

    // Navigate to a non-default tab.
    await user.click(screen.getByRole("tab", { name: "2. Storyboard" }));
    expect(await screen.findByText("Storyboard stub")).toBeTruthy();

    // Simulate a background refetch returning a fresh object reference with the
    // original (stale) title — the workspace must not reinitialize from it.
    getProjectMock.mockResolvedValueOnce(fakeProject({ output: { ...initial.output } }));
    await client.invalidateQueries({ queryKey: ["projects", "detail", "proj_1"] });
    await waitFor(() => expect(getProjectMock).toHaveBeenCalledTimes(2));

    // Still on Storyboard, and the local edit was not overwritten by the refetch.
    expect(screen.getByText("Storyboard stub")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Majapahit Documentary" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Updated title" })).toBeTruthy();
  });

  it("deletes the project via the mock API and redirects on successful mock-mode deletion", async () => {
    getProjectMock.mockResolvedValueOnce(fakeProject());
    deleteProjectApiMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    renderWorkspace();
    await screen.findByRole("heading", { name: "Majapahit Documentary" });

    await user.click(
      screen.getByRole("button", { name: "Delete Majapahit Documentary" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete project" }));

    await waitFor(() => expect(deleteProjectApiMock).toHaveBeenCalledWith("proj_1"));
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Project deleted",
      expect.objectContaining({
        description: expect.stringContaining("Majapahit Documentary"),
      }),
    );
    expect(replaceMock).toHaveBeenCalledWith("/projects");
    expect(refreshMock).toHaveBeenCalled();
  });
});
