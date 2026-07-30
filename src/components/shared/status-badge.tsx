import { Loader2, CheckCircle2, FileText, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectStatus, SceneStatus } from "@/types";

const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground",
    icon: FileText,
  },
  "storyboard-ready": {
    label: "Storyboard Ready",
    className: "bg-secondary text-secondary-foreground",
    icon: Sparkles,
  },
  generating: {
    label: "Generating",
    className: "bg-accent/15 text-accent",
    icon: Loader2,
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-500/15 text-emerald-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-destructive/15 text-destructive",
    icon: XCircle,
  },
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const meta = PROJECT_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        meta.className
      )}
    >
      <Icon className={cn("size-3.5", status === "generating" && "animate-spin")} />
      {meta.label}
    </span>
  );
}

const SCENE_STATUS_META: Record<
  SceneStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  waiting: { label: "Waiting", className: "bg-muted text-muted-foreground" },
  "generating-image": { label: "Generating image", className: "bg-accent/15 text-accent" },
  "generating-video": { label: "Generating video", className: "bg-accent/15 text-accent" },
  "generating-narration": { label: "Generating narration", className: "bg-accent/15 text-accent" },
  "uploading-assets": { label: "Uploading assets", className: "bg-accent/15 text-accent" },
  completed: { label: "Completed", className: "bg-emerald-500/15 text-emerald-400" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

export function SceneStatusBadge({ status, className }: { status: SceneStatus; className?: string }) {
  const meta = SCENE_STATUS_META[status];
  const isSpinning = status.startsWith("generating") || status === "uploading-assets";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className
      )}
    >
      {isSpinning && <Loader2 className="size-3 animate-spin" />}
      {meta.label}
    </span>
  );
}
