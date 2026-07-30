"use client";

import { useState } from "react";
import { Pencil, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingChip } from "@/components/shared/setting-chip";
import { BriefField } from "./brief-field";
import { EditBriefSheet } from "./edit-brief-sheet";
import type { ModeBrief, OutputConfig } from "@/types";

interface BriefSectionProps {
  brief: ModeBrief;
  output: OutputConfig;
  historicalAccuracyNote: string | null;
  onSave: (next: {
    brief: ModeBrief;
    visualStyle: string;
    narrationStyle: string;
    captionsEnabled: boolean;
    musicEnabled: boolean;
    historicalAccuracyNote: string | null;
  }) => void;
}

function briefFields(brief: ModeBrief): { label: string; value: string }[] {
  switch (brief.mode) {
    case "historical-documentary":
      return [
        { label: "Topic", value: brief.topic },
        { label: "Additional direction", value: brief.additionalDirection },
        { label: "Source notes", value: brief.sourceNotes },
      ];
    case "microdrama":
      return [
        { label: "Premise", value: brief.premise },
        { label: "Main character", value: brief.mainCharacter },
        { label: "Genre", value: brief.genre },
        { label: "Desired ending", value: brief.desiredEnding },
      ];
    case "product-advertisement":
      return [
        { label: "Product name", value: brief.productName },
        { label: "Product description", value: brief.productDescription },
        { label: "Main benefit", value: brief.mainBenefit },
        { label: "Target audience", value: brief.targetAudience },
        { label: "Call to action", value: brief.callToAction },
      ];
  }
}

export function BriefSection({ brief, output, historicalAccuracyNote, onSave }: BriefSectionProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Brief</h2>
            <p className="text-sm text-muted-foreground">
              The original input and direction used to generate this video.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {briefFields(brief).map((field) => (
            <BriefField key={field.label} label={field.label} value={field.value} />
          ))}
        </div>

        {historicalAccuracyNote && (
          <div className="mt-5 flex gap-2.5 rounded-lg border border-accent/25 bg-accent/8 p-3.5">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-accent" />
            <div>
              <p className="text-xs font-medium text-foreground">Historical accuracy note</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{historicalAccuracyNote}</p>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Output configuration</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <SettingChip label="Language" value={output.language} />
          <SettingChip label="Duration" value={`${output.duration}s`} />
          <SettingChip label="Aspect ratio" value={output.aspectRatio} />
          <SettingChip label="Visual style" value={output.visualStyle} />
          <SettingChip label="Narration style" value={output.narrationStyle} />
          <SettingChip
            label="Scene count"
            value={output.sceneCount === "auto" ? "Auto" : `${output.sceneCount} scenes`}
          />
          <SettingChip label="Captions" value={output.captionsEnabled ? "Enabled" : "Disabled"} />
          <SettingChip label="Music" value={output.musicEnabled ? "Enabled" : "Disabled"} />
        </div>
      </Card>

      <EditBriefSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        brief={brief}
        output={output}
        historicalAccuracyNote={historicalAccuracyNote}
        onSave={onSave}
      />
    </div>
  );
}
