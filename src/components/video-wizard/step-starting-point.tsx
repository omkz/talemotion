import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIDEO_TEMPLATES, type VideoTemplatePreset } from "@/lib/mock-data";
import type { VideoMode } from "@/types";
import { StepModeSelect } from "./step-mode-select";
import { TemplateCard } from "./template-card";

interface StepStartingPointProps {
  startMode: "scratch" | "template";
  mode: VideoMode;
  templateId: string | null;
  onSelectScratch: () => void;
  onSelectMode: (mode: VideoMode) => void;
  onSelectTemplate: (template: VideoTemplatePreset) => void;
}

export function StepStartingPoint({
  startMode,
  mode,
  templateId,
  onSelectScratch,
  onSelectMode,
  onSelectTemplate,
}: StepStartingPointProps) {
  const scratchSelected = startMode === "scratch";

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <button
          type="button"
          role="radio"
          aria-checked={scratchSelected}
          onClick={onSelectScratch}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            scratchSelected
              ? "border-accent bg-accent/8"
              : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40"
          )}
        >
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              scratchSelected ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            <SquarePen className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Start from scratch</p>
            <p className="text-sm text-muted-foreground">
              Configure the video type and settings yourself
            </p>
          </div>
        </button>

        {scratchSelected && (
          <div className="pt-1">
            <StepModeSelect value={mode} onChange={onSelectMode} />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Quick-start templates</h3>
          <p className="text-sm text-muted-foreground">
            Start from a preset with settings already tuned — you can change anything after.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Quick-start templates"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {VIDEO_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={startMode === "template" && templateId === template.id}
              onSelect={() => onSelectTemplate(template)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
