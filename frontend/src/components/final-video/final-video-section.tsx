"use client";

import { useState } from "react";
import { Download, Image as ImageIcon, Link as LinkIcon, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SettingChip } from "@/components/shared/setting-chip";
import { useCredits } from "@/components/credits/credits-provider";
import { generateThumbnail } from "@/lib/mock-api";
import { realSceneGenerationEnabled } from "@/lib/api/scene-generation-jobs";
import type { Render, VideoProject } from "@/types";
import { ProductionSummary } from "./production-summary";
import { VideoPlayerPlaceholder } from "./video-player-placeholder";

interface FinalVideoSectionProps {
  project: VideoProject;
  scenesCompleted: number;
  totalScenes: number;
  render: Render | null;
  onRenderChange: (render: Render) => void;
  isRendering: boolean;
  renderProgress: number;
  renderStage?: string | null;
  onStartRender: () => void;
  /** True while initial render-state restoration hasn't finished yet. */
  renderStartDisabled?: boolean;
}

export function FinalVideoSection({
  project,
  scenesCompleted,
  totalScenes,
  render,
  onRenderChange,
  isRendering,
  renderProgress,
  renderStage,
  onStartRender,
  renderStartDisabled = false,
}: FinalVideoSectionProps) {
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const { credits, estimate, canAfford } = useCredits();

  const allScenesReady = scenesCompleted === totalScenes && totalScenes > 0;
  const renderEstimate = estimate({
    final_render: 1,
    tts_generation: project.output.narrationEnabled !== false ? totalScenes : 0,
    music_generation: project.output.musicEnabled ? 1 : 0,
  });
  const insufficientCredits =
    realSceneGenerationEnabled && !canAfford(renderEstimate);

  const handleGenerateThumbnail = async () => {
    if (!render) return;
    setIsGeneratingThumbnail(true);
    try {
      const next = await generateThumbnail(render);
      onRenderChange(next);
      toast.success("Thumbnail generated");
    } finally {
      setIsGeneratingThumbnail(false);
    }
  };

  const handleCopyLink = async () => {
    if (!render?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(render.shareUrl);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const handleDownload = () => {
    if (!render) return;
    if (realSceneGenerationEnabled && render.shareUrl) {
      window.open(render.shareUrl, "_blank", "noopener,noreferrer");
      return;
    }
    toast("Download started", {
      description: "This is a simulated download — no real file is generated in this prototype.",
    });
  };

  const summaryItems = [
    { label: `${totalScenes} scenes`, done: true },
    { label: `${project.output.duration} seconds`, done: true },
    {
      label: `${project.output.language} narration`,
      done: project.output.narrationEnabled !== false,
    },
    { label: "Captions included", done: project.output.captionsEnabled },
    { label: `${scenesCompleted} of ${totalScenes} scene assets stored`, done: allScenesReady },
    { label: "Provenance manifest created", done: allScenesReady },
    { label: "Final video stored in Backblaze B2", done: render !== null },
    { label: "Render pipeline completed", done: render !== null },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Final Video</h2>
        <p className="text-sm text-muted-foreground">
          Review the assembled cut, then render and share the final export.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Card className="items-center p-5">
          <VideoPlayerPlaceholder
            aspectRatio={project.output.aspectRatio}
            durationSeconds={project.output.duration}
            sourceUrl={render?.shareUrl}
          />
        </Card>

        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Render details</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <SettingChip label="Render version" value={render ? `v${render.version}` : "Not rendered"} />
              <SettingChip label="Resolution" value={render?.resolution ?? "—"} />
              <SettingChip label="Duration" value={`${project.output.duration}s`} />
              <SettingChip label="File size" value={render ? `${render.fileSizeMb} MB` : "—"} />
              <SettingChip label="Captions" value={render?.captionsBurned ? "Burned in" : "Off"} />
              <SettingChip
                label="Narration"
                value={render?.narrationIncluded ? "Included" : "Off"}
              />
              <SettingChip label="Music" value={render?.musicIncluded ? "Included" : "Off"} />
              <SettingChip
                label="Render status"
                value={
                  isRendering
                    ? "Rendering"
                    : render
                      ? "Rendered"
                      : "Not started"
                }
              />
            </div>

            {isRendering && (
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {renderStage
                      ? renderStage.replaceAll("_", " ")
                      : "Rendering final video…"}
                  </span>
                  <span>{renderProgress}%</span>
                </div>
                <Progress value={renderProgress} className="h-1.5" />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                onClick={onStartRender}
                disabled={
                  renderStartDisabled ||
                  isRendering ||
                  !allScenesReady ||
                  insufficientCredits
                }
                title={
                  renderStartDisabled
                    ? "Restoring render state…"
                    : insufficientCredits
                      ? `Requires ${renderEstimate} credits; ${credits?.available ?? 0} available`
                      : undefined
                }
              >
                {isRendering ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {render ? "Render New Version" : "Render Final Video"}
                <span className="text-[10px] opacity-70">
                  · est. {renderEstimate}
                </span>
              </Button>
              {!realSceneGenerationEnabled && (
                <Button
                  variant="outline"
                  onClick={handleGenerateThumbnail}
                  disabled={!render || isGeneratingThumbnail}
                >
                  {isGeneratingThumbnail ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                  Generate Thumbnail
                </Button>
              )}
              <Button variant="outline" onClick={handleCopyLink} disabled={!render}>
                <LinkIcon className="size-4" />
                Copy Share Link
              </Button>
              <Button variant="outline" onClick={handleDownload} disabled={!render}>
                <Download className="size-4" />
                Download Video
              </Button>
            </div>

            {!allScenesReady && (
              <p className="mt-3 text-xs text-muted-foreground">
                Finish generating all scenes in the Generate tab before rendering the final video.
              </p>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 text-sm font-semibold text-foreground">Production summary</h3>
            <ProductionSummary items={summaryItems} />
          </Card>
        </div>
      </div>
    </div>
  );
}
