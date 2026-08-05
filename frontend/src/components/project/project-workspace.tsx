"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
import { useCreateFinalRenderMutation } from "@/lib/queries/use-create-final-render-mutation";
import { useJobQuery } from "@/lib/queries/use-job-query";
import { useProjectJobsQuery } from "@/lib/queries/use-project-jobs-query";
import { jobQueryKeys } from "@/lib/queries/job-query-keys";
import { StoryboardSection } from "@/components/storyboard/storyboard-section";
import { GenerationSection } from "@/components/generation/generation-section";
import { FinalVideoSection } from "@/components/final-video/final-video-section";
import { MAJAPAHIT_REGENERATION_EXAMPLE } from "@/lib/mock-data";
import { getPersistedProject } from "@/lib/api/persisted-projects";
import {
  isPersistedJobActive,
  realSceneGenerationEnabled,
} from "@/lib/api/scene-generation-jobs";
import {
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
type ActiveRenderJobSource = "user" | "restored";

interface ActiveRenderJob {
  id: string;
  source: ActiveRenderJobSource;
}

function initialTabFor(project: VideoProject): WorkspaceTab {
  if (project.status === "draft") return "brief";
  if (project.status === "ready") return "final";
  if (project.status === "generating") return "generate";
  return "storyboard";
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { estimate, canAfford, refresh: refreshCredits } = useCredits();
  const projectQuery = useProjectQuery(projectId);
  const updateProjectMutation = useUpdateProjectMutation(projectId);
  const deleteProjectMutation = useDeleteProjectMutation(projectId);
  const createFinalRenderMutation = useCreateFinalRenderMutation(projectId);
  const [project, setProject] = useState<VideoProject | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("brief");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [render, setRender] = useState<Render | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeRenderJob, setActiveRenderJob] = useState<ActiveRenderJob | null>(null);
  const activeRenderJobId = activeRenderJob?.id ?? null;
  const [
    latestRenderRestoreSettledProjectId,
    setLatestRenderRestoreSettledProjectId,
  ] = useState<string | null>(null);
  const projectJobsQuery = useProjectJobsQuery(
    projectId,
    realSceneGenerationEnabled &&
      projectQuery.isSuccess &&
      projectQuery.data !== null,
  );
  const renderJobQuery = useJobQuery(
    realSceneGenerationEnabled ? activeRenderJobId : null,
  );
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);
  const initializedProjectIdRef = useRef<string | null>(null);
  const handledRenderJobIdRef = useRef<string | null>(null);
  const restoredRenderJobsProjectIdRef = useRef<string | null>(null);
  const renderJobsErrorProjectIdRef = useRef<string | null>(null);

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
  // so a background refetch never resets activeTab/render/local edits. This
  // only restores local project state, the initial tab, and the latest
  // *completed* render preview — active/failed job restoration is handled by
  // a separate effect below, gated on this one having settled first (see
  // latestRenderRestoreSettledProjectId) to avoid a slower preview response
  // overwriting a render that already completed during restoration.
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
        void getLatestProjectRender(projectId)
          .then((latest) => {
            if (!cancelled) setRender(latest);
          })
          .catch((error: unknown) => {
            if (!cancelled) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not restore the latest video preview.",
              );
            }
          })
          .finally(() => {
            if (!cancelled) {
              setLatestRenderRestoreSettledProjectId(projectId);
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

  // Restore an active/failed render job exactly once per project, once the
  // latest-preview restoration above has settled and the project jobs list
  // has loaded. Seeds the job-detail cache so useJobQuery takes over polling
  // immediately without an extra redundant getPersistedJob call.
  useEffect(() => {
    if (!realSceneGenerationEnabled) return;
    if (!project || project.id !== projectId) return;
    if (latestRenderRestoreSettledProjectId !== projectId) return;
    if (!projectJobsQuery.data) return;
    if (restoredRenderJobsProjectIdRef.current === projectId) return;
    restoredRenderJobsProjectIdRef.current = projectId;

    const jobs = projectJobsQuery.data;
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (cancelled) return;
      const activeRender = jobs.find(
        (job) => job.type === "render" && isPersistedJobActive(job.status),
      );
      if (activeRender) {
        queryClient.setQueryData(
          jobQueryKeys.detail(activeRender.id),
          activeRender,
        );
        setActiveTab("final");
        setIsRendering(true);
        setRenderProgress(activeRender.progress);
        setRenderStage(activeRender.current_stage ?? activeRender.status);
        setActiveRenderJob({ id: activeRender.id, source: "restored" });
        return;
      }

      const failedRender = jobs.find(
        (job) =>
          job.type === "render" &&
          (job.status === "failed" || job.status === "cancelled"),
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
    });

    return () => {
      cancelled = true;
    };
  }, [
    project,
    projectId,
    latestRenderRestoreSettledProjectId,
    projectJobsQuery.data,
    queryClient,
  ]);

  // Show one restoration-error toast per project if the initial project-jobs
  // request fails; a later successful refetch still lets restoration above
  // proceed normally (it only bails while projectJobsQuery.data is absent).
  useEffect(() => {
    if (!realSceneGenerationEnabled) return;
    if (!project || project.id !== projectId) return;
    if (!projectJobsQuery.isError) return;
    if (renderJobsErrorProjectIdRef.current === projectId) return;
    renderJobsErrorProjectIdRef.current = projectId;
    toast.error(
      projectJobsQuery.error instanceof Error
        ? projectJobsQuery.error.message
        : "Could not restore render state.",
    );
  }, [project, projectId, projectJobsQuery.isError, projectJobsQuery.error]);

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

  const handleRenderChange = (nextRender: Render) => {
    setRender(nextRender);
    setProject((prev) =>
      prev ? { ...prev, status: "ready", generationProgress: 100, updatedAt: new Date().toISOString() } : prev
    );
  };

  // Mirror progress/stage from the active render job's polled data. Guarded
  // by job id so a stale or previously-completed job can never update the
  // current render UI, and left alone entirely while the query is merely
  // recovering from a transient polling error (no isRendering/toast here).
  useEffect(() => {
    const job = renderJobQuery.data;
    if (!job || job.id !== activeRenderJobId) return;
    void Promise.resolve().then(() => {
      setRenderProgress(job.progress);
      setRenderStage(job.current_stage ?? job.status);
    });
  }, [renderJobQuery.data, activeRenderJobId]);

  // Clear the terminal-processing guard whenever a fresh render job becomes
  // active, so the new job's terminal status is never mistaken for already
  // handled. (Job ids are unique per render anyway, but this keeps the
  // guard explicit rather than relying on that alone.)
  useEffect(() => {
    if (activeRenderJobId) {
      handledRenderJobIdRef.current = null;
    }
  }, [activeRenderJobId]);

  // Process the active render job's terminal outcome exactly once, even
  // across rerenders/extra cache notifications, via handledRenderJobIdRef.
  // A restored job (found already in progress on page load) never produces
  // a "Rendered v…" toast or a credits refresh — the user didn't initiate it
  // in this session — while a user-triggered job keeps that feedback.
  useEffect(() => {
    const job = renderJobQuery.data;
    if (!job || job.id !== activeRenderJobId) return;
    if (isPersistedJobActive(job.status)) return;
    if (handledRenderJobIdRef.current === job.id) return;
    handledRenderJobIdRef.current = job.id;

    const source = activeRenderJob?.source ?? "user";
    let cancelled = false;

    void (async () => {
      try {
        if (job.status === "completed") {
          const renderId =
            typeof job.result_payload?.render_id === "string"
              ? job.result_payload.render_id
              : typeof job.input_payload.render_id === "string"
                ? job.input_payload.render_id
                : null;
          if (!renderId) throw new Error("The completed render ID is missing.");
          const [persisted, previewUrl] = await Promise.all([
            getPersistedRender(renderId),
            getRenderPreviewUrl(renderId),
          ]);
          if (cancelled) return;
          handleRenderChange(mapPersistedRender(persisted, previewUrl));
          if (source === "user") {
            toast.success(`Rendered v${persisted.version}`, {
              description: `${project?.output.title ?? "Your video"} is ready to preview.`,
            });
          }
        } else {
          toast.error(job.error_message ?? "Final video rendering failed.");
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Final rendering failed.",
        );
      } finally {
        if (!cancelled) {
          if (source === "user") {
            await refreshCredits();
          }
          setIsRendering(false);
          setRenderStage(null);
          setActiveRenderJob((current) =>
            current?.id === job.id ? null : current,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    renderJobQuery.data,
    activeRenderJobId,
    activeRenderJob?.source,
    project?.output.title,
    refreshCredits,
  ]);

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

  const allScenesGenerated = scenes.length > 0 && completedCount === scenes.length;

  const handleStartRender = async () => {
    if (
      isRendering ||
      createFinalRenderMutation.isPending ||
      activeRenderJob !== null
    ) {
      return;
    }
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStage("queued");

    if (realSceneGenerationEnabled) {
      try {
        const queued = await createFinalRenderMutation.mutateAsync({
          narration_enabled: project.output.narrationEnabled !== false,
          captions_enabled: project.output.captionsEnabled,
          music_enabled: project.output.musicEnabled,
        });
        setActiveRenderJob({ id: queued.id, source: "user" });
        setRenderProgress(queued.progress);
        setRenderStage(queued.current_stage ?? queued.status);
        await refreshCredits();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Final rendering failed.",
        );
        await refreshCredits();
        setIsRendering(false);
        setRenderStage(null);
      }
      return;
    }

    try {
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
        onOpenChange={setDeleteOpen}
        title="Delete this project?"
        description={`“${project.output.title}” will be removed from your project list. This action cannot be undone from TaleMotion.`}
        confirmLabel={
          deleteProjectMutation.isPending ? "Deleting…" : "Delete project"
        }
        destructive
        pending={deleteProjectMutation.isPending}
        onConfirm={() => void handleDeleteProject()}
      />
    </div>
  );
}
