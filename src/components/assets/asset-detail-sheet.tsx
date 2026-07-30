"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { MediaLibraryAsset } from "@/types";
import {
  ASSET_TYPE_META,
  formatAssetDateTime,
  formatDuration,
  formatFileSize,
  getAspectRatio,
  getResolution,
} from "./asset-display";
import { AssetActions } from "./asset-actions";
import { AssetPreview } from "./asset-preview";
import { AssetStatusBadge } from "./asset-status-badge";

interface AssetDetailSheetProps {
  asset: MediaLibraryAsset | null;
  onOpenChange: (open: boolean) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRetry: () => void;
  disabled?: boolean;
}

function MetadataRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-1.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right text-foreground",
          mono && "font-mono text-[11px]"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function MetadataSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" />
        {title}
      </h3>
      <dl className="rounded-lg border border-border bg-muted/20 px-3 py-2">
        {children}
      </dl>
    </section>
  );
}

export function AssetDetailSheet({
  asset,
  onOpenChange,
  onArchive,
  onRestore,
  onDelete,
  onRetry,
  disabled,
}: AssetDetailSheetProps) {
  if (!asset) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const duration = formatDuration(asset.durationSeconds);
  const resolution = getResolution(asset);
  const ratio = getAspectRatio(asset);
  const typeLabel = ASSET_TYPE_META[asset.type].label;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 py-4 pr-14">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <AssetStatusBadge status={asset.status} />
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              <FlaskConical className="size-3" />
              Simulated integration
            </span>
          </div>
          <SheetTitle className="line-clamp-2">{asset.name}</SheetTitle>
          <SheetDescription>
            {asset.projectTitle}
            {asset.sceneTitle ? ` · ${asset.sceneTitle}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <AssetPreview asset={asset} size="detail" />
          <p className="text-center text-xs text-muted-foreground">
            Preview controls and media playback are simulated.
          </p>

          <MetadataSection icon={FileCheck2} title="General">
            <MetadataRow label="Asset type" value={typeLabel} />
            <MetadataRow label="MIME type" value={asset.mimeType} mono />
            <MetadataRow label="Version" value={`v${asset.version}`} />
            <MetadataRow label="Status" value={asset.status} />
            <MetadataRow
              label="Created"
              value={formatAssetDateTime(asset.createdAt)}
            />
            <MetadataRow
              label="Updated"
              value={formatAssetDateTime(asset.updatedAt)}
            />
          </MetadataSection>

          {(resolution || duration) && (
            <MetadataSection icon={HardDrive} title="Media">
              {resolution && (
                <MetadataRow label="Resolution" value={resolution} />
              )}
              {ratio && <MetadataRow label="Aspect ratio" value={ratio} />}
              {duration && <MetadataRow label="Duration" value={duration} />}
              <MetadataRow
                label="File size"
                value={formatFileSize(asset.fileSizeBytes)}
              />
            </MetadataSection>
          )}

          <MetadataSection icon={Sparkles} title="Generation">
            <MetadataRow
              label="Provider"
              value={asset.provider ?? "Unavailable"}
            />
            <MetadataRow
              label="Model"
              value={asset.model ?? "Unavailable"}
            />
            <MetadataRow label="Orchestration" value="Genblaze" />
            <MetadataRow label="Stage" value={asset.generationStage} />
            <MetadataRow
              label="Prompt saved"
              value={asset.promptSaved ? "Yes" : "No"}
            />
            <MetadataRow label="Asset version" value={`v${asset.version}`} />
          </MetadataSection>

          <MetadataSection icon={Cloud} title="Storage">
            <MetadataRow label="Provider" value="Backblaze B2" />
            <MetadataRow label="Storage state" value={asset.storageState} />
            <MetadataRow label="Bucket" value="talemotion-media" mono />
            <MetadataRow label="Object key" value={asset.storageKey} mono />
            <MetadataRow
              label="File size"
              value={formatFileSize(asset.fileSizeBytes)}
            />
            <MetadataRow
              label="Signed URL"
              value={
                asset.signedUrlStatus === "simulated"
                  ? "Available (simulated)"
                  : "Unavailable"
              }
            />
          </MetadataSection>

          <MetadataSection icon={CheckCircle2} title="Provenance">
            <MetadataRow
              label="Manifest"
              value={
                <span
                  className={cn(
                    asset.manifestStatus === "verified" &&
                      "text-emerald-400"
                  )}
                >
                  {asset.manifestStatus === "verified"
                    ? "Recorded (simulated)"
                    : asset.manifestStatus}
                </span>
              }
            />
            <MetadataRow
              label="SHA-256"
              value={
                asset.sha256
                  ? `${asset.sha256.slice(0, 12)}…${asset.sha256.slice(-8)}`
                  : "Unavailable"
              }
              mono
            />
            <MetadataRow
              label="Prompt"
              value={asset.promptSaved ? "Recorded" : "Not recorded"}
            />
            <MetadataRow
              label="Provider"
              value={asset.provider ? "Recorded" : "Not recorded"}
            />
            <MetadataRow
              label="Model"
              value={asset.model ? "Recorded" : "Not recorded"}
            />
            <MetadataRow
              label="Timestamp"
              value={formatAssetDateTime(asset.updatedAt)}
            />
          </MetadataSection>

          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              Simulated integration.
            </span>{" "}
            Genblaze orchestration, Backblaze B2 storage, signed URLs, and
            provenance verification are represented as frontend-only metadata.
          </div>
        </div>

        <Separator />
        <SheetFooter className="flex-row items-center px-5 py-4">
          <Button asChild className="flex-1">
            <Link href={`/projects/${asset.projectId}`}>
              <ExternalLink />
              Open Project
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.info("Download is simulated in this frontend prototype.")
            }
          >
            <Download />
            Download
          </Button>
          <AssetActions
            asset={asset}
            onPreview={() => undefined}
            onArchive={onArchive}
            onRestore={onRestore}
            onDelete={onDelete}
            onRetry={onRetry}
            disabled={disabled}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
