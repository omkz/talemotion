/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VideoProject } from "@/types";
import type { CreateVideoProjectInput } from "@/lib/api/video-project-api";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver, which Radix's RadioGroup uses.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const pushMock = vi.fn();
const createProjectMock = vi.fn<(input: CreateVideoProjectInput) => Promise<VideoProject>>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/mock-api", () => ({
  createProject: (input: CreateVideoProjectInput) => createProjectMock(input),
}));

const { VideoWizard } = await import("./video-wizard");

function fakeProject(title: string): VideoProject {
  return {
    id: "project_test",
    output: { title },
  } as unknown as VideoProject;
}

async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /next/i }));
}

async function goToStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Topic"), "A surprising historical event.");
  await user.click(screen.getByRole("button", { name: /next/i }));
}

describe("VideoWizard — step 1", () => {
  it("no longer renders a Custom Setup tab or Quick Templates tab", () => {
    render(<VideoWizard />);

    expect(screen.getByText("Choose a story format")).toBeTruthy();
    expect(screen.queryByText(/custom setup/i)).toBeNull();
    expect(screen.queryByText(/quick templates/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("displays exactly the four historical templates and no other modes", () => {
    render(<VideoWizard />);

    const group = screen.getByRole("radiogroup", { name: /story formats/i });
    expect(
      within(group).getByRole("radio", { name: /historical fact/i })
    ).toBeTruthy();
    expect(
      within(group).getByRole("radio", { name: /battle & betrayal/i })
    ).toBeTruthy();
    expect(
      within(group).getByRole("radio", { name: /rise of an empire/i })
    ).toBeTruthy();
    expect(
      within(group).getByRole("radio", { name: /mystery from history/i })
    ).toBeTruthy();
    expect(within(group).getAllByRole("radio")).toHaveLength(4);

    // Every visible template targets the only production-ready mode.
    expect(within(group).queryByText(/microdrama/i)).toBeNull();
    expect(within(group).queryByText(/product advertisement/i)).toBeNull();
  });
});

describe("VideoWizard — template selection", () => {
  it("applies Battle & Betrayal's 30s / 4 scenes / 9:16 / dramatic settings", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);

    await user.click(screen.getByRole("radio", { name: /battle & betrayal/i }));
    await goToStep2(user);

    expect(
      screen.getByText(
        /opposing sides, the conflict, the deception or turning point/i
      )
    ).toBeTruthy();

    await goToStep3(user);

    expect(
      screen.getByRole("radio", { name: "30s" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "45s" }).getAttribute("aria-checked")
    ).toBe("false");
    expect(
      screen
        .getByRole("radio", { name: /9:16 vertical/i })
        .getAttribute("aria-checked")
    ).toBe("true");
    // Visual/narration style are Radix Selects — their displayed text isn't
    // reliably queryable under jsdom without opening the dropdown, so their
    // applied values are instead verified through the submitted payload in
    // the "project creation" test below.
    expect(screen.getByText(/based on/i)).toBeTruthy();
    expect(screen.getByText("Battle & Betrayal")).toBeTruthy();
  });

  it("resets manually-changed output settings back to the template defaults", async () => {
    const user = userEvent.setup();
    render(<VideoWizard />);

    await user.click(screen.getByRole("radio", { name: /battle & betrayal/i }));
    await goToStep2(user);
    await goToStep3(user);

    await user.click(screen.getByRole("radio", { name: "45s" }));
    expect(
      screen.getByRole("radio", { name: "45s" }).getAttribute("aria-checked")
    ).toBe("true");

    await user.click(
      screen.getByRole("button", { name: /reset to template defaults/i })
    );

    expect(
      screen.getByRole("radio", { name: "30s" }).getAttribute("aria-checked")
    ).toBe("true");
    expect(
      screen.getByRole("radio", { name: "45s" }).getAttribute("aria-checked")
    ).toBe("false");
  });
});

describe("VideoWizard — project creation", () => {
  it("submits the selected template's values to project creation", async () => {
    createProjectMock.mockResolvedValue(fakeProject("Test title"));
    const user = userEvent.setup();
    render(<VideoWizard />);

    await user.click(screen.getByRole("radio", { name: /battle & betrayal/i }));
    await goToStep2(user);
    await goToStep3(user);

    await user.type(screen.getByLabelText("Title"), "Test title");
    await user.click(
      screen.getByRole("button", { name: /create storyboard/i })
    );

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    const input = createProjectMock.mock.calls[0][0];
    expect(input.mode).toBe("historical-documentary");
    expect(input.templateId).toBe("battle-and-betrayal");
    expect(input.output).toMatchObject({
      title: "Test title",
      duration: 30,
      aspectRatio: "9:16",
      sceneCount: 4,
      visualStyle: "Epic Cinematic Realism",
      narrationStyle: "Dramatic Documentary",
    });
    expect(pushMock).toHaveBeenCalledWith("/projects/project_test");
  });
});
