"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { MediaPlaceholder } from "@/components/shared/media-placeholder";
import type { AspectRatio } from "@/types";

interface VideoPlayerPlaceholderProps {
  aspectRatio: AspectRatio;
  durationSeconds: number;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayerPlaceholder({ aspectRatio, durationSeconds }: VideoPlayerPlaceholderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const elapsed = isPlaying ? Math.round(durationSeconds * 0.38) : 0;

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="relative overflow-hidden rounded-xl">
        <MediaPlaceholder aspectRatio={aspectRatio} className="rounded-xl" />
        <button
          type="button"
          onClick={() => setIsPlaying((v) => !v)}
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
          className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md">
            {isPlaying ? (
              <Pause className="size-6 fill-current" />
            ) : (
              <Play className="size-6 fill-current" />
            )}
          </span>
        </button>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white/90 transition-[width]"
              style={{ width: isPlaying ? "38%" : "0%" }}
            />
          </div>
          <span className="text-[11px] text-white/80">
            {formatTimestamp(elapsed)} / {formatTimestamp(durationSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
}
