/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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

const { VideoWizard } = await import("./video-wizard");

function fakeProject(title: string): VideoProject {
  return { id: "project_test", output: { title } } as VideoProject;
}

async function completeStory(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Topic or story idea"),
    "A documentary about Majapahit maritime power",
  );
  await user.type(screen.getByLabelText(/Source notes/), "A dated source excerpt.");
  await user.click(screen.getByRole("button", { name: "Next" }));
}

describe("Historical VideoWizard", () => {
  beforeEach(() => {
    createProjectMock.mockReset();
    pushMock.mockReset();
  });

  it("opens directly on Story with exactly three steps", () => {
    render(<VideoWizard />);

    expect(screen.getByRole("heading", { name: "Story" })).toBeTruthy();
    const stepper = screen.getByRole("list");
    expect(within(stepper).getAllByRole("listitem")).toHaveLength(3);
    expect(within(stepper).getByText("Story")).toBeTruthy();
    expect(within(stepper).getByText("Creative Direction")).toBeTruthy();
    expect(within(stepper).getByText("Output")).toBeTruthy();
  });

  it("returns from Story to the project-type selector route", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(pushMock).toHaveBeenCalledWith("/projects/new");
  });

  it("requires a topic and keeps Story values during step navigation", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Topic or story idea is required")).toBeTruthy();

    await completeStory(user);
    expect(screen.getByRole("heading", { name: "Creative Direction" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      (screen.getByLabelText("Topic or story idea") as HTMLTextAreaElement).value,
    ).toBe("A documentary about Majapahit maritime power");
  });

  it("does not expose Story Approach and submits documentary internally", async () => {
    createProjectMock.mockResolvedValue(
      fakeProject("A documentary about Majapahit maritime power"),
    );
    const user = userEvent.setup();
    render(<VideoWizard />);
    await completeStory(user);

    expect(screen.queryByLabelText("Story approach")).toBeNull();
    const narrativeTone = screen.getByRole("combobox", {
      name: "Narrative Tone",
    });
    expect(narrativeTone.textContent).toContain("Cinematic");
    expect(screen.queryByText(/^Tone$/)).toBeNull();
    expect(
      screen.getByText(
        "Controls the storytelling and narration style, not the visual brightness.",
      ),
    ).toBeTruthy();
    await user.click(narrativeTone);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Cinematic",
      "Dramatic",
      "Informative",
      "Inspirational",
      "Neutral",
    ]);
    await user.click(screen.getByRole("option", { name: "Dramatic" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Narrative Tone: Dramatic")).toBeTruthy();
    expect(screen.getByText("Target Audience")).toBeTruthy();
    expect(screen.getByText("General Audience")).toBeTruthy();
    expect(
      screen.getByText(
        "Controls the visual look, lighting, colors, realism, and atmosphere.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Visual style")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock.mock.calls[0][0]).toMatchObject({
      mode: "historical-documentary",
      brief: {
        mode: "historical-documentary",
        topic: "A documentary about Majapahit maritime power",
        tone: "dramatic",
      },
      output: {
        duration: 45,
        aspectRatio: "9:16",
        sceneCount: 4,
      },
    });
    expect(pushMock).toHaveBeenCalledWith("/projects/project_test");
  }, 10_000);

  it("offers Historical audience presets and reveals Custom on demand", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);
    await completeStory(user);

    const audience = screen.getByRole("combobox", {
      name: "Target audience",
    });
    expect(audience.textContent).toContain("General Audience");
    expect(screen.queryByLabelText("Describe the audience")).toBeNull();
    expect(
      screen.getByText(
        "Adjusts language complexity, context, and assumed historical knowledge.",
      ),
    ).toBeTruthy();

    await user.click(audience);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "General Audience",
      "Children",
      "Teenagers",
      "Students",
      "History Enthusiasts",
      "Academic Audience",
      "Custom...",
    ]);
    await user.click(screen.getByRole("option", { name: "Custom..." }));
    expect(screen.getByLabelText("Describe the audience")).toBeTruthy();
  }, 10_000);

  it("validates and trims a Custom audience before mock creation", async () => {
    createProjectMock.mockResolvedValue(fakeProject("Custom audience project"));
    const user = userEvent.setup();
    render(<VideoWizard />);
    await completeStory(user);

    const audience = screen.getByRole("combobox", {
      name: "Target audience",
    });
    await user.click(audience);
    await user.click(screen.getByRole("option", { name: "Custom..." }));
    const customAudience = screen.getByLabelText("Describe the audience");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("Describe the audience when Custom is selected"),
    ).toBeTruthy();
    await user.type(customAudience, "   ");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("Describe the audience when Custom is selected"),
    ).toBeTruthy();

    await user.clear(customAudience);
    await user.type(customAudience, "  Museum visitors  ");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Museum visitors")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProjectMock.mock.calls[0][0].brief).toMatchObject({
      targetAudience: "Museum visitors",
    });
  }, 10_000);

  it.each([
    ["Children", "Children"],
    ["History Enthusiasts", "History enthusiasts"],
  ])("submits the %s preset as %s", async (label, storedValue) => {
    createProjectMock.mockResolvedValue(fakeProject(`${label} project`));
    const user = userEvent.setup();
    render(<VideoWizard />);
    await completeStory(user);

    await user.click(
      screen.getByRole("combobox", { name: "Target audience" }),
    );
    await user.click(screen.getByRole("option", { name: label }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(createProjectMock.mock.calls[0][0].brief).toMatchObject({
      targetAudience: storedValue,
    });
  }, 10_000);

  it("drops a stale Custom audience when a preset is selected", async () => {
    createProjectMock.mockResolvedValue(fakeProject("Preset project"));
    const user = userEvent.setup();
    render(<VideoWizard />);
    await completeStory(user);

    const audience = screen.getByRole("combobox", {
      name: "Target audience",
    });
    await user.click(audience);
    await user.click(screen.getByRole("option", { name: "Custom..." }));
    await user.type(
      screen.getByLabelText("Describe the audience"),
      "Stale custom audience",
    );
    await user.click(audience);
    await user.click(screen.getByRole("option", { name: "Children" }));

    expect(screen.queryByLabelText("Describe the audience")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Children")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Create project" }));
    expect(createProjectMock.mock.calls[0][0].brief).toMatchObject({
      targetAudience: "Children",
    });
  }, 10_000);

  it("keeps input visible after a creation error", async () => {
    createProjectMock.mockRejectedValue(new Error("The topic was rejected."));
    const user = userEvent.setup();
    render(<VideoWizard />);
    await completeStory(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "The topic was rejected.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
