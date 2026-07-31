import { VIDEO_TEMPLATES, type VideoTemplatePreset } from "@/lib/mock-data";
import { TemplateCard } from "./template-card";

// Custom Setup (StepModeSelect) intentionally isn't offered here. The
// real-generation backend only supports Historical Documentary at 4 scenes,
// 9:16, and 30/45s, so a free-form mode picker would just reproduce one of
// these templates. Bring it back once multiple production-ready video modes
// and broader duration/scene-count combinations are supported.

interface StepStartingPointProps {
  templateId: string | null;
  onSelectTemplate: (template: VideoTemplatePreset) => void;
}

export function StepStartingPoint({
  templateId,
  onSelectTemplate,
}: StepStartingPointProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Start with a proven historical storytelling structure. You can adjust
        the content and output settings in the next steps.
      </p>
      <div
        role="radiogroup"
        aria-label="Story formats"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {VIDEO_TEMPLATES.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={templateId === template.id}
            onSelect={() => onSelectTemplate(template)}
          />
        ))}
      </div>
    </div>
  );
}
