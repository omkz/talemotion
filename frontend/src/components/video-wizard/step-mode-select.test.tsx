/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StepModeSelect } from "./step-mode-select";

afterEach(cleanup);

describe("project type selector", () => {
  it("shows two available workflows and two coming-soon formats", () => {
    render(<StepModeSelect />);

    expect(
      screen.getByRole("link", { name: /Historical Documentary/i }).getAttribute("href"),
    ).toBe("/projects/new/historical");
    expect(
      screen.getByRole("link", { name: /Custom Video/i }).getAttribute("href"),
    ).toBe("/projects/new/custom");
    expect(screen.getByText("Microdrama").closest("div[aria-disabled='true']")).toBeTruthy();
    expect(
      screen.getByText("Product Advertisement").closest("div[aria-disabled='true']"),
    ).toBeTruthy();
    expect(screen.getAllByText("Coming Soon")).toHaveLength(2);
  });
});
