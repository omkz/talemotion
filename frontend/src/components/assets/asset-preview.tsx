import { Play, Volume2 } from "lucide-react";
import { MediaPlaceholder } from "@/components/shared/media-placeholder";
import { cn } from "@/lib/utils";
import type { MediaLibraryAsset } from "@/types";
import { ASSET_TYPE_META } from "./asset-display";

interface AssetPreviewProps {
  asset: MediaLibraryAsset;
  size?: "card" | "list" | "detail";
  className?: string;
}

export function AssetPreview({
  asset,
  size = "card",
  className,
}: AssetPreviewProps) {
  const meta = ASSET_TYPE_META[asset.type];
  const isPlayable =
    asset.type === "audio" ||
    asset.type === "video" ||
    asset.type === "final-render";
  const isPortrait =
    Boolean(asset.width && asset.height && asset.height > asset.width);

  if (size === "list") {
    return (
      <div
        className={cn(
          "relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/60 text-muted-foreground",
          asset.status === "archived" && "opacity-60",
          className
        )}
      >
        <meta.icon className="size-5 opacity-70" strokeWidth={1.5} />
        {isPlayable && (
          <span className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full bg-background/80 text-foreground">
            <Play className="size-2.5 fill-current" />
          </span>
        )}
      </div>
    );
  }

  const detail = size === "detail";
  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden bg-black/20",
        detail ? "aspect-video rounded-xl border border-border" : "aspect-[4/3]",
        asset.status === "archived" && "opacity-65 saturate-50",
        className
      )}
    >
      <MediaPlaceholder
        icon={meta.icon}
        label={
          asset.type === "subtitle"
            ? "SRT subtitle document"
            : asset.type === "audio"
              ? "Simulated audio waveform"
              : `${meta.label} preview`
        }
        className={cn(
          "h-full rounded-none border-0",
          isPortrait && asset.type !== "audio" && asset.type !== "subtitle"
            ? "w-auto aspect-[9/16] border-x border-border"
            : "w-full aspect-auto",
          detail && isPortrait && "h-[88%] rounded-lg border border-border"
        )}
      />

      {asset.type === "audio" && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1">
          {[10, 18, 26, 14, 22, 30, 16, 24, 12].map((height, index) => (
            <span
              key={`${height}-${index}`}
              className="w-0.5 rounded-full bg-foreground/20"
              style={{ height }}
            />
          ))}
        </div>
      )}

      {isPlayable && (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full border border-white/10 bg-black/55 text-white shadow-sm",
            detail ? "size-12" : "size-9"
          )}
          aria-hidden="true"
        >
          {asset.type === "audio" ? (
            <Volume2 className={detail ? "size-5" : "size-4"} />
          ) : (
            <Play
              className={cn(
                "fill-current",
                detail ? "size-5" : "size-4"
              )}
            />
          )}
        </span>
      )}

      {asset.status === "generating" && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-muted">
          <div className="h-full w-2/3 animate-pulse bg-accent" />
        </div>
      )}
    </div>
  );
}
