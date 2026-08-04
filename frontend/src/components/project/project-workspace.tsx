"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileWarning } from "lucide-react";
import { renderFinalVideo } from "@/lib/mock-api";
import { buildInitialRender } from "@/lib/mock-api/render";
import { replaceProject } from "@/lib/mock-api/projects";
import { useProjectQuery } from "@/lib/queries/use-project-query";
import { useUpdateProjectMutation } from "@/lib/queries/use-update-project-mutation";
import { useDeleteProjectMutation } from "@/lib/queries/use-delete-project-mutation";
import { StoryboardSection } from "@/components/storyboard/storyboard-section";
import { GenerationSection } from "@/components/generation/generation-section";
import { FinalVideoSection } from "@/components/final-video/final-video-section";
import { MAJAPAHIT_REGENERATION_EXAMPLE } from "@/lib/mock-data";
import { getPersistedProject } from "@/lib/api/persisted-projects";
import {
  listPersistedJobs,
  pollPersistedJob,
  realSceneGenerationEnabled,
} from "@/lib/api/scene-generation-jobs";
import {
  createFinalRender,
  getLatestProjectRender,
  getPersistedRender,
  getRenderPreviewUrl,
  mapPersistedRender,
} from "@/lib/api/render-jobs";
import type { ModeBrief, Render, Scene, VideoProject } from "@/types";
import { BriefSection } from "./brief-section";
import { ProjectHeader, type SaveState } from "./project-header";
import { useCredits } from "@/components/credits/credits-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

type WorkspaceTab = "brief" | "storyboard" | "generate" | "final";

function initialTabFor(project: VideoProject): WorkspaceTab {
  if (project.status === "draft") return "brief";
  if (project.status === "ready") return "final";
  if (project.status === "generating") return "generate";
  return "storyboard";
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { estimate, canAfford, refresh: refreshCredits } = useCredits();
  const projectQuery = useProjectQuery(projectId);
  const updateProjectMutation = useUpdateProjectMutation(projectId);
  const deleteProjectMutation = useDeleteProjectMutation(projectId);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("brief");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [render, setRender] = useState<Render | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  const initializedProjectIdRef = useRef<string | null>(null);

  // Only treat the query's error/not-found state as fatal before the workspace has
  // ever initialized. Once `project` is loaded, a later background refetch failure
  // must not blow away the editor or unsaved local changes.
  const notFound =
    !project &&
    (projectQuery.isError ||
      (projectQuery.isSuccess && projectQuery.data === null));

  // Show one error toast for the initial load failure, not on every rerender and
  // not for background refetch errors once the workspace is already initialized.
  useEffect(() => {
    if (project || !projectQuery.isError) return;
    toast.error(
      projectQuery.error instanceof Error
        ? projectQuery.error.message
        : "Could not load the project.",
    );
  }, [project, projectQuery.isError, projectQuery.error]);

  // Run the one-time workspace initialization exactly once per loaded project,
  // so a background refetch never resets activeTab/render/local edits.
  useEffect(() => {
    const data = projectQuery.data;
    if (!data || initializedProjectIdRef.current === projectId) return;
    initializedProjectIdRef.current = projectId;

    let cancelled = false;

    // Deferred so these setState calls run as a reaction to the resolved
    // query data (mirroring the previous promise-chain `.then()` shape)
    // rather than synchronously in the effect body.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setProject(data);
      if (realSceneGenerationEnabled) {
        void Promise.all([
          getLatestProjectRender(projectId).catch((error: unknown) => {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not restore the latest video preview.",
            );
            return null;
          }),
          listPersistedJobs(projectId),
        ])
          .then(async ([latest, jobs]) => {
            if (cancelled) return;
            setRender(latest);
            const activeRender = jobs.find(
              (job) =>
                job.type === "render" &&
                (job.status === "queued" ||
                  job.status === "running" ||
                  job.status === "cancel_requested"),
            );
            if (!activeRender) {
              const failedRender = jobs.find(
                (job) =>
                  job.type === "render" &&
                  (job.status === "failed" ||
                    job.status === "cancelled"),
              );
              if (failedRender) {
                setActiveTab("final");
                setRenderProgress(failedRender.progress);
                setRenderStage(failedRender.current_stage);
                toast.error(
                  failedRender.error_message ??
                    "The latest final render did not complete.",
                );
              }
              return;
            }
            setActiveTab("final");
            setIsRendering(true);
            const completed = await pollPersistedJob(activeRender.id, {
              onUpdate: (job) => {
                if (cancelled) return;
                setRenderProgress(job.progress);
                setRenderStage(job.current_stage);
              },
            });
            if (cancelled) return;
            if (completed.status === "completed") {
              const renderId =
                typeof completed.result_payload?.render_id === "string"
                  ? completed.result_payload.render_id
                  : typeof completed.input_payload.render_id === "string"
                    ? completed.input_payload.render_id
                    : null;
              if (renderId) {
                const [persisted, previewUrl] = await Promise.all([
                  getPersistedRender(renderId),
                  getRenderPreviewUrl(renderId),
                ]);
                if (!cancelled) {
                  setRender(mapPersistedRender(persisted, previewUrl));
                }
              }
            } else {
              toast.error(
                completed.error_message ?? "Final rendering failed.",
              );
            }
          })
          .catch((error: unknown) => {
            if (!cancelled) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not restore render state.",
              );
            }
          })
          .finally(() => {
            if (!cancelled) {
              setIsRendering(false);
              setRenderStage(null);
            }
          });
      } else {
        setRender(buildInitialRender(data));
      }
      setActiveTab(initialTabFor(data));
    });

    return () => {
      cancelled = true;
    };
  }, [projectQuery.data, projectId]);

  useEffect(() => {
    if (!project || realSceneGenerationEnabled) return;
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    replaceProject(project);
  }, [project]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const markDirty = () => {
    setSaveState("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSaveState("saved"), 700);
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={FileWarning}
          title="Project not found"
          description="This project doesn't exist or may have been removed."
          action={
            <Button asChild>
              <Link href="/projects">Back to projects</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const scenes = project.chapters[0]?.scenes ?? [];
  const completedCount = scenes.filter((s) => s.status === "completed").length;

  const handleScenesChange = (nextScenes: Scene[]) => {
    setProject((prev) =>
      prev
        ? {
            ...prev,
            updatedAt: new Date().toISOString(),
            chapters: prev.chapters.map((chapter, i) =>
              i === 0 ? { ...chapter, scenes: nextScenes } : chapter
            ),
          }
        : prev
    );
  };

  const handleStoryboardScenesChange = (nextScenes: Scene[]) => {
    handleScenesChange(nextScenes);
    markDirty();
  };

  const refreshPersistedProject = async () => {
    if (!realSceneGenerationEnabled) return;
    const refreshed = await getPersistedProject(projectId);
    if (!refreshed) throw new Error("The persisted project could not be found.");
    setProject(refreshed);
  };

  const handleBriefSave = async (next: {
    brief: ModeBrief;
    title: string;
    language: string;
    duration: 30 | 45;
    visualStyle: string;
    narrationStyle: string;
    narrationEnabled: boolean;
    captionsEnabled: boolean;
    musicEnabled: boolean;
    toneChanged: boolean;
    historicalAccuracyNote: string | null;
  }): Promise<boolean> => {
    if (realSceneGenerationEnabled) {
      setSaveState("saving");
      try {
        const shared = {
          title: next.title,
          language: next.language,
          duration_seconds: next.duration,
          visual_style: next.visualStyle,
          narration_style: next.narrationStyle,
          narration_enabled: next.narrationEnabled,
          captions_enabled: next.captionsEnabled,
          music_enabled: next.musicEnabled,
        };
        const patch =
          next.brief.mode === "historical-documentary"
            ? {
                ...shared,
                topic: next.brief.topic,
                source_notes: next.brief.sourceNotes.trim() || null,
                ...(next.toneChanged ? { tone: next.brief.tone } : {}),
                target_audience: next.brief.targetAudience,
                additional_direction: next.brief.additionalDirection,
                historical_accuracy_note: next.historicalAccuracyNote,
              }
            : next.brief.mode === "custom-video"
              ? {
                  ...shared,
                  topic: next.brief.prompt,
                  source_notes: next.brief.sourceNotes.trim() || null,
                  target_audience: next.brief.targetAudience,
                }
              : null;
        if (!patch) throw new Error("This project mode cannot be edited yet.");
        const updated = await updateProjectMutation.mutateAsync(patch);
        setProject(updated);
        setSaveState("saved");
        toast.success("Output settings updated");
        return true;
      } catch (error: unknown) {
        setSaveState("saved");
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update output settings.",
        );
        return false;
      }
    }
    setProject((prev) =>
      prev
        ? {
            ...prev,
            brief: next.brief,
            historicalAccuracyNote: next.historicalAccuracyNote,
            output: {
              ...prev.output,
              title: next.title,
              language: next.language,
              duration: next.duration,
              visualStyle: next.visualStyle,
              narrationStyle: next.narrationStyle,
              narrationEnabled: next.narrationEnabled,
              captionsEnabled: next.captionsEnabled,
              musicEnabled: next.musicEnabled,
            },
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
    markDirty();
    toast.success("Brief updated");
    return true;
  };

  const handleRenderChange = (nextRender: Render) => {
    setRender(nextRender);
    setProject((prev) =>
      prev ? { ...prev, status: "ready", generationProgress: 100, updatedAt: new Date().toISOString() } : prev
    );
  };

  const allScenesGenerated = scenes.length > 0 && completedCount === scenes.length;

  const handleStartRender = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStage("queued");
    try {
      if (realSceneGenerationEnabled) {
        const queued = await createFinalRender(project.id, {
          narration_enabled: project.output.narrationEnabled !== false,
          captions_enabled: project.output.captionsEnabled,
          music_enabled: project.output.musicEnabled,
        }, undefined, crypto.randomUUID());
        await refreshCredits();
        const completed = await pollPersistedJob(queued.id, {
          onUpdate: (job) => {
            setRenderProgress(job.progress);
            setRenderStage(job.current_stage);
          },
        });
        if (completed.status !== "completed") {
          throw new Error(
            completed.error_message ?? "Final video rendering failed.",
          );
        }
        const renderId =
          typeof completed.result_payload?.render_id === "string"
            ? completed.result_payload.render_id
            : typeof completed.input_payload.render_id === "string"
              ? completed.input_payload.render_id
              : null;
        if (!renderId) throw new Error("The completed render ID is missing.");
        const [persisted, previewUrl] = await Promise.all([
          getPersistedRender(renderId),
          getRenderPreviewUrl(renderId),
        ]);
        handleRenderChange(mapPersistedRender(persisted, previewUrl));
        toast.success(`Rendered v${persisted.version}`, {
          description: `${project.output.title} is ready to preview.`,
        });
        return;
      }
      const next = await renderFinalVideo({
        project,
        previousVersion: render?.version ?? 0,
        onProgress: setRenderProgress,
      });
      handleRenderChange(next);
      toast.success(`Rendered v${next.version}`, {
        description: `${project.output.title} is ready to share.`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Final rendering failed.",
      );
    } finally {
      if (realSceneGenerationEnabled) {
        await refreshCredits();
      }
      setIsRendering(false);
      setRenderStage(null);
    }
  };

  const renderEstimate = estimate({
    final_render: 1,
    tts_generation:
      project.output.narrationEnabled === false ? 0 : scenes.length,
    music_generation: project.output.musicEnabled ? 1 : 0,
  });

  const primaryActionFor = (): { label: string; onClick: () => void; disabled?: boolean; loading?: boolean } => {
    switch (activeTab) {
      case "brief":
        return { label: "Continue to Storyboard", onClick: () => setActiveTab("storyboard") };
      case "storyboard":
        return {
          label: "Continue to Generate",
          onClick: () => setActiveTab("generate"),
          disabled: scenes.length === 0,
        };
      case "generate":
        return {
          label: "Continue to Final Video",
          onClick: () => setActiveTab("final"),
          disabled: !allScenesGenerated,
        };
      case "final":
        return {
          label: `${render ? "Render New Version" : "Render Final Video"}${
            realSceneGenerationEnabled ? ` — estimated ${renderEstimate} credits` : ""
          }`,
          onClick: handleStartRender,
          disabled:
            !allScenesGenerated ||
            isRendering ||
            (realSceneGenerationEnabled && !canAfford(renderEstimate)),
          loading: isRendering,
        };
    }
  };

  const primaryAction = primaryActionFor();

  const handleDeleteProject = async () => {
    if (!project || deleteProjectMutation.isPending) return;
    try {
      await deleteProjectMutation.mutateAsync();
      toast.success("Project deleted", {
        description: `${project.output.title} was removed from your projects.`,
      });
      setDeleteOpen(false);
      router.replace("/projects");
      router.refresh();
    } catch (deleteError) {
      toast.error("Project could not be deleted", {
        description:
          deleteError instanceof Error
            ? deleteError.message
            : "Please try again.",
      });
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <ProjectHeader
        project={project}
        saveState={saveState}
        primaryAction={primaryAction}
        onDelete={() => setDeleteOpen(true)}
        deleting={deleteProjectMutation.isPending}
      />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WorkspaceTab)}>
          <TabsList className="mb-6">
            <TabsTrigger value="brief">1. Brief</TabsTrigger>
            <TabsTrigger value="storyboard">2. Storyboard</TabsTrigger>
            <TabsTrigger value="generate">3. Generate</TabsTrigger>
            <TabsTrigger value="final">4. Final Video</TabsTrigger>
          </TabsList>

          <TabsContent value="brief">
            <BriefSection
              brief={project.brief}
              output={project.output}
              historicalAccuracyNote={project.historicalAccuracyNote}
              onSave={handleBriefSave}
            />
          </TabsContent>

          <TabsContent value="storyboard">
            <StoryboardSection
              projectId={project.id}
              projectMode={project.mode}
              scenes={scenes}
              aspectRatio={project.output.aspectRatio}
              onScenesChange={handleStoryboardScenesChange}
              markDirty={markDirty}
              onRefreshProject={refreshPersistedProject}
            />
          </TabsContent>

          <TabsContent value="generate">
            <GenerationSection
              projectId={project.id}
              scenes={scenes}
              aspectRatio={project.output.aspectRatio}
              onScenesChange={handleStoryboardScenesChange}
              markDirty={markDirty}
              onGenerationStart={() =>
                setProject((prev) => (prev && prev.status !== "ready" ? { ...prev, status: "generating" } : prev))
              }
              onRefreshProject={refreshPersistedProject}
              regenerateInstructionPlaceholder={(sceneId) =>
                project.id === "majapahit" && sceneId === "majapahit-scene-3"
                  ? MAJAPAHIT_REGENERATION_EXAMPLE
                  : undefined
              }
            />
          </TabsContent>

          <TabsContent value="final">
            <FinalVideoSection
              project={project}
              scenesCompleted={completedCount}
              totalScenes={scenes.length}
              render={render}
              onRenderChange={handleRenderChange}
              isRendering={isRendering}
              renderProgress={renderProgress}
              renderStage={renderStage}
              onStartRender={handleStartRender}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) =>
          !deleteProjectMutation.isPending && setDeleteOpen(open)
        }
        title="Delete this project?"
        description={`“${project.output.title}” will be removed from your project list. This action cannot be undone from TaleMotion.`}
        confirmLabel={
          deleteProjectMutation.isPending ? "Deleting…" : "Delete project"
        }
        destructive
        onConfirm={() => void handleDeleteProject()}
      />
    </div>
  );
}
