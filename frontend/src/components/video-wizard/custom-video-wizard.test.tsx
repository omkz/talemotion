/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateVideoProjectInput } from "@/lib/api/video-project-api";
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
const createProjectMock = vi.fn<
  (input: CreateVideoProjectInput) => Promise<VideoProject>
>();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/lib/api/scene-generation-jobs", () => ({
  realSceneGenerationEnabled: false,
}));
vi.mock("@/lib/mock-api", () => ({
  createProject: (input: CreateVideoProjectInput) => createProjectMock(input),
}));

const { CustomVideoWizard } = await import("./custom-video-wizard");

function fakeProject(): VideoProject {
  return { id: "project_custom", output: { title: "Coffee journey" } } as VideoProject;
}

describe("CustomVideoWizard", () => {
  beforeEach(() => {
    createProjectMock.mockReset();
    pushMock.mockReset();
  });

  it("has Describe and Output steps and requires a description", async () => {
    const user = userEvent.setup();
    render(<CustomVideoWizard />);

    const stepper = screen.getByRole("list");
    expect(within(stepper).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Describe" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Video description is required")).toBeTruthy();
  });

  it("returns to the selector from Describe", async () => {
    const user = userEvent.setup();
    render(<CustomVideoWizard />);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(pushMock).toHaveBeenCalledWith("/projects/new");
  });

  it("preserves input across steps and maps prompt to a Custom Video", async () => {
    createProjectMock.mockResolvedValue(fakeProject());
    const user = userEvent.setup();
    render(<CustomVideoWizard />);
    const description =
      "Show coffee beans moving from a mountain farm to a modern café.";
    await user.type(screen.getByLabelText("Describe your video"), description);
    await user.type(screen.getByLabelText(/Source notes/), "Include hand sorting.");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Output", level: 2 })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (screen.getByLabelText("Describe your video") as HTMLTextAreaElement).value,
    ).toBe(description);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock.mock.calls[0][0]).toMatchObject({
      mode: "custom-video",
      brief: {
        mode: "custom-video",
        prompt: description,
        sourceNotes: "Include hand sorting.",
        language: "en",
        targetAudience: "General audience",
      },
      output: {
        duration: 45,
        aspectRatio: "9:16",
        sceneCount: 4,
        narrationEnabled: true,
        captionsEnabled: false,
        musicEnabled: false,
      },
    });
    expect(createProjectMock.mock.calls[0][0].brief).not.toHaveProperty(
      "historicalAccuracyNote",
    );
    expect(pushMock).toHaveBeenCalledWith("/projects/project_custom");
  });

  it("preserves values after an API error and blocks duplicate submission", async () => {
    let rejectRequest: (reason?: unknown) => void = () => undefined;
    createProjectMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    const user = userEvent.setup();
    render(<CustomVideoWizard />);
    await user.type(screen.getByLabelText("Describe your video"), "A ceramic process video");
    await user.click(screen.getByRole("button", { name: "Next" }));
    const submit = screen.getByRole("button", { name: "Create project" });
    await user.dblClick(submit);

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    rejectRequest(new Error("Custom project was rejected."));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Custom project was rejected.",
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (screen.getByLabelText("Describe your video") as HTMLTextAreaElement).value,
    ).toBe("A ceramic process video");
  });
});
