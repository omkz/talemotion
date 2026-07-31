import type { ModeBrief, OutputConfig, VideoMode, VideoProject } from "@/types";
import { createMajapahitScenes } from "@/lib/mock-data";
import { getProjectsStore, setProjectsStore } from "./store";
import { delay } from "./utils";

export interface CreateProjectInput {
  mode: VideoMode;
  brief: ModeBrief;
  output: OutputConfig;
}

export async function listProjects(): Promise<VideoProject[]> {
  await delay(300);
  return getProjectsStore();
}

export async function getProject(id: string): Promise<VideoProject | null> {
  await delay(200);
  return getProjectsStore().find((project) => project.id === id) ?? null;
}

/**
 * Simulates AI storyboard creation from a wizard submission. Every submission
 * provisions the shared "majapahit" demo project (the only fixture with a
 * fully written 5-scene storyboard) using the submitted brief/output so the
 * prototype always has a rich workspace to land on.
 */
export async function createProject(
  input: CreateProjectInput
): Promise<VideoProject> {
  await delay(1400);

  const store = getProjectsStore();
  const existing = store.find((project) => project.id === "majapahit");
  const now = new Date().toISOString();

  const nextProject: VideoProject = {
    id: "majapahit",
    mode: input.mode,
    status: "storyboard-ready",
    brief: input.brief,
    output: input.output,
    chapters: [
      {
        id: "majapahit-chapter-main",
        title: "Main",
        position: 1,
        scenes: createMajapahitScenes(),
      },
    ],
    thumbnailUrl: null,
    historicalAccuracyNote:
      input.mode === "historical-documentary"
        ? "Historical details are simplified for narrative pacing. Names and the broad sequence of events are drawn from traditional chronicles; exact dialogue and minor details are dramatized."
        : null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    generationProgress: 0,
  };

  const next = existing
    ? store.map((project) => (project.id === "majapahit" ? nextProject : project))
    : [nextProject, ...store];

  setProjectsStore(next);
  return nextProject;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<VideoProject, "brief" | "output" | "historicalAccuracyNote">>
): Promise<VideoProject> {
  await delay(250);
  const store = getProjectsStore();
  let updated: VideoProject | null = null;

  const next = store.map((project) => {
    if (project.id !== id) return project;
    updated = { ...project, ...patch, updatedAt: new Date().toISOString() };
    return updated;
  });

  if (!updated) throw new Error(`Project not found: ${id}`);
  setProjectsStore(next);
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  await delay(250);
  const store = getProjectsStore();
  if (!store.some((project) => project.id === id)) {
    throw new Error(`Project not found: ${id}`);
  }
  setProjectsStore(store.filter((project) => project.id !== id));
}

export function replaceProject(project: VideoProject): void {
  const store = getProjectsStore();
  setProjectsStore(
    store.map((p) => (p.id === project.id ? project : p))
  );
}
