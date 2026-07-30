import type { CreateProjectInput } from "@/lib/mock-api";
import type { Duration, SceneCountSetting } from "@/types";
import type { WizardFormValues } from "./schema";

export function mapWizardValuesToProjectInput(
  values: WizardFormValues
): CreateProjectInput {
  const duration = Number(values.duration) as Duration;
  const sceneCount: SceneCountSetting =
    values.sceneCount === "auto" ? "auto" : (Number(values.sceneCount) as 4 | 5 | 6);

  const output: CreateProjectInput["output"] = {
    title: values.title,
    language: values.language,
    duration,
    aspectRatio: values.aspectRatio,
    visualStyle: values.visualStyle,
    narrationStyle: values.narrationStyle,
    sceneCount,
    captionsEnabled: values.captionsEnabled,
    musicEnabled: values.musicEnabled,
  };

  if (values.mode === "microdrama") {
    return {
      mode: values.mode,
      output,
      brief: {
        mode: "microdrama",
        premise: values.premise ?? "",
        mainCharacter: values.mainCharacter ?? "",
        genre: values.genre ?? "",
        desiredEnding: values.desiredEnding ?? "",
      },
    };
  }

  if (values.mode === "product-advertisement") {
    return {
      mode: values.mode,
      output,
      brief: {
        mode: "product-advertisement",
        productName: values.productName ?? "",
        productDescription: values.productDescription ?? "",
        mainBenefit: values.mainBenefit ?? "",
        targetAudience: values.targetAudience ?? "",
        callToAction: values.callToAction ?? "",
      },
    };
  }

  return {
    mode: "historical-documentary",
    output,
    brief: {
      mode: "historical-documentary",
      topic: values.topic ?? "",
      additionalDirection: values.additionalDirection ?? "",
      sourceNotes: values.sourceNotes ?? "",
    },
  };
}
