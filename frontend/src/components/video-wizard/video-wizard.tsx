"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import {
  getConfiguredApiMode,
  videoProjectApi,
} from "@/lib/api/provider";
import { pollJob } from "@/lib/api/poll-job";
import { VIDEO_TEMPLATES, type VideoTemplatePreset } from "@/lib/mock-data";
import type { VideoMode } from "@/types";
import { WizardStepper } from "./wizard-stepper";
import { StepStartingPoint } from "./step-starting-point";
import { StepContentForm } from "./step-content-form";
import { StepOutputSettings } from "./step-output-settings";
import { STEP_FIELDS, WIZARD_DEFAULT_VALUES, wizardSchema, type WizardFormValues } from "./schema";
import { mapWizardValuesToProjectInput } from "./map-to-project";

const STEP_TITLES = [
  "How do you want to start?",
  "Add your content",
  "Output settings",
];

const DEFAULT_TEMPLATE = VIDEO_TEMPLATES[0];
const INITIAL_WIZARD_VALUES: WizardFormValues = {
  ...WIZARD_DEFAULT_VALUES,
  startMode: "template",
  templateId: DEFAULT_TEMPLATE.id,
  mode: DEFAULT_TEMPLATE.mode,
  duration: String(DEFAULT_TEMPLATE.duration) as WizardFormValues["duration"],
  aspectRatio: DEFAULT_TEMPLATE.aspectRatio,
  sceneCount: String(DEFAULT_TEMPLATE.sceneCount) as WizardFormValues["sceneCount"],
  visualStyle: DEFAULT_TEMPLATE.visualStyle,
  narrationStyle: DEFAULT_TEMPLATE.narrationStyle,
};

export function VideoWizard() {
  const router = useRouter();
  const realHistoricalOnly = getConfiguredApiMode() === "http";
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: realHistoricalOnly
      ? { ...INITIAL_WIZARD_VALUES, musicEnabled: false }
      : INITIAL_WIZARD_VALUES,
    mode: "onChange",
  });

  const [startMode, templateId, mode] = useWatch({
    control: form.control,
    name: ["startMode", "templateId", "mode"],
  });
  const appliedTemplate = VIDEO_TEMPLATES.find((t) => t.id === templateId) ?? null;

  const goNext = async () => {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const handleSelectScratch = () => {
    form.setValue("startMode", "scratch", { shouldValidate: true });
    form.setValue("templateId", null, { shouldValidate: true });
    form.setValue("duration", WIZARD_DEFAULT_VALUES.duration);
    form.setValue("aspectRatio", WIZARD_DEFAULT_VALUES.aspectRatio);
    form.setValue("sceneCount", WIZARD_DEFAULT_VALUES.sceneCount);
    form.setValue("visualStyle", WIZARD_DEFAULT_VALUES.visualStyle);
    form.setValue("narrationStyle", WIZARD_DEFAULT_VALUES.narrationStyle);
    if (realHistoricalOnly) {
      form.setValue("sceneCount", "4");
      form.setValue("language", "English");
      form.setValue("aspectRatio", "9:16");
      form.setValue("captionsEnabled", true);
      form.setValue("musicEnabled", false);
    }
  };

  const handleSelectMode = (value: VideoMode) => {
    form.setValue("startMode", "scratch", { shouldValidate: true });
    form.setValue("templateId", null, { shouldValidate: true });
    form.setValue("mode", value, { shouldValidate: true });
  };

  const applyTemplateDefaults = (template: VideoTemplatePreset) => {
    form.setValue("duration", String(template.duration) as WizardFormValues["duration"]);
    form.setValue("aspectRatio", template.aspectRatio);
    form.setValue("sceneCount", String(template.sceneCount) as WizardFormValues["sceneCount"]);
    form.setValue("visualStyle", template.visualStyle);
    form.setValue("narrationStyle", template.narrationStyle);
  };

  const handleSelectTemplate = (template: VideoTemplatePreset) => {
    form.setValue("startMode", "template", { shouldValidate: true });
    form.setValue("templateId", template.id, { shouldValidate: true });
    form.setValue("mode", template.mode, { shouldValidate: true });
    applyTemplateDefaults(template);
  };

  const handleResetToTemplateDefaults = () => {
    if (!appliedTemplate) return;
    applyTemplateDefaults(appliedTemplate);
    toast.success("Reset to template defaults");
  };

  const onSubmit = async (values: WizardFormValues) => {
    setIsCreating(true);
    try {
      const apiMode = getConfiguredApiMode();
      if (apiMode === "http" && values.mode !== "historical-documentary") {
        throw new Error(
          "Microdrama and Product Advertisement are coming soon for real generation."
        );
      }
      if (
        apiMode === "http" &&
        (values.language !== "English" ||
          values.duration === "60" ||
          values.aspectRatio !== "9:16" ||
          values.sceneCount !== "4" ||
          !values.captionsEnabled ||
          values.musicEnabled)
      ) {
        throw new Error(
          "The real MVP supports English, 30 or 45 seconds, 9:16, exactly 4 scenes, captions enabled, and no background music yet."
        );
      }
      const project = await videoProjectApi.createProject(
        mapWizardValuesToProjectInput(values)
      );
      const job = await videoProjectApi.generateStoryboard(project.id, {
        sceneCount: 4,
      });
      const completed = await pollJob({
        api: videoProjectApi,
        jobId: job.id,
      });
      if (completed.stage === "failed") {
        throw new Error(
          completed.errorMessage ?? "Storyboard generation failed."
        );
      }
      toast.success("Storyboard created", {
        description: `${project.output.title} is ready for review.`,
      });
      router.push(`/projects/${project.id}`);
    } catch (error) {
      toast.error("Could not create the storyboard.", {
        description:
          error instanceof Error ? error.message : "Unknown API error.",
      });
      setIsCreating(false);
    }
  };

  if (isCreating) {
    return (
      <Card className="flex flex-col items-center gap-4 px-8 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent/12 text-accent">
          <Sparkles className="size-6 animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-medium text-foreground">Generating your storyboard…</p>
          <p className="text-sm text-muted-foreground">
            Drafting scenes, narration, and visual prompts from your brief.
          </p>
        </div>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <WizardStepper currentStep={step} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="p-6 sm:p-8">
            <h2 className="mb-6 text-lg font-semibold text-foreground">
              {STEP_TITLES[step - 1]}
            </h2>

            {step === 1 && (
              <StepStartingPoint
                startMode={startMode}
                mode={mode}
                templateId={templateId}
                onSelectScratch={handleSelectScratch}
                onSelectMode={handleSelectMode}
                onSelectTemplate={handleSelectTemplate}
                realHistoricalOnly={realHistoricalOnly}
              />
            )}
            {step === 2 && (
              <StepContentForm
                mode={mode}
                control={form.control}
                guidance={appliedTemplate?.guidance}
              />
            )}
            {step === 3 && (
              <StepOutputSettings
                control={form.control}
                appliedTemplate={appliedTemplate}
                onResetToTemplateDefaults={handleResetToTemplateDefaults}
                realHistoricalOnly={realHistoricalOnly}
              />
            )}

            <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={goBack}
                disabled={step === 1}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={goNext}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  <Sparkles className="size-4" />
                  Create Storyboard
                </Button>
              )}
            </div>
          </Card>
        </form>
      </Form>
    </div>
  );
}
