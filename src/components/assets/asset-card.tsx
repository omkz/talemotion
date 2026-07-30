"use client";

import { Clock3, Layers3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MediaLibraryAsset } from "@/types";
import {
  ASSET_TYPE_META,
  formatAssetDate,
  formatDuration,
  formatFileSize,
  getResolution,
} from "./asset-display";
import { AssetActions } from "./asset-actions";
import { AssetPreview } from "./asset-preview";
import { AssetStatusBadge } from "./asset-status-badge";

interface AssetCardProps {
  asset: MediaLibraryAsset;
  onPreview: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRetry: () => void;
  disabled?: boolean;
}

export function AssetCard({
  asset,
  onPreview,
  onArchive,
  onRestore,
  onDelete,
  onRetry,
  disabled,
}: AssetCardProps) {
  const typeMeta = ASSET_TYPE_META[asset.type];
  const duration = formatDuration(asset.durationSeconds);
  const resolution = getResolution(asset);

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`View details for ${asset.name}`}
      onClick={onPreview}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview();
        }
      }}
      className={cn(
        "group gap-0 overflow-hidden py-0 outline-none transition-colors hover:ring-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50",
        asset.status === "archived" && "bg-card/60"
      )}
    >
      <div className="relative overflow-hidden border-b border-border">
        <AssetPreview asset={asset} />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[11px] font-medium text-white">
            <typeMeta.icon className="size-3" />
            {typeMeta.label}
          </span>
        </div>
        <div className="absolute right-3 top-3">
          <AssetStatusBadge status={asset.status} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {asset.name}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {asset.projectTitle}
            </p>
            {asset.sceneTitle && (
              <p className="truncate text-xs text-muted-foreground/75">
                {asset.sceneTitle}
              </p>
            )}
          </div>
          <div
            className="-mr-1 -mt-1 shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            <AssetActions
              asset={asset}
              onPreview={onPreview}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
              onRetry={onRetry}
              disabled={disabled}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Layers3 className="size-3" />
            v{asset.version}
          </span>
          {duration && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="size-3" />
              {duration}
            </span>
          )}
          {resolution && <span>{resolution}</span>}
          <span>{formatFileSize(asset.fileSizeBytes)}</span>
          <span>{formatAssetDate(asset.createdAt)}</span>
        </div>
      </div>
    </Card>
  );
}
