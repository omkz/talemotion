import type { CreateVideoProjectInput } from "@/lib/api/video-project-api";
import type { CustomWizardFormValues } from "./custom-schema";

export function mapCustomValuesToProjectInput(
  values: CustomWizardFormValues,
): CreateVideoProjectInput {
  return {
    mode: "custom-video",
    brief: {
      mode: "custom-video",
      prompt: values.prompt,
      sourceNotes: values.sourceNotes,
      language: values.language,
      targetAudience: values.targetAudience,
    },
    output: {
      title: values.title.trim() || values.prompt.trim(),
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
  };
}
