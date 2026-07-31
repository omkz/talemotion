"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Film, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { videoProjectApi } from "@/lib/api/provider";
import {
  deletePersistedProject,
  listPersistedProjects,
} from "@/lib/api/persisted-projects";
import { realSceneGenerationEnabled } from "@/lib/api/scene-generation-jobs";
import type { VideoProject } from "@/types";
import { toast } from "sonner";
import { ProjectCard } from "./project-card";
import { ProjectFilters, type ProjectFilter } from "./project-filters";
import { ProjectsGridSkeleton } from "./projects-grid-skeleton";

export function ProjectsDashboard() {
  const [projects, setProjects] = useState<VideoProject[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<ProjectFilter>("all");
  const [deleteTarget, setDeleteTarget] = useState<VideoProject | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const request = realSceneGenerationEnabled
      ? listPersistedProjects()
      : videoProjectApi.listProjects();
    request
      .then((data) => {
        if (!cancelled) setProjects(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return [];
    if (filter === "all") return projects;
    return projects.filter((project) => project.status === filter);
  }, [projects, filter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (realSceneGenerationEnabled) {
        await deletePersistedProject(deleteTarget.id);
      } else {
        await videoProjectApi.deleteProject(deleteTarget.id);
      }
      setProjects((current) =>
        current?.filter((project) => project.id !== deleteTarget.id) ?? null,
      );
      toast.success("Project deleted", {
        description: `${deleteTarget.output.title} was removed from your projects.`,
      });
      setDeleteTarget(null);
    } catch (deleteError) {
      toast.error("Project could not be deleted", {
        description:
          deleteError instanceof Error
            ? deleteError.message
            : "Please try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Projects"
        description="Turn an idea, story, historical topic, or product into a complete generated video."
        action={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="size-4" />
              Create Video
            </Link>
          </Button>
        }
      />

      <ProjectFilters value={filter} onChange={setFilter} />

      {error && (
        <EmptyState
          icon={Film}
          title="Couldn't load your projects"
          description="Something went wrong while fetching your projects. Please try again."
          action={
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        />
      )}

      {!error && projects === null && <ProjectsGridSkeleton />}

      {!error && projects !== null && filtered.length === 0 && (
        <EmptyState
          icon={Film}
          title={filter === "all" ? "No projects yet" : "No projects match this filter"}
          description={
            filter === "all"
              ? "Create your first AI-generated video to see it here."
              : "Try a different filter or create a new video."
          }
          action={
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="size-4" />
                Create Video
              </Link>
            </Button>
          }
        />
      )}

      {!error && projects !== null && filtered.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => setDeleteTarget(project)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}
        title="Delete this project?"
        description={
          deleteTarget
            ? `“${deleteTarget.output.title}” will be removed from your project list. This action cannot be undone from TaleMotion.`
            : "This project will be removed."
        }
        confirmLabel={deleting ? "Deleting…" : "Delete project"}
        destructive
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
