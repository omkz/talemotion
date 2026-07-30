"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileWarning } from "lucide-react";
import { getProject, renderFinalVideo } from "@/lib/mock-api";
import { buildInitialRender } from "@/lib/mock-api/render";
import { replaceProject } from "@/lib/mock-api/projects";
import { StoryboardSection } from "@/components/storyboard/storyboard-section";
import { GenerationSection } from "@/components/generation/generation-section";
import { FinalVideoSection } from "@/components/final-video/final-video-section";
import { MAJAPAHIT_REGENERATION_EXAMPLE } from "@/lib/mock-data";
import type { ModeBrief, Render, Scene, VideoProject } from "@/types";
import { BriefSection } from "./brief-section";
import { ProjectHeader, type SaveState } from "./project-header";

type WorkspaceTab = "brief" | "storyboard" | "generate" | "final";

function initialTabFor(project: VideoProject): WorkspaceTab {
  if (project.status === "draft") return "brief";
  if (project.status === "ready") return "final";
  if (project.status === "generating") return "generate";
  return "storyboard";
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("brief");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [render, setRender] = useState<Render | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getProject(projectId).then((data) => {
      if (cancelled) return;
      if (!data) {
        setNotFound(true);
        return;
      }
      setProject(data);
      setRender(buildInitialRender(data));
      setActiveTab(initialTabFor(data));
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
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

  const handleBriefSave = (next: {
    brief: ModeBrief;
    visualStyle: string;
    narrationStyle: string;
    captionsEnabled: boolean;
    musicEnabled: boolean;
    historicalAccuracyNote: string | null;
  }) => {
    setProject((prev) =>
      prev
        ? {
            ...prev,
            brief: next.brief,
            historicalAccuracyNote: next.historicalAccuracyNote,
            output: {
              ...prev.output,
              visualStyle: next.visualStyle,
              narrationStyle: next.narrationStyle,
              captionsEnabled: next.captionsEnabled,
              musicEnabled: next.musicEnabled,
            },
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
    markDirty();
    toast.success("Brief updated");
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
    } finally {
      setIsRendering(false);
    }
  };

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
          label: render ? "Render New Version" : "Render Final Video",
          onClick: handleStartRender,
          disabled: !allScenesGenerated || isRendering,
          loading: isRendering,
        };
    }
  };

  const primaryAction = primaryActionFor();

  return (
    <div className="flex min-h-full flex-col">
      <ProjectHeader project={project} saveState={saveState} primaryAction={primaryAction} />

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
              scenes={scenes}
              aspectRatio={project.output.aspectRatio}
              onScenesChange={handleStoryboardScenesChange}
              markDirty={markDirty}
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
              onStartRender={handleStartRender}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
