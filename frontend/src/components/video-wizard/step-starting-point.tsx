"use client";

import { useState } from "react";
import { VIDEO_TEMPLATES, type VideoTemplatePreset } from "@/lib/mock-data";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  realHistoricalOnly?: boolean;
}

export function StepStartingPoint({
  startMode,
  mode,
  templateId,
  onSelectScratch,
  onSelectMode,
  onSelectTemplate,
  realHistoricalOnly = false,
}: StepStartingPointProps) {
  const [view, setView] = useState<"templates" | "custom">(
    startMode === "template" ? "templates" : "custom"
  );
  const [lastTemplateId, setLastTemplateId] = useState(
    templateId ?? VIDEO_TEMPLATES[0].id
  );

  const handleViewChange = (nextView: string) => {
    if (nextView === "custom") {
      setView("custom");
      onSelectScratch();
      return;
    }

    setView("templates");
    const template =
      VIDEO_TEMPLATES.find((candidate) => candidate.id === lastTemplateId) ??
      VIDEO_TEMPLATES[0];
    onSelectTemplate(template);
  };

  const handleSelectTemplate = (template: VideoTemplatePreset) => {
    setLastTemplateId(template.id);
    onSelectTemplate(template);
  };

  return (
    <Tabs value={view} onValueChange={handleViewChange} className="gap-5">
      <TabsList className="grid h-10 w-full grid-cols-2">
        <TabsTrigger value="templates" className="h-full px-3">
          Quick Templates
        </TabsTrigger>
        <TabsTrigger value="custom" className="h-full px-3">
          Custom Setup
        </TabsTrigger>
      </TabsList>

      <TabsContent value="templates" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Start from tuned output settings, then adjust anything in the next
          steps.
        </p>
        <div
          role="radiogroup"
          aria-label="Quick templates"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {VIDEO_TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              selected={
                startMode === "template" && templateId === template.id
              }
              onSelect={() => handleSelectTemplate(template)}
              disabled={
                realHistoricalOnly &&
                (template.mode !== "historical-documentary" ||
                  template.duration === 60 ||
                  template.sceneCount !== 4)
              }
            />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="custom" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose a core video type and configure its settings yourself.
        </p>
        <StepModeSelect
          value={mode}
          onChange={onSelectMode}
          historicalOnly={realHistoricalOnly}
        />
      </TabsContent>
    </Tabs>
  );
}
