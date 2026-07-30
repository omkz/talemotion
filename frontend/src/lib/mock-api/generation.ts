import type { Asset, GenerationJob, GenerationStage, SceneStatus } from "@/types";
import { PROVIDER_META } from "@/lib/mock-data";
import { delay, generateId, mockSha256, randomBetween } from "./utils";

const PIPELINE_STAGES: GenerationStage[] = [
  "waiting",
  "generating-image",
  "generating-narration",
  "generating-video",
  "uploading-assets",
];

function stageDurationMs(stage: GenerationStage): number {
  switch (stage) {
    case "waiting":
      return randomBetween(150, 450);
    case "generating-image":
      return randomBetween(900, 1500);
    case "generating-narration":
      return randomBetween(700, 1100);
    case "generating-video":
      return randomBetween(1300, 2200);
    case "uploading-assets":
      return randomBetween(500, 900);
    default:
      return 0;
  }
}

function stageProgress(stage: GenerationStage): number {
  switch (stage) {
    case "waiting":
      return 5;
    case "generating-image":
      return 30;
    case "generating-narration":
      return 55;
    case "generating-video":
      return 80;
    case "uploading-assets":
      return 95;
    case "completed":
      return 100;
    case "failed":
      return 0;
  }
}

export function buildGeneratedAsset(sceneId: string, version: number): Asset {
  return {
    id: generateId(`${sceneId}-asset`),
    sceneId,
    kind: "video",
    previewUrl: null,
    version,
    provider: PROVIDER_META.provider,
    model: PROVIDER_META.model,
    orchestration: PROVIDER_META.orchestration,
    storageProvider: PROVIDER_META.storageProvider,
    manifestStatus: "verified",
    promptSaved: true,
    sha256: mockSha256(`${sceneId}-v${version}-${Date.now()}`),
    generationDurationMs: randomBetween(3200, 9800),
    createdAt: new Date().toISOString(),
  };
}

interface PipelineParams {
  sceneId: string;
  startDelayMs: number;
  shouldFail: boolean;
  cancelledRef: { current: boolean };
  onUpdate: (status: SceneStatus, job: GenerationJob, asset?: Asset) => void;
}

async function runScenePipeline(params: PipelineParams): Promise<void> {
  const { sceneId, startDelayMs, shouldFail, cancelledRef, onUpdate } = params;
  const jobId = generateId(`${sceneId}-job`);
  const startedAt = new Date().toISOString();
  const failAtStage: GenerationStage = "generating-video";

  await delay(startDelayMs);
  if (cancelledRef.current) return;

  for (const stage of PIPELINE_STAGES) {
    if (cancelledRef.current) return;
    await delay(stageDurationMs(stage));
    if (cancelledRef.current) return;

    if (shouldFail && stage === failAtStage) {
      onUpdate("failed", {
        id: jobId,
        sceneId,
        stage: "failed",
        progress: stageProgress(stage),
        errorMessage:
          "Video generation failed unexpectedly. This happens occasionally with demo providers — retry to continue.",
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    onUpdate(stage as SceneStatus, {
      id: jobId,
      sceneId,
      stage,
      progress: stageProgress(stage),
      errorMessage: null,
      startedAt,
      completedAt: null,
    });
  }

  onUpdate(
    "completed",
    {
      id: jobId,
      sceneId,
      stage: "completed",
      progress: 100,
      errorMessage: null,
      startedAt,
      completedAt: new Date().toISOString(),
    },
    buildGeneratedAsset(sceneId, 1)
  );
}

export interface GenerateAllHandlers {
  onSceneUpdate: (
    sceneId: string,
    status: SceneStatus,
    job: GenerationJob,
    asset?: Asset
  ) => void;
  onOverallProgress: (progress: number) => void;
  onComplete: () => void;
}

/**
 * Kicks off independent, staggered simulated pipelines for every scene that
 * isn't already completed. Exactly one scene is chosen at random to fail
 * during "generating-video" so the retry flow has something to demonstrate.
 * Returns a cancel function to stop pending timers (e.g. on unmount).
 */
export function generateAllScenes(
  sceneIds: string[],
  alreadyCompletedIds: Set<string>,
  handlers: GenerateAllHandlers
): () => void {
  const cancelledRef = { current: false };
  const progressByScene = new Map<string, number>();
  sceneIds.forEach((id) =>
    progressByScene.set(id, alreadyCompletedIds.has(id) ? 100 : 0)
  );

  const pendingIds = sceneIds.filter((id) => !alreadyCompletedIds.has(id));

  const reportOverall = () => {
    const total = Array.from(progressByScene.values()).reduce((a, b) => a + b, 0);
    handlers.onOverallProgress(Math.round(total / sceneIds.length));
  };

  if (pendingIds.length === 0) {
    reportOverall();
    handlers.onComplete();
    return () => {};
  }

  const failIndex = Math.floor(Math.random() * pendingIds.length);
  let completedCount = sceneIds.length - pendingIds.length;

  pendingIds.forEach((sceneId, index) => {
    void runScenePipeline({
      sceneId,
      startDelayMs: randomBetween(100, 300) + index * randomBetween(200, 400),
      shouldFail: index === failIndex,
      cancelledRef,
      onUpdate: (status, job, asset) => {
        progressByScene.set(sceneId, job.progress);
        handlers.onSceneUpdate(sceneId, status, job, asset);
        reportOverall();
        if (status === "completed") {
          completedCount += 1;
          if (completedCount === sceneIds.length) handlers.onComplete();
        }
      },
    });
  });

  return () => {
    cancelledRef.current = true;
  };
}

/** Retries a single failed scene. Always succeeds on retry for a smooth demo. */
export function retryScene(
  sceneId: string,
  onUpdate: (status: SceneStatus, job: GenerationJob, asset?: Asset) => void
): () => void {
  const cancelledRef = { current: false };
  void runScenePipeline({
    sceneId,
    startDelayMs: 150,
    shouldFail: false,
    cancelledRef,
    onUpdate,
  });
  return () => {
    cancelledRef.current = true;
  };
}

export interface RegenerateSceneParams {
  sceneId: string;
  nextVersion: number;
  onProgress: (progress: number, stage: GenerationStage) => void;
}

/** Simulates a single scene regeneration with an additional instruction. */
export async function regenerateScene(
  params: RegenerateSceneParams
): Promise<{ asset: Asset }> {
  const stages: GenerationStage[] = [
    "waiting",
    "generating-image",
    "generating-video",
    "uploading-assets",
  ];

  for (const stage of stages) {
    params.onProgress(stageProgress(stage), stage);
    await delay(stageDurationMs(stage));
  }

  params.onProgress(100, "completed");
  return { asset: buildGeneratedAsset(params.sceneId, params.nextVersion) };
}
