import { Clock, Layers, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMode } from "@/lib/format";
import type { VideoTemplatePreset } from "@/lib/mock-data";
import { MODE_ICONS } from "./step-mode-select";

interface TemplateCardProps {
  template: VideoTemplatePreset;
  selected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, selected, onSelect }: TemplateCardProps) {
  const Icon = MODE_ICONS[template.mode];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected
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
          {formatMode(template.mode)}
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
