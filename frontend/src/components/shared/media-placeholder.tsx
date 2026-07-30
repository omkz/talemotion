import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MediaPlaceholderProps {
  aspectRatio?: "9:16" | "16:9" | "1:1";
  icon?: LucideIcon;
  label?: string;
  className?: string;
}

const ASPECT_CLASS: Record<NonNullable<MediaPlaceholderProps["aspectRatio"]>, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1:1": "aspect-square",
};

/** Neutral stand-in for a generated image/video/thumbnail — no real media in this prototype. */
export function MediaPlaceholder({
  aspectRatio = "16:9",
  icon: Icon = Clapperboard,
  label,
  className,
}: MediaPlaceholderProps) {
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/60",
        ASPECT_CLASS[aspectRatio],
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklch,var(--foreground),transparent_94%),transparent_65%)]" />
      <div className="relative flex flex-col items-center gap-2 text-muted-foreground">
        <Icon className="size-7 opacity-60" strokeWidth={1.5} />
        {label && <span className="px-3 text-center text-xs opacity-70">{label}</span>}
      </div>
    </div>
  );
}
