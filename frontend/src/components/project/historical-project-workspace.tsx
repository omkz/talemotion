"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { pollJob } from "@/lib/api/poll-job";
import { videoProjectApi } from "@/lib/api/provider";
import type { GenerationJob, Render, Scene, VideoProject } from "@/types";
import { ProjectHeader } from "./project-header";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The API request failed.";
}

function activeAsset(scene: Scene) {
  return scene.versions.find(
    (version) => version.version === scene.activeVersion
  )?.asset;
}

export function HistoricalProjectWorkspace({
  projectId,
}: {
  projectId: string;
}) {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [render, setRender] = useState<Render | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [jobs, setJobs] = useState<Record<string, GenerationJob>>({});
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [regenerateScene, setRegenerateScene] = useState<Scene | null>(null);
  const [instruction, setInstruction] = useState("");

  const refreshProject = useCallback(async () => {
    const next = await videoProjectApi.getProject(projectId);
    if (!next) {
      setNotFound(true);
      return null;
    }
    setProject(next);
    const assets = next.chapters.flatMap((chapter) =>
      chapter.scenes
        .map(activeAsset)
        .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
    );
    const previews = await Promise.all(
      assets.map(async (asset) => {
        try {
          return [
            asset.id,
            await videoProjectApi.getAssetPreviewUrl(asset.id),
          ] as const;
        } catch {
          return null;
        }
      })
    );
    setPreviewUrls((current) => ({
      ...current,
      ...Object.fromEntries(previews.filter((item) => item !== null)),
    }));
    if (next.status === "ready") {
      const renders = await videoProjectApi.listProjectRenders(projectId);
      setRender(renders[0] ?? null);
    }
    return next;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      refreshProject().catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refreshProject]);

  const runJob = async (
    key: string,
    create: () => Promise<GenerationJob>
  ) => {
    setBusyAction(key);
    setError(null);
    try {
      const queued = await create();
      setJobs((current) => ({ ...current, [key]: queued }));
      const completed = await pollJob({
        api: videoProjectApi,
        jobId: queued.id,
        onUpdate: (job) =>
          setJobs((current) => ({ ...current, [key]: job })),
      });
      if (completed.stage === "failed") {
        throw new Error(completed.errorMessage ?? "Generation failed.");
      }
      await refreshProject();
      return completed;
    } catch (requestError) {
      const message = errorMessage(requestError);
      setError(message);
      toast.error("Generation failed", { description: message });
      return null;
    } finally {
      setBusyAction(null);
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <EmptyState
          icon={FileWarning}
          title="Project not found"
          description="The backend did not return this project."
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
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-72 w-full" />
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const scenes = project.chapters[0]?.scenes ?? [];
  const completedCount = scenes.filter(
    (scene) => scene.status === "completed"
  ).length;
  const allReady = scenes.length === 4 && completedCount === 4;

  const generateAll = async () => {
    setBusyAction("all-scenes");
    setError(null);
    try {
      const pending = scenes.filter((scene) => scene.status !== "completed");
      for (const scene of pending) {
        const key = `scene-${scene.id}`;
        const queued = await videoProjectApi.generateScene(scene.id, {
          stages: ["image"],
        });
        const completed = await pollJob({
          api: videoProjectApi,
          jobId: queued.id,
          onUpdate: (job) =>
            setJobs((current) => ({ ...current, [key]: job })),
        });
        if (completed.stage === "failed") {
          throw new Error(
            completed.errorMessage ?? `Scene ${scene.position} failed.`
          );
        }
        await refreshProject();
      }
      toast.success("All four scene images are stored in Backblaze B2");
    } catch (requestError) {
      const message = errorMessage(requestError);
      setError(message);
      toast.error("Scene generation stopped", { description: message });
    } finally {
      setBusyAction(null);
    }
  };

  const submitRegeneration = async () => {
    if (!regenerateScene || !instruction.trim()) return;
    const scene = regenerateScene;
    try {
      const completed = await runJob(`scene-${scene.id}`, () =>
        videoProjectApi.regenerateScene(scene.id, instruction.trim())
      );
      if (!completed) return;
      toast.success(`Scene ${scene.position} now has a new active version`);
      setRegenerateScene(null);
      setInstruction("");
    } catch {
      // The shared job runner displays the actionable API error.
    }
  };

  const startRender = async () => {
    try {
      const completed = await runJob("render", () =>
        videoProjectApi.createRender(project.id, {
          captionsEnabled: true,
          backgroundMusicEnabled: false,
          resolution: "1080x1920",
        })
      );
      if (!completed) return;
      const renders = await videoProjectApi.listProjectRenders(project.id);
      setRender(renders[0] ?? null);
      toast.success("Final MP4 rendered and stored in Backblaze B2");
    } catch {
      // The shared job runner displays the actionable API error.
    }
  };

  const storyboardJob = jobs.storyboard;
  const renderJob = jobs.render;
  const overallSceneProgress = scenes.length
    ? Math.round(
        scenes.reduce((total, scene) => {
          if (scene.status === "completed") return total + 100;
          return total + (jobs[`scene-${scene.id}`]?.progress ?? 0);
        }, 0) / scenes.length
      )
    : 0;

  return (
    <div className="flex min-h-full flex-col">
      <ProjectHeader
        project={project}
        saveState="saved"
        primaryAction={{
          label: allReady ? "Render Final Video" : "Generate Scene Media",
          onClick: allReady ? startRender : generateAll,
          disabled: busyAction !== null,
          loading: busyAction !== null,
        }}
      />

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div
            role="alert"
            className="mb-5 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/8 p-4 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Backend request failed</p>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        )}

        <Tabs defaultValue={scenes.length ? "storyboard" : "brief"}>
          <TabsList className="mb-6">
            <TabsTrigger value="brief">1. Brief</TabsTrigger>
            <TabsTrigger value="storyboard">2. Storyboard</TabsTrigger>
            <TabsTrigger value="generate">3. Generate</TabsTrigger>
            <TabsTrigger value="final">4. Final Video</TabsTrigger>
          </TabsList>

          <TabsContent value="brief">
            <Card className="space-y-5 p-5 sm:p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-accent">
                  Historical Documentary · Real backend
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {project.brief.mode === "historical-documentary"
                    ? project.brief.topic
                    : project.output.title}
                </h2>
              </div>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Format</p>
                  <p>English · {project.output.duration}s · 9:16 · 4 scenes</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pipeline</p>
                  <p>Genblaze · Backblaze B2 · FFmpeg</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Provider outputs remain generated media; provenance metadata does
                not establish historical truth or accuracy.
              </p>
            </Card>
          </TabsContent>

          <TabsContent value="storyboard" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Generated storyboard</h2>
                <p className="text-sm text-muted-foreground">
                  Exactly four structured scenes persisted in PostgreSQL.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  runJob("storyboard", () =>
                    videoProjectApi.generateStoryboard(project.id, {
                      sceneCount: 4,
                      additionalInstruction:
                        "Create a fresh four-scene version while preserving historical caution.",
                    })
                  ).then((completed) => {
                    if (completed) toast.success("Storyboard regenerated");
                  })
                }
                disabled={busyAction !== null}
              >
                {busyAction === "storyboard" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Regenerate Storyboard
              </Button>
            </div>
            {storyboardJob && busyAction === "storyboard" && (
              <Progress value={storyboardJob.progress} />
            )}
            {scenes.map((scene) => (
              <Card key={scene.id} className="p-4 sm:p-5">
                <div className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/12 text-sm font-semibold text-accent">
                    {scene.position}
                  </span>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{scene.title}</h3>
                      <span className="text-xs text-muted-foreground">
                        {scene.durationSeconds}s
                      </span>
                    </div>
                    <p className="text-sm text-foreground/85">{scene.narration}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {scene.visualPrompt}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="generate" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Scene media</h2>
                <p className="text-sm text-muted-foreground">
                  {completedCount} of 4 active assets stored.
                </p>
              </div>
              <Button onClick={generateAll} disabled={busyAction !== null}>
                {busyAction === "all-scenes" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Generate All Scenes
              </Button>
            </div>
            {busyAction === "all-scenes" && (
              <div className="space-y-2">
                <Progress value={overallSceneProgress} />
                <p className="text-xs text-muted-foreground">
                  {overallSceneProgress}% · jobs are running through the media
                  queue
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {scenes.map((scene) => {
                const asset = activeAsset(scene);
                const preview = asset ? previewUrls[asset.id] : undefined;
                const job = jobs[`scene-${scene.id}`];
                return (
                  <Card key={scene.id} className="overflow-hidden">
                    <div className="relative aspect-[9/16] max-h-[420px] bg-muted">
                      {preview ? (
                        <Image
                          src={preview}
                          alt={`Generated media for ${scene.title}`}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          {job && job.stage !== "failed" ? (
                            <Loader2 className="size-6 animate-spin" />
                          ) : (
                            <Play className="size-7" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{scene.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset
                              ? `v${scene.activeVersion} · ${asset.provider} · B2`
                              : "Not generated"}
                          </p>
                        </div>
                        {scene.status === "completed" && (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        )}
                      </div>
                      {job && job.stage !== "completed" && (
                        <Progress value={job.progress} className="h-1.5" />
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            runJob(`scene-${scene.id}`, () =>
                              videoProjectApi.generateScene(scene.id, {
                                stages: ["image"],
                              })
                            )
                          }
                          disabled={busyAction !== null}
                        >
                          {asset ? "Generate again" : "Generate"}
                        </Button>
                        {asset && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRegenerateScene(scene);
                              setInstruction("");
                            }}
                          >
                            Regenerate with note
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="final" className="space-y-5">
            <div>
              <h2 className="font-semibold">Final video</h2>
              <p className="text-sm text-muted-foreground">
                Narration, burned captions, and scene media are assembled by
                FFmpeg in the rendering worker.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
              <Card className="overflow-hidden p-3">
                {render?.shareUrl ? (
                  <video
                    controls
                    preload="metadata"
                    src={render.shareUrl}
                    className="aspect-[9/16] w-full rounded-lg bg-black"
                  >
                    Your browser does not support video playback.
                  </video>
                ) : (
                  <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Play className="size-9" />
                  </div>
                )}
              </Card>
              <Card className="space-y-5 p-5">
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p>{render?.status ?? "Not rendered"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Output</p>
                    <p>1080x1920 · H.264 MP4</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Version</p>
                    <p>{render ? `v${render.version}` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Storage</p>
                    <p>Backblaze B2</p>
                  </div>
                </div>
                {renderJob && busyAction === "render" && (
                  <Progress value={renderJob.progress} />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={startRender}
                    disabled={!allReady || busyAction !== null}
                  >
                    {busyAction === "render" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {render ? "Render New Version" : "Render Final Video"}
                  </Button>
                  {render?.shareUrl && (
                    <Button asChild variant="outline">
                      <a href={render.shareUrl} target="_blank" rel="noreferrer">
                        <Download className="size-4" />
                        Open signed video
                      </a>
                    </Button>
                  )}
                </div>
                {!allReady && (
                  <p className="text-xs text-muted-foreground">
                    Generate one active asset for every scene before rendering.
                  </p>
                )}
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={regenerateScene !== null}
        onOpenChange={(open) => !open && setRegenerateScene(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate scene {regenerateScene?.position}</DialogTitle>
            <DialogDescription>
              The previous B2 object remains stored. A successful run creates the
              next asset version and makes it active.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Additional regeneration instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Use larger Southeast Asian ships and avoid European-style vessels."
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRegenerateScene(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitRegeneration}
              disabled={!instruction.trim() || busyAction !== null}
            >
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
