"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { generateAllScenes, retryScene } from "@/lib/mock-api";
import { updatePersistedScene } from "@/lib/api/persisted-projects";
import {
  createProjectGeneration,
  createSceneRegeneration,
  createSceneGeneration,
  getAssetPreviewUrl,
  getPersistedAsset,
  getPersistedJob,
  listPersistedJobs,
  pollPersistedJob,
  realSceneGenerationEnabled,
  resultAssetId,
  retryPersistedJob,
} from "@/lib/api/scene-generation-jobs";
import type {
  PersistedAsset,
  PersistedGenerationJob,
} from "@/lib/api/scene-generation-jobs";
import { SceneEditDialog } from "@/components/storyboard/scene-edit-dialog";
import type {
  Asset,
  AspectRatio,
  Scene,
  SceneVersion,
} from "@/types";
import { GenerationCard } from "./generation-card";
import { GenerationDetailsDrawer } from "./generation-details-drawer";
import { RegenerateSceneDialog } from "./regenerate-scene-dialog";

interface GenerationSectionProps {
  projectId: string;
  scenes: Scene[];
  aspectRatio: AspectRatio;
  onScenesChange: (scenes: Scene[]) => void;
  markDirty: () => void;
  onGenerationStart?: () => void;
  onRefreshProject?: () => Promise<void>;
  regenerateInstructionPlaceholder?: (sceneId: string) => string | undefined;
}

export function GenerationSection({
  projectId,
  scenes,
  aspectRatio,
  onScenesChange,
  markDirty,
  onGenerationStart,
  onRefreshProject,
  regenerateInstructionPlaceholder,
}: GenerationSectionProps) {
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [regenerateTarget, setRegenerateTarget] = useState<Scene | null>(null);
  const [editPromptTarget, setEditPromptTarget] = useState<Scene | null>(null);
  const [detailsAsset, setDetailsAsset] = useState<Asset | null>(null);
  const [retryableScenes, setRetryableScenes] = useState<Set<string>>(new Set());
  const cancelRef = useRef<() => void>(() => {});
  const realControllers = useRef(new Map<string, AbortController>());
  const failedJobIds = useRef(new Map<string, string>());
  const parentJobIdRef = useRef<string | null>(null);
  const scenesRef = useRef(scenes);
  const restoredProjectRef = useRef<string | null>(null);

  useEffect(() => {
    scenesRef.current = scenes;
  });

  useEffect(
    () => {
      const controllers = realControllers.current;
      return () => {
        cancelRef.current();
        for (const controller of controllers.values()) controller.abort();
      };
    },
    [],
  );

  const patchScene = (sceneId: string, patch: Partial<Scene>) => {
    const next = scenesRef.current.map((scene) =>
      scene.id === sceneId ? { ...scene, ...patch } : scene,
    );
    scenesRef.current = next;
    onScenesChange(next);
  };

  const applyGeneratedAsset = (
    sceneId: string,
    asset: Asset,
    complete = true,
  ) => {
    const scene = scenesRef.current.find((item) => item.id === sceneId);
    if (!scene) return;
    const matchingVersion = scene.versions.find(
      (version) => version.version === asset.version,
    );
    const versions = matchingVersion
      ? scene.versions.map((version) =>
          version.version === asset.version ? { ...version, asset } : version,
        )
      : [
          ...scene.versions,
          {
            version: asset.version,
            visualPrompt: scene.visualPrompt,
            instruction: null,
            asset,
            createdAt: asset.createdAt,
          },
        ];
    patchScene(sceneId, {
      versions,
      activeVersion: asset.version,
      ...(complete ? { status: "completed" as const, currentJob: null } : {}),
    });
  };

  const toAsset = (
    scene: Scene,
    value: PersistedAsset,
    previewUrl: string,
  ): Asset => ({
    id: value.id,
    sceneId: scene.id,
    kind: value.type === "video" ? "video" : "image",
    previewUrl,
    version: value.version,
    provider: value.provider ?? "GMICloud",
    model: value.model_name ?? "Configured model",
    orchestration: "Genblaze",
    storageProvider: "Backblaze B2",
    manifestStatus: value.provenance_object_key ? "recorded" : "pending",
    promptSaved: true,
    sha256: value.sha256 ?? "",
    generationDurationMs: 0,
    createdAt: value.created_at,
  });

  const showPersistedAsset = async (
    scene: Scene,
    assetId: string,
    signal: AbortSignal,
    complete: boolean,
  ) => {
    const [asset, previewUrl] = await Promise.all([
      getPersistedAsset(assetId, signal),
      getAssetPreviewUrl(assetId, signal),
    ]);
    applyGeneratedAsset(scene.id, toAsset(scene, asset, previewUrl), complete);
  };

  const stageForJob = (job: PersistedGenerationJob) => {
    if (job.status === "queued") return "waiting" as const;
    if (job.status === "failed" || job.status === "cancelled") {
      return "failed" as const;
    }
    if (job.status === "completed") return "completed" as const;
    if (
      job.current_stage?.includes("animating") ||
      job.current_stage?.includes("video")
    ) {
      return "generating-video" as const;
    }
    return job.current_stage?.includes("keyframe")
      ? ("generating-image" as const)
      : ("waiting" as const);
  };

  const isRetryableJob = (job: PersistedGenerationJob) =>
    ![
      "missing_configuration",
      "provider_authentication_failed",
      "invalid_request",
    ].includes(job.error_code ?? "");

  useEffect(() => {
    if (
      !realSceneGenerationEnabled ||
      restoredProjectRef.current === projectId
    ) {
      return;
    }
    restoredProjectRef.current = projectId;
    const controller = new AbortController();
    const controllers = realControllers.current;
    controllers.set(`restore:${projectId}`, controller);

    const restore = async () => {
      for (const scene of scenesRef.current) {
        if (!scene.activeAssetId) continue;
        await showPersistedAsset(
          scene,
          scene.activeAssetId,
          controller.signal,
          scene.status === "completed",
        );
      }
      const jobs = await listPersistedJobs(projectId, {
        signal: controller.signal,
      });
      const latestByScene = new Map<string, PersistedGenerationJob>();
      for (const job of jobs) {
        if (
          job.scene_id &&
          (job.type === "scene_generation" ||
            job.type === "scene_regeneration") &&
          !latestByScene.has(job.scene_id)
        ) {
          latestByScene.set(job.scene_id, job);
        }
      }
      for (const [sceneId, job] of latestByScene) {
        const scene = scenesRef.current.find((item) => item.id === sceneId);
        if (!scene) continue;
        if (job.status === "failed" || job.status === "cancelled") {
          failedJobIds.current.set(sceneId, job.id);
          if (isRetryableJob(job)) {
            setRetryableScenes((current) => new Set(current).add(sceneId));
          }
        }
        if (
          job.status === "queued" ||
          job.status === "running" ||
          job.status === "cancel_requested"
        ) {
          patchScene(sceneId, {
            status: stageForJob(job),
            currentJob: {
              id: job.id,
              sceneId,
              stage: stageForJob(job),
              progress: job.progress,
              errorMessage: job.error_message,
              startedAt: new Date().toISOString(),
              completedAt: null,
            },
          });
          void pollPersistedJob(job.id, {
            signal: controller.signal,
            onUpdate: async (updated) => {
              const assetId = resultAssetId(updated);
              if (assetId) {
                await showPersistedAsset(
                  scene,
                  assetId,
                  controller.signal,
                  updated.status === "completed",
                );
              }
              if (updated.status !== "completed") {
                patchScene(sceneId, {
                  status: stageForJob(updated),
                  currentJob: {
                    id: updated.id,
                    sceneId,
                    stage: stageForJob(updated),
                    progress: updated.progress,
                    errorMessage: updated.error_message,
                    startedAt: new Date().toISOString(),
                    completedAt: null,
                  },
                });
              }
            },
          }).catch((error: unknown) => {
            if (!controller.signal.aborted) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Could not restore scene generation.";
              patchScene(sceneId, {
                status: "failed",
                currentJob: {
                  id: job.id,
                  sceneId,
                  stage: "failed",
                  progress: job.progress,
                  errorMessage: message,
                  startedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                },
              });
              toast.error(message);
            }
          });
        }
      }
      const activeParent = jobs.find(
        (job) =>
          job.type === "project_generation" &&
          (job.status === "queued" ||
            job.status === "running" ||
            job.status === "cancel_requested"),
      );
      if (activeParent) {
        parentJobIdRef.current = activeParent.id;
        setIsGeneratingAll(true);
        setOverallProgress(activeParent.progress);
        void pollPersistedJob(activeParent.id, {
          signal: controller.signal,
          onUpdate: (updated) => setOverallProgress(updated.progress),
        })
          .then(() => onRefreshProject?.())
          .catch((error: unknown) => {
            if (!controller.signal.aborted) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not restore project generation.",
              );
            }
          })
          .finally(() => setIsGeneratingAll(false));
      }
    };
    void restore().catch((error: unknown) => {
      if (!controller.signal.aborted) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not restore generation state.",
        );
      }
    });
    return () => {
      controller.abort();
      controllers.delete(`restore:${projectId}`);
    };
    // Restoration intentionally runs once per project; mutable scene state is
    // read through refs while polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleRealGeneration = async (
    scene: Scene,
    failedJobId?: string,
    additionalInstruction?: string,
  ) => {
    realControllers.current.get(scene.id)?.abort();
    const controller = new AbortController();
    realControllers.current.set(scene.id, controller);
    onGenerationStart?.();
    let displayedAssetId: string | null = null;
    try {
      const queuedJob = failedJobId
        ? await retryPersistedJob(failedJobId, controller.signal)
        : additionalInstruction
          ? await createSceneRegeneration(
              scene.id,
              additionalInstruction,
              controller.signal,
              crypto.randomUUID(),
            )
          : await createSceneGeneration(
              scene.id,
              controller.signal,
              crypto.randomUUID(),
            );
      patchScene(scene.id, {
        status: "waiting",
        currentJob: {
          id: queuedJob.id,
          sceneId: scene.id,
          stage: "waiting",
          progress: queuedJob.progress,
          errorMessage: null,
          startedAt: new Date().toISOString(),
          completedAt: null,
        },
      });
      const completedJob = await pollPersistedJob(queuedJob.id, {
          signal: controller.signal,
          onUpdate: async (job) => {
            const candidateAssetId = resultAssetId(job);
            if (candidateAssetId && candidateAssetId !== displayedAssetId) {
              await showPersistedAsset(
                scene,
                candidateAssetId,
                controller.signal,
                job.status === "completed",
              );
              displayedAssetId = candidateAssetId;
            }
            const stage = stageForJob(job);
            if (job.status !== "completed") {
              patchScene(scene.id, {
                status: stage,
                currentJob: {
                  id: job.id,
                  sceneId: scene.id,
                  stage,
                  progress: job.progress,
                  errorMessage: job.error_message,
                  startedAt:
                    scenesRef.current.find((item) => item.id === scene.id)
                      ?.currentJob?.startedAt ?? new Date().toISOString(),
                  completedAt:
                    job.status === "failed" || job.status === "cancelled"
                      ? new Date().toISOString()
                      : null,
                },
              });
            }
          },
        },
      );
      if (completedJob.status === "completed") {
        const finalAssetId = resultAssetId(completedJob);
        if (finalAssetId && finalAssetId !== displayedAssetId) {
          await showPersistedAsset(
            scene,
            finalAssetId,
            controller.signal,
            true,
          );
        } else {
          patchScene(scene.id, { status: "completed", currentJob: null });
        }
        setRetryableScenes((currentSet) => {
          const next = new Set(currentSet);
          next.delete(scene.id);
          return next;
        });
        failedJobIds.current.delete(scene.id);
        toast.success(
          additionalInstruction
            ? `Scene ${scene.position} regenerated`
            : `Scene ${scene.position} media generated`,
        );
        if (failedJobId && parentJobIdRef.current) {
          const parent = await getPersistedJob(
            parentJobIdRef.current,
            controller.signal,
          );
          setOverallProgress(parent.progress);
          if (parent.status === "completed") {
            toast.success("All scenes ready");
          }
        }
      } else {
        failedJobIds.current.set(scene.id, completedJob.id);
        if (isRetryableJob(completedJob)) {
          setRetryableScenes(
            (currentSet) => new Set(currentSet).add(scene.id),
          );
        }
        toast.error(
          completedJob.error_message ?? "Scene generation did not complete.",
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof Error
          ? error.message
          : "Scene generation request failed.";
      patchScene(scene.id, {
        status: "failed",
        currentJob: {
          id: `request-${scene.id}`,
          sceneId: scene.id,
          stage: "failed",
          progress: 0,
          errorMessage: message,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      });
      setRetryableScenes((currentSet) => new Set(currentSet).add(scene.id));
      toast.error(message);
    } finally {
      realControllers.current.delete(scene.id);
    }
  };

  const handleRealGenerateAll = async () => {
    const controller = new AbortController();
    realControllers.current.set(`project:${projectId}`, controller);
    setIsGeneratingAll(true);
    setOverallProgress(0);
    onGenerationStart?.();
    try {
      const queued = await createProjectGeneration(
        projectId,
        controller.signal,
        crypto.randomUUID(),
      );
      parentJobIdRef.current = queued.id;
      const completed = await pollPersistedJob(queued.id, {
        signal: controller.signal,
        onUpdate: async (parent) => {
          setOverallProgress(parent.progress);
          for (const child of parent.children) {
            if (!child.scene_id) continue;
            const sceneId = child.scene_id;
            const scene = scenesRef.current.find(
              (item) => item.id === sceneId,
            );
            if (!scene) continue;
            if (child.result_asset_id) {
              const existing = scene.versions.some(
                (version) => version.asset?.id === child.result_asset_id,
              );
              if (!existing) {
                await showPersistedAsset(
                  scene,
                  child.result_asset_id,
                  controller.signal,
                  child.status === "completed",
                );
              }
            }
            const stage =
              child.status === "completed"
                ? "completed"
                : child.status === "failed" || child.status === "cancelled"
                  ? "failed"
                  : child.status === "queued"
                    ? "waiting"
                    : "generating-image";
            if (child.status !== "completed") {
              patchScene(sceneId, {
                status: stage,
                currentJob: {
                  id: child.id,
                  sceneId,
                  stage,
                  progress: child.progress,
                  errorMessage:
                    child.status === "failed"
                      ? child.error_message ?? "Scene generation failed."
                      : null,
                  startedAt: new Date().toISOString(),
                  completedAt:
                    child.status === "failed" || child.status === "cancelled"
                      ? new Date().toISOString()
                      : null,
                },
              });
            }
            if (child.status === "failed" || child.status === "cancelled") {
              failedJobIds.current.set(sceneId, child.id);
              if (
                ![
                  "missing_configuration",
                  "provider_authentication_failed",
                  "invalid_request",
                ].includes(child.error_code ?? "")
              ) {
                setRetryableScenes(
                  (currentSet) => new Set(currentSet).add(sceneId),
                );
              }
            }
          }
        },
      });
      if (completed.status === "completed") {
        await onRefreshProject?.();
        for (const child of completed.children) {
          if (!child.scene_id || !child.result_asset_id) continue;
          const scene = scenesRef.current.find(
            (item) => item.id === child.scene_id,
          );
          if (scene) {
            await showPersistedAsset(
              scene,
              child.result_asset_id,
              controller.signal,
              true,
            );
          }
        }
        toast.success("All scenes ready");
      } else {
        toast.error(
          completed.error_message ??
            "One or more scenes could not be generated.",
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(
          error instanceof Error ? error.message : "Generate All failed.",
        );
      }
    } finally {
      realControllers.current.delete(`project:${projectId}`);
      setIsGeneratingAll(false);
    }
  };

  const handleGenerateAll = () => {
    if (realSceneGenerationEnabled) {
      void handleRealGenerateAll();
      return;
    }
    const alreadyCompleted = new Set(
      scenesRef.current
        .filter((scene) => scene.status === "completed")
        .map((scene) => scene.id),
    );
    if (scenesRef.current.length === alreadyCompleted.size) {
      toast.info("All scenes are already generated.");
      return;
    }
    setIsGeneratingAll(true);
    onGenerationStart?.();
    cancelRef.current = generateAllScenes(
      scenesRef.current.map((scene) => scene.id),
      alreadyCompleted,
      {
        onSceneUpdate: (sceneId, status, job, asset) => {
          if (status === "completed" && asset) applyGeneratedAsset(sceneId, asset);
          else patchScene(sceneId, { status, currentJob: job });
        },
        onOverallProgress: setOverallProgress,
        onComplete: () => {
          setIsGeneratingAll(false);
          toast.success("All scenes generated");
        },
      },
    );
  };

  const handleRetry = (scene: Scene) => {
    if (realSceneGenerationEnabled) {
      void handleRealGeneration(scene, failedJobIds.current.get(scene.id));
      return;
    }
    retryScene(scene.id, (status, job, asset) => {
      if (status === "completed" && asset) applyGeneratedAsset(scene.id, asset);
      else patchScene(scene.id, { status, currentJob: job });
    });
    toast("Retrying scene generation…");
  };

  const handleApprove = (sceneId: string) => {
    const scene = scenesRef.current.find((item) => item.id === sceneId);
    if (!scene) return;
    patchScene(sceneId, { approved: !scene.approved });
    markDirty();
  };

  const handleRegenerateComplete = (sceneId: string, version: SceneVersion) => {
    const scene = scenesRef.current.find((item) => item.id === sceneId);
    if (!scene) return;
    patchScene(sceneId, {
      versions: [...scene.versions, version],
      activeVersion: version.version,
      status: "completed",
      approved: false,
    });
    markDirty();
    toast.success(`Scene ${scene.position} regenerated`, {
      description: `Now on version ${version.version}.`,
    });
  };

  const handleEditPromptSave = async (
    sceneId: string,
    patch: Pick<
      Scene,
      "title" | "narration" | "visualPrompt" | "durationSeconds"
    >,
  ) => {
    if (realSceneGenerationEnabled) {
      await updatePersistedScene(sceneId, {
        title: patch.title,
        narration: patch.narration,
        visual_prompt: patch.visualPrompt,
        duration_seconds: patch.durationSeconds,
      });
      await onRefreshProject?.();
    } else {
      patchScene(sceneId, patch);
      markDirty();
    }
    toast.success("Prompt updated");
  };

  if (scenes.length === 0) {
    return (
      <EmptyState
        icon={Film}
        title="Nothing to generate yet"
        description="Add scenes in the Storyboard tab before starting generation."
      />
    );
  }

  const completedCount = scenes.filter(
    (scene) => scene.status === "completed",
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Generate</h2>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {scenes.length} scenes generated
          </p>
        </div>
        <Button
          onClick={handleGenerateAll}
          disabled={isGeneratingAll || scenes.length !== 4}
        >
          {isGeneratingAll ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Generate All Scenes
        </Button>
      </div>

      {isGeneratingAll && (
        <div className="space-y-1.5 rounded-lg border border-border p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Generating scene{" "}
              {Math.min(
                scenes.length,
                Math.floor((overallProgress / 100) * scenes.length) + 1,
              )}{" "}
              of {scenes.length}
            </span>
            <span>{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      )}

      <div className="space-y-3">
        {scenes.map((scene) => (
          <GenerationCard
            key={scene.id}
            scene={scene}
            aspectRatio={aspectRatio}
            onGenerate={() =>
              realSceneGenerationEnabled
                ? void handleRealGeneration(scene)
                : handleRetry(scene)
            }
            onRetry={() => handleRetry(scene)}
            canRetry={
              !realSceneGenerationEnabled || retryableScenes.has(scene.id)
            }
            onRegenerate={() => setRegenerateTarget(scene)}
            onEditPrompt={() => setEditPromptTarget(scene)}
            onApprove={() => handleApprove(scene.id)}
            onShowDetails={() =>
              setDetailsAsset(
                scene.versions.find(
                  (version) => version.version === scene.activeVersion,
                )?.asset ?? null,
              )
            }
            persistedMode={realSceneGenerationEnabled}
          />
        ))}
      </div>

      <RegenerateSceneDialog
        scene={regenerateTarget}
        onOpenChange={(open) => !open && setRegenerateTarget(null)}
        onComplete={handleRegenerateComplete}
        instructionPlaceholder={
          regenerateTarget
            ? regenerateInstructionPlaceholder?.(regenerateTarget.id)
            : undefined
        }
        onRealRegenerate={
          realSceneGenerationEnabled
            ? (scene, instruction) =>
                handleRealGeneration(scene, undefined, instruction)
            : undefined
        }
      />

      <SceneEditDialog
        scene={editPromptTarget}
        onOpenChange={(open) => !open && setEditPromptTarget(null)}
        onSave={handleEditPromptSave}
      />

      <GenerationDetailsDrawer
        asset={detailsAsset}
        onOpenChange={(open) => !open && setDetailsAsset(null)}
      />
    </div>
  );
}
