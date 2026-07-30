import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MediaPlaceholder } from "@/components/shared/media-placeholder";
import { SceneStatusBadge } from "@/components/shared/status-badge";
import type { AspectRatio, Scene } from "@/types";

interface SceneCardProps {
  scene: Scene;
  aspectRatio: AspectRatio;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}

export function SceneCard({
  scene,
  aspectRatio,
  onEdit,
  onDuplicate,
  onDelete,
  readOnly = false,
}: SceneCardProps) {
  return (
    <Card className="gap-0 overflow-hidden p-0 sm:flex-row">
      <div className="w-full shrink-0 sm:w-40">
        <MediaPlaceholder aspectRatio={aspectRatio} className="h-full rounded-none border-0" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {scene.position}
            </span>
            <h3 className="text-sm font-semibold text-foreground">{scene.title}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <SceneStatusBadge status={scene.status} />
            <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Narration
            </p>
            <p className="line-clamp-2 text-sm text-foreground/90">
              {scene.narration || <span className="italic text-muted-foreground">No narration yet</span>}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Visual prompt
            </p>
            <p className="line-clamp-2 font-mono text-xs text-muted-foreground">
              {scene.visualPrompt || "No visual prompt yet"}
            </p>
          </div>
        </div>

        {!readOnly && <div className="mt-auto flex items-center gap-1 pt-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit scene ${scene.position}`}>
                <Pencil className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit scene</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDuplicate}
                aria-label={`Duplicate scene ${scene.position}`}
              >
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate scene</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                aria-label={`Delete scene ${scene.position}`}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete scene</TooltipContent>
          </Tooltip>
        </div>}
      </div>
    </Card>
  );
}
