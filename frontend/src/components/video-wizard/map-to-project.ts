import type { CreateVideoProjectInput } from "@/lib/api/video-project-api";
import type { WizardFormValues } from "./schema";

export function mapWizardValuesToProjectInput(
  values: WizardFormValues,
): CreateVideoProjectInput {
  return {
    mode: "historical-documentary",
    output: {
      title: values.title.trim() || values.topic.trim(),
      language: values.language,
      duration: Number(values.duration) as 30 | 45,
      aspectRatio: "9:16",
      visualStyle: values.visualStyle,
      narrationStyle: values.narrationStyle,
      sceneCount: 4,
      narrationEnabled: values.narrationEnabled,
      captionsEnabled: values.captionsEnabled,
      musicEnabled: values.musicEnabled,
    },
    brief: {
      mode: "historical-documentary",
      topic: values.topic,
      sourceNotes: values.sourceNotes,
      contentType: values.contentType,
      language: values.language,
      tone: values.tone,
      targetAudience: values.targetAudience,
      additionalDirection: values.additionalDirection,
    },
  };
}
