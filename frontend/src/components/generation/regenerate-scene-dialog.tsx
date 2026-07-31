"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { regenerateScene } from "@/lib/mock-api";
import type { GenerationStage, Scene, SceneVersion } from "@/types";

interface RegenerateSceneDialogProps {
  scene: Scene | null;
  onOpenChange: (open: boolean) => void;
  onComplete: (sceneId: string, version: SceneVersion) => void;
  instructionPlaceholder?: string;
  onRealRegenerate?: (scene: Scene, instruction: string) => Promise<void>;
}

const STAGE_LABEL: Partial<Record<GenerationStage, string>> = {
  waiting: "Queued",
  "generating-image": "Generating image…",
  "generating-video": "Generating video…",
  "uploading-assets": "Uploading assets…",
  completed: "Done",
};

export function RegenerateSceneDialog({
  scene,
  onOpenChange,
  onComplete,
  instructionPlaceholder,
  onRealRegenerate,
}: RegenerateSceneDialogProps) {
  return (
    <Dialog open={scene !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Regenerate scene {scene ? scene.position : ""}</DialogTitle>
          <DialogDescription>
            Create a new version of this scene&apos;s generated media using the current prompt
            plus any additional instruction.
          </DialogDescription>
        </DialogHeader>

        {scene && (
          <RegenerateForm
            key={scene.id}
            scene={scene}
            instructionPlaceholder={instructionPlaceholder}
            onOpenChange={onOpenChange}
            onComplete={onComplete}
            onRealRegenerate={onRealRegenerate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegenerateForm({
  scene,
  instructionPlaceholder,
  onOpenChange,
  onComplete,
  onRealRegenerate,
}: {
  scene: Scene;
  instructionPlaceholder?: string;
  onOpenChange: (open: boolean) => void;
  onComplete: (sceneId: string, version: SceneVersion) => void;
  onRealRegenerate?: (scene: Scene, instruction: string) => Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState("");

  const nextVersion = scene.activeVersion + 1;

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      if (onRealRegenerate) {
        await onRealRegenerate(scene, instruction.trim());
      } else {
        const { asset } = await regenerateScene({
          sceneId: scene.id,
          nextVersion,
          onProgress: (value, stage) => {
            setProgress(value);
            setStageLabel(STAGE_LABEL[stage] ?? "");
          },
        });
        onComplete(scene.id, {
          version: nextVersion,
          visualPrompt: scene.visualPrompt,
          instruction: instruction.trim() || null,
          asset,
          createdAt: new Date().toISOString(),
        });
      }
      onOpenChange(false);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label>Current visual prompt</Label>
          <p className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
            {scene.visualPrompt}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="regenerate-instruction">Additional instruction</Label>
          <Textarea
            id="regenerate-instruction"
            rows={3}
            placeholder={instructionPlaceholder ?? "e.g. Use warmer lighting and a wider establishing shot."}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={isGenerating}
          />
        </div>

        {scene.versions.length > 0 && (
          <div className="space-y-1.5">
            <Label>Version history</Label>
            <ul className="space-y-1 rounded-md border border-border p-2">
              {[...scene.versions].reverse().map((version) => (
                <li
                  key={version.version}
                  className="flex items-center justify-between rounded px-2 py-1 text-xs"
                >
                  <span className="text-foreground">
                    v{version.version}
                    {version.instruction && (
                      <span className="ml-2 text-muted-foreground">— {version.instruction}</span>
                    )}
                  </span>
                  {version.version === scene.activeVersion && (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                      Active
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isGenerating && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{stageLabel}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
          Cancel
        </Button>
        <Button
          onClick={handleRegenerate}
          disabled={isGenerating || (onRealRegenerate !== undefined && !instruction.trim())}
        >
          {isGenerating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Regenerate scene
        </Button>
      </DialogFooter>
    </>
  );
}
