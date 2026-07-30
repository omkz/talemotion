import type { Render, VideoProject } from "@/types";
import { delay, generateId, randomBetween } from "./utils";

export interface RenderVideoParams {
  project: VideoProject;
  previousVersion: number;
  onProgress: (progress: number) => void;
}

export async function renderFinalVideo(
  params: RenderVideoParams
): Promise<Render> {
  const { project, previousVersion, onProgress } = params;
  for (let progress = 0; progress <= 100; progress += 10) {
    onProgress(progress);
    if (progress < 100) await delay(randomBetween(140, 280));
  }

  const version = previousVersion + 1;
  return {
    id: generateId("render"),
    projectId: project.id,
    version,
    status: "rendered",
    resolution: project.output.aspectRatio === "9:16" ? "1080 × 1920" : "1920 × 1080",
    durationSeconds: project.output.duration,
    fileSizeMb: randomBetween(18, 42),
    captionsBurned: project.output.captionsEnabled,
    musicIncluded: project.output.musicEnabled,
    thumbnailUrl: null,
    shareUrl: `https://talemotion.app/share/${project.id}-v${version}`,
    createdAt: new Date().toISOString(),
  };
}

export async function generateThumbnail(render: Render): Promise<Render> {
  await delay(900);
  return { ...render, thumbnailUrl: `mock-thumbnail://${render.id}` };
}

/** Synthesizes the "already rendered" state for projects seeded as ready. */
export function buildInitialRender(project: VideoProject): Render | null {
  if (project.status !== "ready") return null;
  return {
    id: `${project.id}-render-1`,
    projectId: project.id,
    version: 1,
    status: "rendered",
    resolution: project.output.aspectRatio === "9:16" ? "1080 × 1920" : "1920 × 1080",
    durationSeconds: project.output.duration,
    fileSizeMb: 27,
    captionsBurned: project.output.captionsEnabled,
    musicIncluded: project.output.musicEnabled,
    thumbnailUrl: `mock-thumbnail://${project.id}-render-1`,
    shareUrl: `https://talemotion.app/share/${project.id}-v1`,
    createdAt: project.updatedAt,
  };
}
