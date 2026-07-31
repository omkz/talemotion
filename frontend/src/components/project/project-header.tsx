import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  Globe,
  Layers,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { formatMode } from "@/lib/format";
import type { VideoProject } from "@/types";

export type SaveState = "saved" | "saving";

interface ProjectHeaderProps {
  project: VideoProject;
  saveState: SaveState;
  primaryAction: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
  };
  onDelete: () => void;
  deleting?: boolean;
}

export function ProjectHeader({
  project,
  saveState,
  primaryAction,
  onDelete,
  deleting = false,
}: ProjectHeaderProps) {
  return (
    <div className="border-b border-border bg-background/95 px-4 py-4 sm:px-6 lg:px-8">
      <Link
        href="/projects"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All projects
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
              {project.output.title}
            </h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{formatMode(project.mode)}</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {project.output.duration}s
            </span>
            <span className="inline-flex items-center gap-1">
              <Globe className="size-3.5" />
              {project.output.language}
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              {project.output.aspectRatio}
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-live="polite"
            >
              {saveState === "saving" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  Saved
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete ${project.output.title}`}
          >
            {deleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
          </Button>
          <Button
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || primaryAction.loading}
          >
            {primaryAction.loading && <Loader2 className="size-4 animate-spin" />}
            {primaryAction.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
