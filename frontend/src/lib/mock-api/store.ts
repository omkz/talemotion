import type { VideoProject } from "@/types";
import { createInitialProjects } from "@/lib/mock-data";

const STORAGE_KEY = "talemotion.mock-projects.v1";

let projects: VideoProject[] | null = null;

function loadFromStorage(): VideoProject[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VideoProject[];
  } catch {
    return null;
  }
}

function saveToStorage(next: VideoProject[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can fail (quota, private mode) — the mock store still works in-memory.
  }
}

/** Lazily initialized module-level store standing in for a real backend. */
export function getProjectsStore(): VideoProject[] {
  if (projects === null) {
    projects = loadFromStorage() ?? createInitialProjects();
  }
  return projects;
}

export function setProjectsStore(next: VideoProject[]) {
  projects = next;
  saveToStorage(next);
}

export function resetProjectsStore() {
  projects = createInitialProjects();
  saveToStorage(projects);
}
