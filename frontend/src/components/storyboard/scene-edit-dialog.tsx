"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Scene } from "@/types";

type SceneEditPatch = Pick<Scene, "title" | "narration" | "visualPrompt" | "durationSeconds">;

interface SceneEditDialogProps {
  scene: Scene | null;
  onOpenChange: (open: boolean) => void;
  onSave: (sceneId: string, patch: SceneEditPatch) => void;
}

export function SceneEditDialog({ scene, onOpenChange, onSave }: SceneEditDialogProps) {
  return (
    <Dialog open={scene !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit scene {scene ? scene.position : ""}</DialogTitle>
          <DialogDescription>
            Update the narration and visual prompt used to generate this scene.
          </DialogDescription>
        </DialogHeader>

        {scene && (
          <SceneEditForm
            key={scene.id}
            scene={scene}
            onSave={(patch) => {
              onSave(scene.id, patch);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SceneEditForm({
  scene,
  onSave,
  onCancel,
}: {
  scene: Scene;
  onSave: (patch: SceneEditPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [narration, setNarration] = useState(scene.narration);
  const [visualPrompt, setVisualPrompt] = useState(scene.visualPrompt);
  const [duration, setDuration] = useState(scene.durationSeconds);

  const handleSave = () => {
    onSave({
      title: title.trim() || "Untitled scene",
      narration,
      visualPrompt,
      durationSeconds: Math.min(30, Math.max(1, duration)),
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="scene-title">Title</Label>
          <Input id="scene-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scene-narration">Narration</Label>
          <Textarea
            id="scene-narration"
            rows={3}
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scene-prompt">Visual prompt</Label>
          <Textarea
            id="scene-prompt"
            rows={3}
            value={visualPrompt}
            onChange={(e) => setVisualPrompt(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scene-duration">Duration (seconds)</Label>
          <Input
            id="scene-duration"
            type="number"
            min={1}
            max={30}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 1)}
            className="w-28"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save scene</Button>
      </DialogFooter>
    </>
  );
}
