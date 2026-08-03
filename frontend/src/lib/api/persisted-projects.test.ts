/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPersistedCustomProject,
  createPersistedHistoricalProject,
  mapPersistedMode,
  mapPersistedProject,
  type PersistedProjectResponse,
} from "./persisted-projects";

afterEach(() => vi.unstubAllGlobals());

function responseProject(): PersistedProjectResponse {
  return {
    id: "project_test",
    mode: "historical_documentary",
    status: "draft",
    title: "Kekuatan maritim Majapahit",
    topic: "Kekuatan maritim Majapahit",
    source_notes: "Catatan sumber",
    content_type: "educational",
    tone: "informative",
    target_audience: "Pelajar",
    additional_direction: "Gunakan bahasa yang hati-hati.",
    language: "id",
    duration_seconds: 30,
    aspect_ratio: "9:16",
    visual_style: "cinematic historical realism",
    narration_style: "informative",
    captions_enabled: true,
    narration_enabled: false,
    music_enabled: false,
    historical_accuracy_note: null,
    generation_progress: 0,
    chapters: [],
    created_at: "2026-08-03T00:00:00Z",
    updated_at: "2026-08-03T00:00:00Z",
  };
}

describe("persisted project creation", () => {
  it("sends the complete normalized wizard brief and restores it", async () => {
    document.cookie = "talemotion_csrf=test-csrf; path=/";
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () =>
      new Response(JSON.stringify(responseProject()), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const project = await createPersistedHistoricalProject({
      topic: "Kekuatan maritim Majapahit",
      source_notes: "Catatan sumber",
      language: "id",
      tone: "informative",
      target_audience: "Pelajar",
      additional_direction: "Gunakan bahasa yang hati-hati.",
      duration_seconds: 30,
      visual_style: "cinematic historical realism",
      narration_style: "informative",
      narration_enabled: false,
      captions_enabled: true,
      music_enabled: false,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      mode: "historical_documentary",
      aspect_ratio: "9:16",
      topic: "Kekuatan maritim Majapahit",
      source_notes: "Catatan sumber",
      content_type: "documentary",
      language: "id",
      tone: "informative",
      target_audience: "Pelajar",
      narration_enabled: false,
      captions_enabled: true,
      music_enabled: false,
    });
    expect(project.brief).toMatchObject({
      sourceNotes: "Catatan sumber",
      language: "id",
      tone: "informative",
      targetAudience: "Pelajar",
    });
  });

  it("maps a Custom Video description to the persisted topic contract", async () => {
    document.cookie = "talemotion_csrf=test-csrf; path=/";
    const response = {
      ...responseProject(),
      mode: "custom_video" as const,
      title: "From farm to café",
      topic: "Follow coffee beans from a mountain farm to a modern café.",
      content_type: "documentary" as const,
      tone: "cinematic" as const,
      additional_direction: "",
      historical_accuracy_note: null,
    };
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () =>
      new Response(JSON.stringify(response), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const project = await createPersistedCustomProject({
      topic: response.topic,
      source_notes: "Use hand sorting and roasting.",
      language: "en",
      target_audience: "Coffee enthusiasts",
      duration_seconds: 45,
      visual_style: "Cinematic Realistic",
      narration_style: "Documentary",
      narration_enabled: true,
      captions_enabled: false,
      music_enabled: false,
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      mode: "custom_video",
      topic: response.topic,
      source_notes: "Use hand sorting and roasting.",
      content_type: "documentary",
      tone: "cinematic",
      target_audience: "Coffee enthusiasts",
      additional_direction: "",
      historical_accuracy_note: null,
      duration_seconds: 45,
      aspect_ratio: "9:16",
    });
    expect(project.brief).toEqual({
      mode: "custom-video",
      prompt: response.topic,
      sourceNotes: "Catatan sumber",
      language: "id",
      targetAudience: "Pelajar",
    });
  });
});

describe("persisted project mode mapping", () => {
  it.each([
    ["historical_documentary", "historical-documentary"],
    ["custom_video", "custom-video"],
    ["microdrama", "microdrama"],
    ["product_advertisement", "product-advertisement"],
  ] as const)("maps %s explicitly to %s", (apiMode, domainMode) => {
    expect(mapPersistedMode(apiMode)).toBe(domainMode);
  });

  it.each(["microdrama", "product_advertisement"] as const)(
    "does not fabricate a Historical brief for %s",
    (mode) => {
      expect(() => mapPersistedProject({ ...responseProject(), mode })).toThrow(
        /do not include the mode-specific brief fields/,
      );
    },
  );

  it("fails explicitly for an unknown runtime mode", () => {
    const unknownMode = "future_mode" as PersistedProjectResponse["mode"];
    expect(() => mapPersistedMode(unknownMode)).toThrow(
      "Unsupported persisted project mode: future_mode",
    );
  });
});
