import {
  Archive,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaAssetStatus } from "@/types";

const STATUS_META: Record<
  MediaAssetStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  ready: {
    label: "Ready",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-400",
  },
  generating: {
    label: "Generating",
    icon: Loader2,
    className: "bg-accent/15 text-accent",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-destructive/15 text-destructive",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    className: "bg-muted text-muted-foreground",
  },
};

export function AssetStatusBadge({
  status,
  className,
}: {
  status: MediaAssetStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        meta.className,
        className
      )}
    >
      <Icon
        className={cn(
          "size-3",
          status === "generating" && "animate-spin"
        )}
      />
      {meta.label}
    </span>
  );
}
