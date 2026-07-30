import {
  AlertTriangle,
  Check,
  Info,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MediaPlaceholder } from "@/components/shared/media-placeholder";
import { SceneStatusBadge } from "@/components/shared/status-badge";
import { SCENE_STATUS_LABEL } from "@/types";
import type { AspectRatio, Scene } from "@/types";

interface GenerationCardProps {
  scene: Scene;
  aspectRatio: AspectRatio;
  onRetry: () => void;
  onRegenerate: () => void;
  onEditPrompt: () => void;
  onApprove: () => void;
  onShowDetails: () => void;
}

export function GenerationCard({
  scene,
  aspectRatio,
  onRetry,
  onRegenerate,
  onEditPrompt,
  onApprove,
  onShowDetails,
}: GenerationCardProps) {
  const asset = scene.versions.find((v) => v.version === scene.activeVersion)?.asset ?? null;
  const isActive =
    scene.status !== "draft" && scene.status !== "completed" && scene.status !== "failed";

  return (
    <Card className="gap-0 overflow-hidden p-0 sm:flex-row">
      <div className="relative w-full shrink-0 sm:w-44">
        <MediaPlaceholder
          aspectRatio={aspectRatio}
          icon={scene.status === "completed" ? Play : undefined}
          className="h-full rounded-none border-0"
        />
        {scene.status === "completed" && (
          <button
            type="button"
            onClick={onShowDetails}
            aria-label={`Play scene ${scene.position} preview`}
            className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
              <Play className="size-4 fill-current" />
            </span>
          </button>
        )}
        {asset && (
          <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground">
            v{asset.version}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {scene.position}
            </span>
            <h3 className="text-sm font-semibold text-foreground">{scene.title}</h3>
          </div>
          <SceneStatusBadge status={scene.status} />
        </div>

        {isActive && scene.currentJob && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{SCENE_STATUS_LABEL[scene.status]}</span>
              <span>{scene.currentJob.progress}%</span>
            </div>
            <Progress value={scene.currentJob.progress} className="h-1.5" />
          </div>
        )}

        {scene.status === "failed" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/8 p-2.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">
              {scene.currentJob?.errorMessage ?? "Generation failed."}
            </p>
          </div>
        )}

        {scene.status === "draft" && (
          <p className="text-xs text-muted-foreground">Waiting to start generation.</p>
        )}

        {asset && scene.status === "completed" && (
          <p className="text-xs text-muted-foreground">
            {asset.provider} · {asset.orchestration} · {asset.storageProvider}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
          {scene.status === "failed" && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw className="size-3.5" />
              Retry
            </Button>
          )}

          {scene.status === "completed" && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant={scene.approved ? "secondary" : "outline"}
                    onClick={onApprove}
                    aria-label={scene.approved ? "Approved" : `Approve scene ${scene.position}`}
                  >
                    <Check className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{scene.approved ? "Approved" : "Approve"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onRegenerate} aria-label="Regenerate scene">
                    <Sparkles className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onEditPrompt} aria-label="Edit prompt">
                    <Pencil className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit prompt</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon-sm" variant="ghost" onClick={onShowDetails} aria-label="View generation details">
                    <Info className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Generation details</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
