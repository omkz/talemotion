import { CheckCircle2, FlaskConical, Loader2, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";

export type IntegrationStatus =
  | "mock-mode"
  | "checking"
  | "mock-connected"
  | "not-configured";

const STATUS_META: Record<
  IntegrationStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  "mock-mode": {
    label: "Mock Mode",
    icon: FlaskConical,
    className: "bg-accent/15 text-accent",
  },
  checking: {
    label: "Checking",
    icon: Loader2,
    className: "bg-accent/15 text-accent",
  },
  "mock-connected": {
    label: "Mock Connected",
    icon: CheckCircle2,
    className: "bg-emerald-500/15 text-emerald-400",
  },
  "not-configured": {
    label: "Not Configured",
    icon: Unplug,
    className: "bg-muted text-muted-foreground",
  },
};

export function IntegrationStatusBadge({
  status,
}: {
  status: IntegrationStatus;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        meta.className
      )}
    >
      <Icon
        className={cn(
          "size-3.5",
          status === "checking" && "animate-spin"
        )}
      />
      {meta.label}
    </span>
  );
}
