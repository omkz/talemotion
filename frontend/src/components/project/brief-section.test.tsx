/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutputConfig } from "@/types";
import { HISTORICAL_VISUAL_STYLE_OPTIONS } from "@/components/video-wizard/project-options";
import { BriefSection } from "./brief-section";

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

const output: OutputConfig = {
  title: "Coffee journey",
  language: "en",
  duration: 45,
  aspectRatio: "9:16",
  visualStyle: HISTORICAL_VISUAL_STYLE_OPTIONS[0].value,
  narrationStyle: "Documentary",
  sceneCount: 4,
  narrationEnabled: true,
  captionsEnabled: false,
  musicEnabled: false,
};

describe("mode-aware project brief", () => {
  it("uses Custom Video labels and hides historical-only fields", async () => {
    const user = userEvent.setup();
    render(
      <BriefSection
        brief={{
          mode: "custom-video",
          prompt: "Follow coffee from a mountain farm to a modern café.",
          sourceNotes: "Include hand sorting.",
          language: "en",
          targetAudience: "Coffee enthusiasts",
        }}
        output={{ ...output, visualStyle: "Cinematic Realistic" }}
        historicalAccuracyNote="Must never appear"
        onSave={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Video description")).toBeTruthy();
    expect(screen.queryByText("Story approach")).toBeNull();
    expect(screen.queryByText("Historical accuracy note")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Video description")).toBeTruthy();
    expect(
      (screen.getByLabelText("Target audience") as HTMLInputElement).value,
    ).toBe("Coffee enthusiasts");
    expect(screen.queryByText("Narrative Tone")).toBeNull();
    expect(screen.queryByText("Story approach")).toBeNull();
    expect(screen.queryByText("Historical accuracy note")).toBeNull();
  });

  it("shows Narrative Tone and preserves an unchanged legacy value", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    render(
      <BriefSection
        brief={{
          mode: "historical-documentary",
          topic: "The rise of Majapahit",
          sourceNotes: "A source excerpt",
          language: "en",
          tone: "informative",
          targetAudience: "General audience",
          additionalDirection: "Focus on maritime trade",
        }}
        output={output}
        historicalAccuracyNote="Use cautious wording."
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Topic or story idea")).toBeTruthy();
    expect(screen.getByText("Narrative Tone")).toBeTruthy();
    expect(screen.getByText("informative")).toBeTruthy();
    expect(screen.getByText("Historical accuracy note")).toBeTruthy();
    expect(screen.queryByText("Story approach")).toBeNull();
    expect(screen.queryByText(/^Tone$/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const narrativeTone = screen.getByRole("combobox", {
      name: "Narrative Tone",
    });
    expect(narrativeTone.textContent).toContain("Informative");
    expect(
      screen.getByRole("combobox", { name: "Target audience" }).textContent,
    ).toContain("General Audience");
    expect(screen.queryByLabelText("Describe the audience")).toBeNull();
    expect(
      screen.getByText(
        "Controls the storytelling and narration style, not the visual brightness.",
      ),
    ).toBeTruthy();
    await user.clear(screen.getByLabelText("Topic"));
    await user.type(screen.getByLabelText("Topic"), "A revised topic");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      toneChanged: false,
      brief: { tone: "informative", topic: "A revised topic" },
    });
  });

  it("marks Narrative Tone for persistence only when it changes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    render(
      <BriefSection
        brief={{
          mode: "historical-documentary",
          topic: "The rise of Majapahit",
          sourceNotes: "A source excerpt",
          language: "en",
          tone: "informative",
          targetAudience: "General audience",
          additionalDirection: "Focus on maritime trade",
        }}
        output={output}
        historicalAccuracyNote={null}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(
      screen.getByRole("combobox", { name: "Narrative Tone" }),
    );
    await user.click(screen.getByRole("option", { name: "Dramatic" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      toneChanged: true,
      brief: { tone: "dramatic" },
    });
  });

  it("loads and preserves an unknown Historical audience as Custom", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    render(
      <BriefSection
        brief={{
          mode: "historical-documentary",
          topic: "The rise of Majapahit",
          sourceNotes: "A source excerpt",
          language: "en",
          tone: "cinematic",
          targetAudience: "Museum visitors",
          additionalDirection: "Focus on maritime trade",
        }}
        output={output}
        historicalAccuracyNote={null}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("combobox", { name: "Target audience" }).textContent,
    ).toContain("Custom...");
    expect(
      (screen.getByLabelText("Describe the audience") as HTMLInputElement).value,
    ).toBe("Museum visitors");
    await user.clear(screen.getByLabelText("Topic"));
    await user.type(screen.getByLabelText("Topic"), "A revised topic");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].brief).toMatchObject({
      targetAudience: "Museum visitors",
      topic: "A revised topic",
    });
  });

  it("maps preset labels and preserves a legacy Custom Visual Style", async () => {
    const user = userEvent.setup();
    const presetSave = vi.fn(async () => true);
    const { unmount } = render(
      <BriefSection
        brief={{
          mode: "historical-documentary",
          topic: "The rise of Majapahit",
          sourceNotes: "A source excerpt",
          language: "en",
          tone: "dramatic",
          targetAudience: "General audience",
          additionalDirection: "Focus on maritime trade",
        }}
        output={{ ...output, visualStyle: HISTORICAL_VISUAL_STYLE_OPTIONS[1].value }}
        historicalAccuracyNote={null}
        onSave={presetSave}
      />,
    );

    expect(screen.getByText("Dark Epic")).toBeTruthy();
    expect(screen.queryByText(HISTORICAL_VISUAL_STYLE_OPTIONS[1].value)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("combobox", { name: "Visual style" }).textContent,
    ).toContain("Dark Epic");
    expect(screen.queryByLabelText("Describe the visual style")).toBeNull();
    unmount();

    const customStyle = "Cold blue moonlight with fog and desaturated colors.";
    const customSave = vi.fn(async () => true);
    render(
      <BriefSection
        brief={{
          mode: "historical-documentary",
          topic: "The rise of Majapahit",
          sourceNotes: "A source excerpt",
          language: "en",
          tone: "informative",
          targetAudience: "General audience",
          additionalDirection: "Focus on maritime trade",
        }}
        output={{ ...output, visualStyle: customStyle }}
        historicalAccuracyNote={null}
        onSave={customSave}
      />,
    );

    expect(screen.getByText(customStyle)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      screen.getByRole("combobox", { name: "Visual style" }).textContent,
    ).toContain("Custom...");
    expect(
      (screen.getByLabelText("Describe the visual style") as HTMLTextAreaElement)
        .value,
    ).toBe(customStyle);
    await user.clear(screen.getByLabelText("Topic"));
    await user.type(screen.getByLabelText("Topic"), "A revised topic");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(customSave).toHaveBeenCalledTimes(1));
    expect(customSave.mock.calls[0][0]).toMatchObject({
      visualStyle: customStyle,
      toneChanged: false,
      brief: { tone: "informative" },
    });
  }, 10_000);
});
