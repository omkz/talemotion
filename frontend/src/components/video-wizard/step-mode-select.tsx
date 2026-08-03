import Link from "next/link";
import { Clapperboard, Drama, Landmark, Megaphone, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { VIDEO_MODES, type VideoMode } from "@/types";

export const MODE_ICONS: Record<VideoMode, LucideIcon> = {
  "historical-documentary": Landmark,
  "custom-video": Clapperboard,
  microdrama: Drama,
  "product-advertisement": Megaphone,
};

const MODE_ROUTES: Partial<Record<VideoMode, string>> = {
  "historical-documentary": "/projects/new/historical",
  "custom-video": "/projects/new/custom",
};

export function StepModeSelect() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2"
    >
      {VIDEO_MODES.map((mode) => {
        const Icon = MODE_ICONS[mode.id];
        const href = MODE_ROUTES[mode.id];
        const content = (
          <>
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{mode.label}</p>
                {!href && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Coming Soon
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{mode.description}</p>
            </div>
            <span className="mt-auto text-sm font-medium text-accent">
              {href ? "Start" : "Unavailable"}
            </span>
          </>
        );
        return href ? (
          <Link
            key={mode.id}
            href={href}
            className={cn(
              "flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/40",
            )}
          >
            {content}
          </Link>
        ) : (
          <div
            key={mode.id}
            aria-disabled="true"
            className="flex cursor-not-allowed flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left opacity-55"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
