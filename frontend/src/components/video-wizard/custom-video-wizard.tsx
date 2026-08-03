"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { createPersistedCustomProject } from "@/lib/api/persisted-projects";
import { realSceneGenerationEnabled } from "@/lib/api/scene-generation-jobs";
import { createProject } from "@/lib/mock-api";
import {
  CUSTOM_STEP_FIELDS,
  CUSTOM_WIZARD_DEFAULT_VALUES,
  customWizardSchema,
  type CustomWizardFormValues,
} from "./custom-schema";
import { mapCustomValuesToProjectInput } from "./map-custom-to-project";
import { optionLabel, LANGUAGE_OPTIONS } from "./project-options";
import { StepCustomDescription } from "./step-custom-description";
import { StepOutputSettings } from "./step-output-settings";
import { WizardStepper } from "./wizard-stepper";

const CUSTOM_STEPS = ["Describe", "Output"] as const;

export function CustomVideoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  const form = useForm<CustomWizardFormValues>({
    resolver: zodResolver(customWizardSchema),
    defaultValues: CUSTOM_WIZARD_DEFAULT_VALUES,
    mode: "onChange",
  });
  const values = useWatch({ control: form.control });

  const goNext = async () => {
    const valid = await form.trigger(CUSTOM_STEP_FIELDS[step], {
      shouldFocus: true,
    });
    if (valid) setStep(2);
  };

  const goBack = () => {
    if (step === 1) {
      router.push("/projects/new");
      return;
    }
    setStep(1);
  };

  const onSubmit = async (submitted: CustomWizardFormValues) => {
    if (isCreating) return;
    setIsCreating(true);
    form.clearErrors("root.server");
    try {
      const project = realSceneGenerationEnabled
        ? await createPersistedCustomProject({
            title: submitted.title.trim() || undefined,
            topic: submitted.prompt,
            source_notes: submitted.sourceNotes.trim() || null,
            language: submitted.language,
            target_audience: submitted.targetAudience,
            duration_seconds: Number(submitted.duration) as 30 | 45,
            visual_style: submitted.visualStyle,
            narration_style: submitted.narrationStyle,
            narration_enabled: submitted.narrationEnabled,
            captions_enabled: submitted.captionsEnabled,
            music_enabled: submitted.musicEnabled,
          })
        : await createProject(mapCustomValuesToProjectInput(submitted));
      toast.success("Project created", {
        description: `${project.output.title} is ready for storyboard planning.`,
      });
      router.push(`/projects/${project.id}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The project could not be created. Please try again.";
      form.setError("root.server", { message });
      toast.error("Project creation failed", { description: message });
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <WizardStepper currentStep={step} steps={CUSTOM_STEPS} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="p-5 sm:p-8">
            <h2 className="mb-6 text-lg font-semibold text-foreground">
              {CUSTOM_STEPS[step - 1]}
            </h2>
            {step === 1 ? (
              <StepCustomDescription control={form.control} />
            ) : (
              <div className="space-y-8">
                <StepOutputSettings />
                <CustomReview values={values as CustomWizardFormValues} />
              </div>
            )}
            {form.formState.errors.root?.server?.message && (
              <p
                className="mt-6 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
                role="alert"
              >
                {form.formState.errors.root.server.message}
              </p>
            )}
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
              <Button type="button" variant="outline" onClick={goBack} disabled={isCreating}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              {step === 1 ? (
                <Button type="button" onClick={goNext}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isCreating || form.formState.isSubmitting}
                >
                  {isCreating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isCreating ? "Creating…" : "Create project"}
                </Button>
              )}
            </div>
          </Card>
        </form>
      </Form>
    </div>
  );
}

function CustomReview({ values }: { values: CustomWizardFormValues }) {
  return (
    <section aria-labelledby="custom-review-heading" className="space-y-4 border-t border-border pt-6">
      <h3 id="custom-review-heading" className="text-sm font-semibold text-foreground">
        Review
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <h4 className="font-medium text-foreground">Describe</h4>
          <p>{values.prompt || "No description entered"}</p>
          <p className="text-muted-foreground">
            {optionLabel(LANGUAGE_OPTIONS, values.language)} · {values.targetAudience}
          </p>
        </div>
        <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <h4 className="font-medium text-foreground">Output</h4>
          <p>{values.duration} seconds · {values.aspectRatio}</p>
          <p className="text-muted-foreground">
            {values.visualStyle} · {values.narrationStyle}
          </p>
          <p className="text-muted-foreground">
            Narration {values.narrationEnabled ? "on" : "off"} · Captions{" "}
            {values.captionsEnabled ? "on" : "off"} · Music{" "}
            {values.musicEnabled ? "on" : "off"}
          </p>
        </div>
      </div>
    </section>
  );
}
