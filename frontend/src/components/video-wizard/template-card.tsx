import {
  Clock,
  Crown,
  Layers,
  Rows3,
  ScrollText,
  Search,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMode } from "@/lib/format";
import type {
  TemplateIconKey,
  VideoTemplatePreset,
} from "@/lib/mock-data";

const TEMPLATE_ICONS: Record<TemplateIconKey, LucideIcon> = {
  "historical-fact": ScrollText,
  "battle-and-betrayal": Swords,
  empire: Crown,
  mystery: Search,
};

interface TemplateCardProps {
  template: VideoTemplatePreset;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

export function TemplateCard({
  template,
  selected,
  onSelect,
  disabled = false,
}: TemplateCardProps) {
  const Icon = TEMPLATE_ICONS[template.icon];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        disabled
          ? "cursor-not-allowed border-border bg-card opacity-55"
          : selected
          ? "border-accent bg-accent/8"
          : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40"
      )}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            selected ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="size-4.5" strokeWidth={1.75} />
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {disabled ? "Coming Soon" : formatMode(template.mode)}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{template.name}</p>
        <p className="text-sm text-muted-foreground">{template.description}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" />
          {template.duration}s
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3.5" />
          {template.aspectRatio}
        </span>
        <span className="inline-flex items-center gap-1">
          <Rows3 className="size-3.5" />
          {template.sceneCount === "auto" ? "Auto scenes" : `${template.sceneCount} scenes`}
        </span>
      </div>
    </button>
  );
}
