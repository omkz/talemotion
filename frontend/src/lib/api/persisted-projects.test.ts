/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPersistedHistoricalProject,
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
      content_type: "educational",
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
      content_type: "educational",
      language: "id",
      tone: "informative",
      target_audience: "Pelajar",
      narration_enabled: false,
      captions_enabled: true,
      music_enabled: false,
    });
    expect(project.brief).toMatchObject({
      sourceNotes: "Catatan sumber",
      contentType: "educational",
      language: "id",
      tone: "informative",
      targetAudience: "Pelajar",
    });
  });
});
