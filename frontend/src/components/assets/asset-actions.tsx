"use client";

import { useRouter } from "next/navigation";
import {
  Archive,
  Copy,
  Download,
  ExternalLink,
  Eye,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MediaLibraryAsset } from "@/types";
import { getSimulatedAssetUrl } from "./asset-display";

interface AssetActionsProps {
  asset: MediaLibraryAsset;
  onPreview: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRetry: () => void;
  disabled?: boolean;
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Couldn't copy ${label.toLowerCase()}`);
  }
}

export function AssetActions({
  asset,
  onPreview,
  onArchive,
  onRestore,
  onDelete,
  onRetry,
  disabled,
}: AssetActionsProps) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Actions for ${asset.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onPreview}>
          <Eye />
          Preview
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => router.push(`/projects/${asset.projectId}`)}
        >
          <ExternalLink />
          Open Project
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            copyText(getSimulatedAssetUrl(asset), "Simulated asset URL")
          }
        >
          <Copy />
          Copy Asset URL
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => copyText(asset.storageKey, "B2 object key")}
        >
          <Copy />
          Copy B2 Object Key
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            toast.info("Download is simulated in this frontend prototype.")
          }
        >
          <Download />
          Download
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {asset.status === "failed" && (
          <DropdownMenuItem onSelect={onRetry}>
            <RefreshCw />
            Retry Generation
          </DropdownMenuItem>
        )}
        {asset.status === "archived" ? (
          <DropdownMenuItem onSelect={onRestore}>
            <RotateCcw />
            Restore
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onArchive}>
            <Archive />
            Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
