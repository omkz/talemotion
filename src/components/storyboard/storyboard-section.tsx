"use client";

import { useState } from "react";
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
import type { AspectRatio, Scene } from "@/types";
import { SceneCard } from "./scene-card";
import { SceneEditDialog } from "./scene-edit-dialog";

interface StoryboardSectionProps {
  projectId: string;
  scenes: Scene[];
  aspectRatio: AspectRatio;
  onScenesChange: (scenes: Scene[]) => void;
  markDirty: () => void;
}

export function StoryboardSection({
  projectId,
  scenes,
  aspectRatio,
  onScenesChange,
  markDirty,
}: StoryboardSectionProps) {
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [deletingSceneId, setDeletingSceneId] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

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
      const nextScenes = await generateStoryboard(projectId);
      onScenesChange(nextScenes);
      markDirty();
      toast.success("Storyboard regenerated");
    } finally {
      setIsRegenerating(false);
    }
  };

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
          <Button variant="outline" size="sm" onClick={handleAddScene} disabled={isBusy}>
            <Plus className="size-3.5" />
            Add Scene
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isBusy || scenes.length === 0}>
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button size="sm" onClick={handleRegenerate} disabled={isRegenerating}>
            {isRegenerating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Regenerate Storyboard
          </Button>
        </div>
      </div>

      {scenes.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No scenes yet"
          description="Add your first scene to start building this storyboard."
          action={
            <Button onClick={handleAddScene} disabled={isBusy}>
              <Plus className="size-4" />
              Add Scene
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
