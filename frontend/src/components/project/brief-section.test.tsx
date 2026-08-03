/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutputConfig } from "@/types";
import { BriefSection } from "./brief-section";

afterEach(cleanup);

const output: OutputConfig = {
  title: "Coffee journey",
  language: "en",
  duration: 45,
  aspectRatio: "9:16",
  visualStyle: "Cinematic Realistic",
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
        output={output}
        historicalAccuracyNote="Must never appear"
        onSave={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Video description")).toBeTruthy();
    expect(screen.queryByText("Story approach")).toBeNull();
    expect(screen.queryByText("Historical accuracy note")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Video description")).toBeTruthy();
    expect(screen.queryByText("Story approach")).toBeNull();
    expect(screen.queryByText("Historical accuracy note")).toBeNull();
  });

  it("keeps Historical fields while hiding Story Approach", () => {
    render(
      <BriefSection
        brief={{
          mode: "historical-documentary",
          topic: "The rise of Majapahit",
          sourceNotes: "A source excerpt",
          language: "en",
          tone: "cinematic",
          targetAudience: "General audience",
          additionalDirection: "Focus on maritime trade",
        }}
        output={output}
        historicalAccuracyNote="Use cautious wording."
        onSave={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("Topic or story idea")).toBeTruthy();
    expect(screen.getByText("Historical accuracy note")).toBeTruthy();
    expect(screen.queryByText("Story approach")).toBeNull();
  });
});
