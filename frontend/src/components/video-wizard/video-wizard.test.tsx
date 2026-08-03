/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VideoProject } from "@/types";
import type { CreateVideoProjectInput } from "@/lib/api/video-project-api";

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
const createProjectMock = vi.fn<(input: CreateVideoProjectInput) => Promise<VideoProject>>();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/api/scene-generation-jobs", () => ({ realSceneGenerationEnabled: false }));
vi.mock("@/lib/mock-api", () => ({
  createProject: (input: CreateVideoProjectInput) => createProjectMock(input),
}));

const { VideoWizard } = await import("./video-wizard");

function fakeProject(title: string): VideoProject {
  return { id: "project_test", output: { title } } as unknown as VideoProject;
}

async function enterStory(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Topic or story idea"),
    "A documentary about Majapahit maritime power",
  );
  await user.type(screen.getByLabelText(/Source notes/), "A dated source excerpt.");
  await user.click(screen.getByRole("button", { name: "Next" }));
}

async function chooseSelect(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) {
  await user.click(screen.getByLabelText(label));
  await user.click(screen.getByRole("option", { name: option }));
}

describe("VideoWizard", () => {
  beforeEach(() => {
    createProjectMock.mockReset();
    pushMock.mockReset();
  });

  it("uses the Story, Creative Direction, and Output flow", () => {
    render(<VideoWizard />);
    expect(screen.getByRole("heading", { name: "Story" })).toBeTruthy();
    expect(screen.getByText("Creative Direction")).toBeTruthy();
    expect(screen.getByText("Output")).toBeTruthy();
    expect(screen.getByLabelText("Topic or story idea")).toBeTruthy();
    expect(screen.getByLabelText(/Source notes/)).toBeTruthy();
    expect(screen.getByLabelText(/Project title/)).toBeTruthy();
  });

  it("blocks navigation and focuses validation on a missing topic", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Topic or story idea is required")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Story" })).toBeTruthy();
  });

  it("preserves story state while navigating backward and forward", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);
    await enterStory(user);
    expect(screen.getByRole("heading", { name: "Creative Direction" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByLabelText("Topic or story idea") as HTMLTextAreaElement).value).toBe(
      "A documentary about Majapahit maritime power",
    );
    expect((screen.getByLabelText(/Source notes/) as HTMLTextAreaElement).value).toBe(
      "A dated source excerpt.",
    );
  });

  it("offers only content types compatible with historical projects", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);
    await enterStory(user);
    await user.click(screen.getByLabelText("Content type"));
    expect(screen.getByRole("option", { name: "Documentary" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Educational" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Explainer" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Fiction" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Promotional" })).toBeNull();
  });

  it("submits normalized creative direction and real output settings", async () => {
    createProjectMock.mockResolvedValue(fakeProject("A documentary about Majapahit maritime power"));
    const user = userEvent.setup();
    render(<VideoWizard />);
    await enterStory(user);
    await chooseSelect(user, "Content type", "Educational");
    await chooseSelect(user, "Language", "Indonesian");
    await chooseSelect(user, "Tone", "Informative");
    await user.clear(screen.getByLabelText("Target audience"));
    await user.type(screen.getByLabelText("Target audience"), "History students");
    await user.type(screen.getByLabelText(/Additional direction/), "Use cautious pacing.");
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("heading", { name: "Output", level: 2 })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "30 seconds" }));
    await user.click(screen.getByRole("switch", { name: "AI narration" }));
    await user.click(screen.getByRole("switch", { name: "Captions" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock.mock.calls[0][0]).toMatchObject({
      mode: "historical-documentary",
      brief: {
        topic: "A documentary about Majapahit maritime power",
        sourceNotes: "A dated source excerpt.",
        contentType: "educational",
        language: "id",
        tone: "informative",
        targetAudience: "History students",
        additionalDirection: "Use cautious pacing.",
      },
      output: {
        duration: 30,
        aspectRatio: "9:16",
        sceneCount: 4,
        visualStyle: "Cinematic Realistic",
        narrationStyle: "Documentary",
        narrationEnabled: false,
        captionsEnabled: true,
        musicEnabled: false,
      },
    });
    expect(pushMock).toHaveBeenCalledWith("/projects/project_test");
  }, 10_000);

  it("shows a server validation error without silently creating mock media", async () => {
    createProjectMock.mockRejectedValue(new Error("The topic was rejected by the API."));
    const user = userEvent.setup();
    render(<VideoWizard />);
    await enterStory(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The topic was rejected by the API.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
