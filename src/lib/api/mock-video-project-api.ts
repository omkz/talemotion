import {
  archiveAsset as mockArchiveAsset,
  deleteAsset as mockDeleteAsset,
  generateAllScenes as mockGenerateAllScenes,
  generateStoryboard as mockGenerateStoryboard,
  getAsset as mockGetAsset,
  getProject as mockGetProject,
  getSettings as mockGetSettings,
  listAssets as mockListAssets,
  listProjects as mockListProjects,
  regenerateScene as mockRegenerateScene,
  renderFinalVideo,
  replaceProject,
  restoreAsset as mockRestoreAsset,
  retryScene,
  updateSettings as mockUpdateSettings,
} from "@/lib/mock-api";
import { createProject as mockCreateProject } from "@/lib/mock-api/projects";
import { buildInitialRender } from "@/lib/mock-api/render";
import type {
  GenerationJob,
  GenerationStage,
  Render,
  Scene,
} from "@/types";
import type {
  CreateRenderOptions,
  CreateVideoProjectInput,
  ProjectListFilters,
  VideoProjectApi,
} from "./video-project-api";

const jobs = new Map<string, GenerationJob>();
const renders = new Map<string, Render>();
let jobSequence = 0;

function createJob(sceneId = ""): GenerationJob {
  jobSequence += 1;
  const now = new Date().toISOString();
  return {
    id: `mock-api-job-${Date.now().toString(36)}-${jobSequence}`,
    sceneId,
    stage: "waiting",
    progress: 0,
    errorMessage: null,
    startedAt: now,
    completedAt: null,
  };
}

function storeJob(job: GenerationJob): GenerationJob {
  jobs.set(job.id, job);
  return job;
}

function completeJob(job: GenerationJob): GenerationJob {
  return storeJob({
    ...job,
    stage: "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
  });
}

function findScene(
  sceneId: string,
  projects: Awaited<ReturnType<typeof mockListProjects>>
): Scene | null {
  for (const project of projects) {
    for (const chapter of project.chapters) {
      const scene = chapter.scenes.find((candidate) => candidate.id === sceneId);
      if (scene) return scene;
    }
  }
  return null;
}

/**
 * Adapter around the existing callback/timer-driven mock services. The
 * application continues importing those services directly today; this class
 * is the migration boundary for future consumers.
 */
export class MockVideoProjectApi implements VideoProjectApi {
  async listProjects(filters: ProjectListFilters = {}) {
    const projects = await mockListProjects();
    const search = filters.search?.trim().toLowerCase();
    return projects.filter(
      (project) =>
        (!filters.status || project.status === filters.status) &&
        (!filters.mode || project.mode === filters.mode) &&
        (!search ||
          project.output.title.toLowerCase().includes(search) ||
          project.id.toLowerCase().includes(search))
    );
  }

  getProject(projectId: string) {
    return mockGetProject(projectId);
  }

  createProject(input: CreateVideoProjectInput) {
    return mockCreateProject({
      mode: input.mode,
      brief: input.brief,
      output: input.output,
    });
  }

  async updateProject(project: Parameters<typeof replaceProject>[0]) {
    replaceProject(project);
    return project;
  }

  async deleteProject() {
    throw new Error(
      "Project deletion is only defined by the future HTTP contract."
    );
  }

  async generateStoryboard(projectId: string) {
    const job = storeJob(createJob());
    try {
      await mockGenerateStoryboard(projectId);
      return completeJob(job);
    } catch (error) {
      return storeJob({
        ...job,
        stage: "failed",
        errorMessage:
          error instanceof Error ? error.message : "Storyboard generation failed",
        completedAt: new Date().toISOString(),
      });
    }
  }

  async generateAllScenes(projectId: string) {
    const project = await mockGetProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const scenes = project.chapters.flatMap((chapter) => chapter.scenes);
    const job = storeJob(createJob());
    const completedSceneIds = scenes
      .filter((scene) => scene.status === "completed")
      .map((scene) => scene.id);
    const terminal = new Set(completedSceneIds);

    mockGenerateAllScenes(
      scenes.map((scene) => scene.id),
      new Set(completedSceneIds),
      {
        onSceneUpdate: (sceneId, status) => {
          if (status === "completed" || status === "failed") {
            terminal.add(sceneId);
          }
          if (terminal.size === scenes.length) completeJob(job);
        },
        onOverallProgress: (progress) => {
          storeJob({ ...job, progress, stage: "generating-video" });
        },
        onComplete: () => {
          completeJob(job);
        },
      }
    );
    return job;
  }

  async generateScene(sceneId: string) {
    const job = storeJob(createJob(sceneId));
    retryScene(sceneId, (_status, update) => {
      storeJob(update);
    });
    return job;
  }

  async regenerateScene(sceneId: string) {
    const projects = await mockListProjects();
    const scene = findScene(sceneId, projects);
    if (!scene) throw new Error(`Scene not found: ${sceneId}`);
    const job = storeJob(createJob(sceneId));
    await mockRegenerateScene({
      sceneId,
      nextVersion: scene.activeVersion + 1,
      onProgress: (progress, stage) => {
        storeJob({ ...job, progress, stage });
      },
    });
    return completeJob(job);
  }

  async getJob(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) throw new Error(`Mock job not found: ${jobId}`);
    return job;
  }

  async retryJob(jobId: string) {
    const previous = await this.getJob(jobId);
    const retry = storeJob({
      ...createJob(previous.sceneId),
      stage: "waiting",
    });
    if (previous.sceneId) {
      retryScene(previous.sceneId, (_status, update) => storeJob(update));
    }
    return retry;
  }

  async cancelJob(jobId: string) {
    const job = await this.getJob(jobId);
    return storeJob({
      ...job,
      stage: "failed",
      errorMessage: "Cancelled in mock mode.",
      completedAt: new Date().toISOString(),
    });
  }

  listAssets(filters = {}) {
    return mockListAssets(filters);
  }

  getAsset(assetId: string) {
    return mockGetAsset(assetId);
  }

  archiveAsset(assetId: string) {
    return mockArchiveAsset(assetId);
  }

  restoreAsset(assetId: string) {
    return mockRestoreAsset(assetId);
  }

  deleteAsset(assetId: string) {
    return mockDeleteAsset(assetId);
  }

  async createRender(
    projectId: string,
    options: CreateRenderOptions = {}
  ) {
    const project = await mockGetProject(projectId);
    if (!project) throw new Error(`Project not found: ${projectId}`);
    const job = storeJob(createJob());
    const previousVersion = Math.max(
      0,
      ...Array.from(renders.values())
        .filter((render) => render.projectId === projectId)
        .map((render) => render.version)
    );
    const render = await renderFinalVideo({
      project: {
        ...project,
        output: {
          ...project.output,
          captionsEnabled:
            options.captionsEnabled ?? project.output.captionsEnabled,
          musicEnabled:
            options.backgroundMusicEnabled ?? project.output.musicEnabled,
        },
      },
      previousVersion,
      onProgress: (progress) => {
        const stage: GenerationStage =
          progress === 100 ? "completed" : "generating-video";
        storeJob({ ...job, progress, stage });
      },
    });
    renders.set(render.id, render);
    return completeJob(job);
  }

  async getRender(renderId: string) {
    const stored = renders.get(renderId);
    if (stored) return stored;
    const projects = await mockListProjects();
    return (
      projects
        .map(buildInitialRender)
        .find((render) => render?.id === renderId) ?? null
    );
  }

  getSettings() {
    return mockGetSettings();
  }

  updateSettings(settings: Parameters<typeof mockUpdateSettings>[0]) {
    return mockUpdateSettings(settings);
  }
}
