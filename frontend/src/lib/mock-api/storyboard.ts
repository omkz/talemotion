import type { Scene, VideoProject } from "@/types";
import { createMajapahitScenes } from "@/lib/mock-data";
import { getProjectsStore, setProjectsStore } from "./store";
import { delay, generateId } from "./utils";

function requireProject(id: string): VideoProject {
  const project = getProjectsStore().find((p) => p.id === id);
  if (!project) throw new Error(`Project not found: ${id}`);
  return project;
}

function withScenes(project: VideoProject, scenes: Scene[]): VideoProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    chapters: project.chapters.map((chapter, index) =>
      index === 0 ? { ...chapter, scenes } : chapter
    ),
  };
}

function persist(project: VideoProject): VideoProject {
  const store = getProjectsStore();
  setProjectsStore(store.map((p) => (p.id === project.id ? project : p)));
  return project;
}

export function getScenes(project: VideoProject): Scene[] {
  return project.chapters[0]?.scenes ?? [];
}

/** Simulates the AI regenerating the whole storyboard from the brief. */
export async function generateStoryboard(projectId: string): Promise<Scene[]> {
  await delay(1800);
  const project = requireProject(projectId);
  const scenes =
    project.id === "majapahit" ? createMajapahitScenes() : getScenes(project);
  persist(withScenes({ ...project, status: "storyboard-ready" }, scenes));
  return scenes;
}

export async function resetStoryboard(projectId: string): Promise<Scene[]> {
  await delay(500);
  const project = requireProject(projectId);
  const scenes =
    project.id === "majapahit" ? createMajapahitScenes() : getScenes(project);
  persist(withScenes(project, scenes));
  return scenes;
}

export async function updateScene(
  projectId: string,
  sceneId: string,
  patch: Partial<Pick<Scene, "title" | "narration" | "visualPrompt" | "durationSeconds">>
): Promise<Scene[]> {
  await delay(250);
  const project = requireProject(projectId);
  const scenes = getScenes(project).map((scene) =>
    scene.id === sceneId ? { ...scene, ...patch } : scene
  );
  persist(withScenes(project, scenes));
  return scenes;
}

export async function addScene(projectId: string): Promise<Scene[]> {
  await delay(300);
  const project = requireProject(projectId);
  const existing = getScenes(project);
  const newScene: Scene = {
    id: generateId(`${projectId}-scene`),
    position: existing.length + 1,
    title: "New Scene",
    narration: "",
    visualPrompt: "",
    durationSeconds: 6,
    status: "draft",
    activeVersion: 1,
    versions: [
      {
        version: 1,
        visualPrompt: "",
        instruction: null,
        asset: null,
        createdAt: new Date().toISOString(),
      },
    ],
    currentJob: null,
    approved: false,
  };
  const scenes = [...existing, newScene];
  persist(withScenes(project, scenes));
  return scenes;
}

export async function duplicateScene(
  projectId: string,
  sceneId: string
): Promise<Scene[]> {
  await delay(300);
  const project = requireProject(projectId);
  const existing = getScenes(project);
  const source = existing.find((scene) => scene.id === sceneId);
  if (!source) return existing;

  const duplicate: Scene = {
    ...source,
    id: generateId(`${projectId}-scene`),
    title: `${source.title} (Copy)`,
    status: "draft",
    currentJob: null,
    approved: false,
  };

  const sourceIndex = existing.findIndex((scene) => scene.id === sceneId);
  const scenes = [
    ...existing.slice(0, sourceIndex + 1),
    duplicate,
    ...existing.slice(sourceIndex + 1),
  ].map((scene, index) => ({ ...scene, position: index + 1 }));

  persist(withScenes(project, scenes));
  return scenes;
}

export async function deleteScene(
  projectId: string,
  sceneId: string
): Promise<Scene[]> {
  await delay(300);
  const project = requireProject(projectId);
  const scenes = getScenes(project)
    .filter((scene) => scene.id !== sceneId)
    .map((scene, index) => ({ ...scene, position: index + 1 }));
  persist(withScenes(project, scenes));
  return scenes;
}
