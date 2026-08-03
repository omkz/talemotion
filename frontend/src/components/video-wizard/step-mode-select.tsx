import { Drama, Landmark, Megaphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIDEO_MODES, type VideoMode } from "@/types";

export const MODE_ICONS: Record<VideoMode, LucideIcon> = {
  "historical-documentary": Landmark,
  microdrama: Drama,
  "product-advertisement": Megaphone,
};

interface StepModeSelectProps {
  value: VideoMode | null;
  onChange: (mode: VideoMode) => void;
}

export function StepModeSelect({
  value,
  onChange,
}: StepModeSelectProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Video format"
      className="grid gap-4 sm:grid-cols-3"
    >
      {VIDEO_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.id];
        const isSelected = value === mode.id;
        const disabled = mode.id !== "historical-documentary";
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => onChange(mode.id)}
            className={cn(
              "flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              disabled
                ? "cursor-not-allowed border-border bg-card opacity-55"
                : isSelected
                ? "border-accent bg-accent/8"
                : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40"
            )}
          >
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-lg",
                isSelected ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{mode.label}</p>
                {disabled && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Coming Soon
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{mode.description}</p>
            </div>
            <p className="mt-auto text-xs text-muted-foreground/80 italic">{mode.example}</p>
          </button>
        );
      })}
    </div>
  );
}
