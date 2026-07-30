import Link from "next/link";
import { Clock, Layers } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MediaPlaceholder } from "@/components/shared/media-placeholder";
import { ProjectStatusBadge } from "@/components/shared/status-badge";
import { formatMode, formatRelativeTime } from "@/lib/format";
import type { VideoProject } from "@/types";

export function ProjectCard({ project }: { project: VideoProject }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="gap-0 overflow-hidden py-0 transition-colors group-hover:ring-foreground/20">
        <MediaPlaceholder
          aspectRatio={project.output.aspectRatio}
          className="rounded-none border-0 border-b border-border"
        />
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {project.output.title}
              </h3>
              <div className="shrink-0">
                <ProjectStatusBadge status={project.status} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{formatMode(project.mode)}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" />
              {project.output.aspectRatio}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {project.output.duration}s
            </span>
            <span>Updated {formatRelativeTime(project.updatedAt)}</span>
          </div>

          {project.status === "generating" && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Generating</span>
                <span>{project.generationProgress}%</span>
              </div>
              <Progress value={project.generationProgress} className="h-1.5" />
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
