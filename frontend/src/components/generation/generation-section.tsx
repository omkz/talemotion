"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { generateAllScenes, retryScene } from "@/lib/mock-api";
import {
  realSceneGenerationEnabled,
  resolveScenePreviewUrl,
  streamSceneRun,
} from "@/lib/api/scene-run-stream";
import { SceneEditDialog } from "@/components/storyboard/scene-edit-dialog";
import type {
  Asset,
  AspectRatio,
  Scene,
  SceneRunAsset,
  SceneRunEvent,
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
  regenerateInstructionPlaceholder?: (sceneId: string) => string | undefined;
}

export function GenerationSection({
  projectId,
  scenes,
  aspectRatio,
  onScenesChange,
  markDirty,
  onGenerationStart,
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
  const scenesRef = useRef(scenes);

  useEffect(() => {
    scenesRef.current = scenes;
  });

  useEffect(
    () => () => {
      cancelRef.current();
      for (const controller of realControllers.current.values()) controller.abort();
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
    const versions = scene.versions.map((version) =>
      version.version === scene.activeVersion ? { ...version, asset } : version,
    );
    patchScene(sceneId, {
      versions,
      ...(complete ? { status: "completed" as const, currentJob: null } : {}),
    });
  };

  const toAsset = (scene: Scene, value: SceneRunAsset): Asset => ({
    id: `${scene.id}-${value.kind}-${value.sha256.slice(0, 12)}`,
    sceneId: scene.id,
    kind: value.kind,
    previewUrl: resolveScenePreviewUrl(value.preview_url),
    version: scene.activeVersion,
    provider: value.provider,
    model: value.model,
    orchestration: "Genblaze",
    storageProvider: "Backblaze B2",
    manifestStatus: "recorded",
    promptSaved: true,
    sha256: value.sha256,
    generationDurationMs: 0,
    createdAt: new Date().toISOString(),
  });

  const handleRealEvent = (scene: Scene, event: SceneRunEvent) => {
    const current =
      scenesRef.current.find((item) => item.id === scene.id) ?? scene;
    const priorJob = current.currentJob;
    const job = {
      id: event.run_id,
      sceneId: scene.id,
      stage: priorJob?.stage ?? ("waiting" as const),
      progress: priorJob?.progress ?? 0,
      errorMessage: null as string | null,
      startedAt: priorJob?.startedAt ?? new Date().toISOString(),
      completedAt: null as string | null,
    };

    switch (event.type) {
      case "scene_run.started":
        patchScene(scene.id, { status: "waiting", currentJob: job });
        break;
      case "scene_image.started":
        patchScene(scene.id, {
          status: "generating-image",
          currentJob: { ...job, stage: "generating-image" },
        });
        break;
      case "scene_image.progress":
        patchScene(scene.id, {
          status: "generating-image",
          currentJob: {
            ...job,
            stage: "generating-image",
            progress: Math.round(event.progress ?? job.progress),
          },
        });
        break;
      case "scene_image.completed":
        applyGeneratedAsset(scene.id, toAsset(scene, event.asset), false);
        break;
      case "scene_video.started":
        patchScene(scene.id, {
          status: "generating-video",
          currentJob: { ...job, stage: "generating-video" },
        });
        break;
      case "scene_video.progress":
        patchScene(scene.id, {
          status: "generating-video",
          currentJob: {
            ...job,
            stage: "generating-video",
            progress: Math.round(event.progress ?? job.progress),
          },
        });
        break;
      case "scene_video.completed":
        applyGeneratedAsset(scene.id, toAsset(scene, event.asset), false);
        break;
      case "scene_run.completed":
        applyGeneratedAsset(scene.id, toAsset(scene, event.video ?? event.image));
        setRetryableScenes((currentSet) => {
          const next = new Set(currentSet);
          next.delete(scene.id);
          return next;
        });
        toast.success(`Scene ${scene.position} media generated`);
        break;
      case "scene_run.failed":
        if (event.image) {
          applyGeneratedAsset(scene.id, toAsset(scene, event.image), false);
        }
        patchScene(scene.id, {
          status: "failed",
          currentJob: {
            ...job,
            stage: "failed",
            errorMessage: event.message,
            completedAt: new Date().toISOString(),
          },
        });
        setRetryableScenes((currentSet) => {
          const next = new Set(currentSet);
          if (event.retryable) next.add(scene.id);
          else next.delete(scene.id);
          return next;
        });
        toast.error(event.message);
        break;
    }
  };

  const handleRealGeneration = async (scene: Scene) => {
    realControllers.current.get(scene.id)?.abort();
    const controller = new AbortController();
    realControllers.current.set(scene.id, controller);
    onGenerationStart?.();
    try {
      await streamSceneRun(
        {
          project_id: projectId,
          scene_id: scene.id,
          title: scene.title,
          visual_prompt: scene.visualPrompt,
          aspect_ratio: aspectRatio,
          duration_seconds: 5,
          generate_video: true,
        },
        {
          signal: controller.signal,
          onEvent: (event) => handleRealEvent(scene, event),
        },
      );
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

  const handleGenerateAll = () => {
    if (realSceneGenerationEnabled) {
      toast.info("Generate scenes individually for the real media pipeline.");
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
      void handleRealGeneration(scene);
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

  const handleEditPromptSave = (
    sceneId: string,
    patch: Pick<
      Scene,
      "title" | "narration" | "visualPrompt" | "durationSeconds"
    >,
  ) => {
    patchScene(sceneId, patch);
    markDirty();
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
          disabled={isGeneratingAll || realSceneGenerationEnabled}
        >
          {isGeneratingAll ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {realSceneGenerationEnabled
            ? "Generate scenes individually"
            : "Generate All Scenes"}
        </Button>
      </div>

      {isGeneratingAll && (
        <div className="space-y-1.5 rounded-lg border border-border p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Overall generation progress</span>
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
            onRegenerate={() =>
              realSceneGenerationEnabled
                ? void handleRealGeneration(scene)
                : setRegenerateTarget(scene)
            }
            onEditPrompt={() => setEditPromptTarget(scene)}
            onApprove={() => handleApprove(scene.id)}
            onShowDetails={() =>
              setDetailsAsset(
                scene.versions.find(
                  (version) => version.version === scene.activeVersion,
                )?.asset ?? null,
              )
            }
          />
        ))}
      </div>

      <RegenerateSceneDialog
        scene={realSceneGenerationEnabled ? null : regenerateTarget}
        onOpenChange={(open) => !open && setRegenerateTarget(null)}
        onComplete={handleRegenerateComplete}
        instructionPlaceholder={
          regenerateTarget
            ? regenerateInstructionPlaceholder?.(regenerateTarget.id)
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
