"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, RotateCcw, Sparkles, Film } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  addScene,
  deleteScene,
  duplicateScene,
  generateStoryboard,
  resetStoryboard,
  updateScene,
} from "@/lib/mock-api";
import {
  createStoryboardGeneration,
  listPersistedJobs,
  pollPersistedJob,
  realSceneGenerationEnabled,
} from "@/lib/api/scene-generation-jobs";
import type { AspectRatio, Scene, VideoMode } from "@/types";
import { SceneCard } from "./scene-card";
import { SceneEditDialog } from "./scene-edit-dialog";
import { useCredits } from "@/components/credits/credits-provider";

interface StoryboardSectionProps {
  projectId: string;
  projectMode: VideoMode;
  scenes: Scene[];
  aspectRatio: AspectRatio;
  onScenesChange: (scenes: Scene[]) => void;
  markDirty: () => void;
  onRefreshProject?: () => Promise<void>;
}

export function StoryboardSection({
  projectId,
  projectMode,
  scenes,
  aspectRatio,
  onScenesChange,
  markDirty,
  onRefreshProject,
}: StoryboardSectionProps) {
  const { credits, estimate, canAfford, refresh: refreshCredits } = useCredits();
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const refreshProjectRef = useRef(onRefreshProject);

  useEffect(() => {
    refreshProjectRef.current = onRefreshProject;
  }, [onRefreshProject]);

  useEffect(() => {
    if (!realSceneGenerationEnabled) return;
    const controller = new AbortController();
    void listPersistedJobs(projectId, {
      activeOnly: true,
      signal: controller.signal,
    })
      .then((jobs) => {
        const active = jobs.find((job) => job.type === "storyboard");
        if (!active) return;
        setIsRegenerating(true);
        return pollPersistedJob(active.id, {
          signal: controller.signal,
          onUpdate: () => undefined,
        }).then(async (completed) => {
          if (completed.status === "completed") {
            await refreshProjectRef.current?.();
          } else {
            toast.error(
              completed.error_message ?? "Storyboard generation failed.",
            );
          }
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not restore storyboard state.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsRegenerating(false);
      });
    return () => controller.abort();
  }, [projectId]);

  const runAction = async (action: () => Promise<Scene[]>) => {
    setIsBusy(true);
    try {
      const nextScenes = await action();
      onScenesChange(nextScenes);
      markDirty();
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddScene = () => runAction(() => addScene(projectId));

  const handleDuplicate = (sceneId: string) =>
    runAction(() => duplicateScene(projectId, sceneId));

  const handleDeleteConfirmed = async () => {
    if (!deletingSceneId) return;
    const id = deletingSceneId;
    setDeletingSceneId(null);
    await runAction(() => deleteScene(projectId, id));
    toast.success("Scene deleted");
  };

  const handleSaveScene = async (
    sceneId: string,
    patch: Pick<Scene, "title" | "narration" | "visualPrompt" | "durationSeconds">
  ) => {
    await runAction(() => updateScene(projectId, sceneId, patch));
    toast.success("Scene updated");
  };

  const handleReset = async () => {
    await runAction(() => resetStoryboard(projectId));
    toast.success("Storyboard reset to original content");
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      if (realSceneGenerationEnabled) {
        const queued = await createStoryboardGeneration(
          projectId,
          scenes.length > 0,
          undefined,
          crypto.randomUUID(),
        );
        await refreshCredits();
        const completed = await pollPersistedJob(queued.id, {
          onUpdate: () => undefined,
        });
        if (completed.status !== "completed") {
          throw new Error(
            completed.error_message ?? "Storyboard generation failed.",
          );
        }
        await onRefreshProject?.();
        toast.success("Four storyboard scenes are ready");
        return;
      }
      const nextScenes = await generateStoryboard(projectId);
      onScenesChange(nextScenes);
      markDirty();
      toast.success("Storyboard regenerated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Storyboard generation failed.",
      );
    } finally {
      if (realSceneGenerationEnabled) {
        await refreshCredits();
      }
      setIsRegenerating(false);
    }
  };
  const storyboardEstimate = estimate({ storyboard_generation: 1 });
  const storyboardDisabled =
    realSceneGenerationEnabled && !canAfford(storyboardEstimate);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Storyboard</h2>
          <p className="text-sm text-muted-foreground">
            {scenes.length} scene{scenes.length === 1 ? "" : "s"} · edit narration and visual
            prompts before generating.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!realSceneGenerationEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddScene}
              disabled={isBusy}
            >
              <Plus className="size-3.5" />
              Add Scene
            </Button>
          )}
          {!realSceneGenerationEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isBusy || scenes.length === 0}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating || storyboardDisabled}
            title={
              credits && storyboardDisabled
                ? `Requires ${storyboardEstimate} credits; ${credits.available} available`
                : undefined
            }
          >
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {isRegenerating
              ? "Planning storyboard"
              : scenes.length > 0
                ? "Regenerate Storyboard"
                : "Generate Storyboard"}
            {realSceneGenerationEnabled && (
              <span className="text-[10px] opacity-70">
                · est. {storyboardEstimate}
              </span>
            )}
          </Button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No scenes yet"
          description={
            realSceneGenerationEnabled
              ? projectMode === "custom-video"
                ? "Generate four structured scenes from this project's video description."
                : "Generate four historically grounded scenes from this project's topic."
              : "Add your first scene to start building this storyboard."
          }
          action={
            <Button
              onClick={
                realSceneGenerationEnabled ? handleRegenerate : handleAddScene
              }
              disabled={isBusy || isRegenerating || storyboardDisabled}
            >
              {isRegenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : realSceneGenerationEnabled ? (
                <Sparkles className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {realSceneGenerationEnabled
                ? isRegenerating
                  ? "Planning storyboard"
                  : "Generate Storyboard"
                : "Add Scene"}
              {realSceneGenerationEnabled && !isRegenerating && (
                <span className="text-[10px] opacity-70">
                  · est. {storyboardEstimate}
                </span>
              )}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {scenes.map((scene) => (
            <SceneCard
              key={scene.id}
              scene={scene}
              aspectRatio={aspectRatio}
              onEdit={() => setEditingScene(scene)}
              onDuplicate={() => handleDuplicate(scene.id)}
              onDelete={() => setDeletingSceneId(scene.id)}
              readOnly={realSceneGenerationEnabled}
            />
          ))}
        </div>
      )}

      <SceneEditDialog
        scene={editingScene}
        onOpenChange={(open) => !open && setEditingScene(null)}
        onSave={handleSaveScene}
      />

      <ConfirmDialog
        open={deletingSceneId !== null}
        onOpenChange={(open) => !open && setDeletingSceneId(null)}
        title="Delete this scene?"
        description="This will permanently remove the scene, its narration, and its visual prompt from the storyboard."
        confirmLabel="Delete scene"
        destructive
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
