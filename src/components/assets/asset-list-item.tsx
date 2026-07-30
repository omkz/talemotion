"use client";

import { cn } from "@/lib/utils";
import type { MediaLibraryAsset } from "@/types";
import {
  ASSET_TYPE_META,
  formatAssetDate,
  formatFileSize,
} from "./asset-display";
import { AssetActions } from "./asset-actions";
import { AssetPreview } from "./asset-preview";
import { AssetStatusBadge } from "./asset-status-badge";

interface AssetListItemProps {
  asset: MediaLibraryAsset;
  onPreview: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRetry: () => void;
  disabled?: boolean;
}

export function AssetListItem({
  asset,
  onPreview,
  onArchive,
  onRestore,
  onDelete,
  onRetry,
  disabled,
}: AssetListItemProps) {
  return (
    <div
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
        "group flex items-center gap-3 rounded-xl border border-border bg-card p-3 outline-none transition-colors hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50",
        asset.status === "archived" && "bg-card/60"
      )}
    >
      <AssetPreview asset={asset} size="list" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {asset.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {asset.projectTitle}
          {asset.sceneTitle ? ` · ${asset.sceneTitle}` : ""}
        </p>
      </div>

      <div className="hidden w-24 shrink-0 text-xs text-muted-foreground sm:block">
        {ASSET_TYPE_META[asset.type].label}
        <span className="mt-0.5 block">Version {asset.version}</span>
      </div>
      <div className="hidden w-20 shrink-0 text-xs text-muted-foreground md:block">
        {formatFileSize(asset.fileSizeBytes)}
      </div>
      <div className="hidden w-24 shrink-0 text-xs text-muted-foreground lg:block">
        {formatAssetDate(asset.createdAt)}
      </div>
      <AssetStatusBadge status={asset.status} className="hidden sm:inline-flex" />

      <div
        className="shrink-0"
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
  );
}
