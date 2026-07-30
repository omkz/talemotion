"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { generateAllScenes, retryScene } from "@/lib/mock-api";
import { SceneEditDialog } from "@/components/storyboard/scene-edit-dialog";
import type { Asset, AspectRatio, Scene, SceneVersion } from "@/types";
import { GenerationCard } from "./generation-card";
import { GenerationDetailsDrawer } from "./generation-details-drawer";
import { RegenerateSceneDialog } from "./regenerate-scene-dialog";

interface GenerationSectionProps {
  scenes: Scene[];
  aspectRatio: AspectRatio;
  onScenesChange: (scenes: Scene[]) => void;
  markDirty: () => void;
  onGenerationStart?: () => void;
  regenerateInstructionPlaceholder?: (sceneId: string) => string | undefined;
}

export function GenerationSection({
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
  const cancelRef = useRef<() => void>(() => {});
  const scenesRef = useRef(scenes);

  useEffect(() => {
    scenesRef.current = scenes;
  });

  useEffect(() => () => cancelRef.current(), []);

  const patchScene = (sceneId: string, patch: Partial<Scene>) => {
    onScenesChange(scenesRef.current.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)));
  };

  const applyGeneratedAsset = (sceneId: string, asset: Asset) => {
    const scene = scenesRef.current.find((s) => s.id === sceneId);
    if (!scene) return;
    const versions = scene.versions.map((v) =>
      v.version === scene.activeVersion ? { ...v, asset } : v
    );
    patchScene(sceneId, { versions, status: "completed", currentJob: null });
  };

  const handleGenerateAll = () => {
    const alreadyCompleted = new Set(
      scenesRef.current.filter((s) => s.status === "completed").map((s) => s.id)
    );
    if (scenesRef.current.length === alreadyCompleted.size) {
      toast.info("All scenes are already generated.");
      return;
    }

    setIsGeneratingAll(true);
    onGenerationStart?.();
    const sceneIds = scenesRef.current.map((s) => s.id);

    cancelRef.current = generateAllScenes(sceneIds, alreadyCompleted, {
      onSceneUpdate: (sceneId, status, job, asset) => {
        if (status === "completed" && asset) {
          applyGeneratedAsset(sceneId, asset);
        } else {
          patchScene(sceneId, { status, currentJob: job });
        }
      },
      onOverallProgress: setOverallProgress,
      onComplete: () => {
        setIsGeneratingAll(false);
        toast.success("All scenes generated");
      },
    });
  };

  const handleRetry = (sceneId: string) => {
    retryScene(sceneId, (status, job, asset) => {
      if (status === "completed" && asset) {
        applyGeneratedAsset(sceneId, asset);
      } else {
        patchScene(sceneId, { status, currentJob: job });
      }
    });
    toast("Retrying scene generation…");
  };

  const handleApprove = (sceneId: string) => {
    const scene = scenesRef.current.find((s) => s.id === sceneId);
    if (!scene) return;
    patchScene(sceneId, { approved: !scene.approved });
    markDirty();
  };

  const handleRegenerateComplete = (sceneId: string, version: SceneVersion) => {
    const scene = scenesRef.current.find((s) => s.id === sceneId);
    if (!scene) return;
    patchScene(sceneId, {
      versions: [...scene.versions, version],
      activeVersion: version.version,
      status: "completed",
      approved: false,
    });
    markDirty();
    toast.success(`Scene ${scene.position} regenerated`, { description: `Now on version ${version.version}.` });
  };

  const handleEditPromptSave = (
    sceneId: string,
    patch: Pick<Scene, "title" | "narration" | "visualPrompt" | "durationSeconds">
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

  const completedCount = scenes.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Generate</h2>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {scenes.length} scenes generated
          </p>
        </div>
        <Button onClick={handleGenerateAll} disabled={isGeneratingAll}>
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
            onRetry={() => handleRetry(scene.id)}
            onRegenerate={() => setRegenerateTarget(scene)}
            onEditPrompt={() => setEditPromptTarget(scene)}
            onApprove={() => handleApprove(scene.id)}
            onShowDetails={() =>
              setDetailsAsset(
                scene.versions.find((v) => v.version === scene.activeVersion)?.asset ?? null
              )
            }
          />
        ))}
      </div>

      <RegenerateSceneDialog
        scene={regenerateTarget}
        onOpenChange={(open) => !open && setRegenerateTarget(null)}
        onComplete={handleRegenerateComplete}
        instructionPlaceholder={
          regenerateTarget ? regenerateInstructionPlaceholder?.(regenerateTarget.id) : undefined
        }
      />

      <SceneEditDialog
        scene={editPromptTarget}
        onOpenChange={(open) => !open && setEditPromptTarget(null)}
        onSave={handleEditPromptSave}
      />

      <GenerationDetailsDrawer asset={detailsAsset} onOpenChange={(open) => !open && setDetailsAsset(null)} />
    </div>
  );
}
