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
import { createProject } from "@/lib/mock-api";
import { createPersistedHistoricalProject } from "@/lib/api/persisted-projects";
import { realSceneGenerationEnabled } from "@/lib/api/scene-generation-jobs";
import { WizardStepper } from "./wizard-stepper";
import { StepContentForm } from "./step-content-form";
import { StepCreativeDirection } from "./step-creative-direction";
import { StepOutputSettings } from "./step-output-settings";
import {
  historicalTargetAudienceLabel,
  LANGUAGE_OPTIONS,
  TONE_OPTIONS,
  optionLabel,
} from "./project-options";
import {
  STEP_FIELDS,
  WIZARD_DEFAULT_VALUES,
  wizardSchema,
  type WizardFormValues,
} from "./schema";
import { mapWizardValuesToProjectInput } from "./map-to-project";

const STEP_TITLES = ["Story", "Creative Direction", "Output"];

export function VideoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: WIZARD_DEFAULT_VALUES,
    mode: "onChange",
  });
  const values = useWatch({ control: form.control });

  const goNext = async () => {
    const valid = await form.trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (valid) setStep((current) => Math.min(3, current + 1));
  };

  const goBack = () => {
    if (step === 1) {
      router.push("/projects/new");
      return;
    }
    setStep((current) => current - 1);
  };

  const onSubmit = async (submitted: WizardFormValues) => {
    if (isCreating) return;
    setIsCreating(true);
    form.clearErrors("root.server");

    try {
      const project = realSceneGenerationEnabled
        ? await createPersistedHistoricalProject({
            title: submitted.title.trim() || undefined,
            topic: submitted.topic,
            source_notes: submitted.sourceNotes.trim() || null,
            language: submitted.language,
            tone: submitted.tone,
            target_audience: submitted.targetAudience,
            additional_direction: submitted.additionalDirection.trim(),
            duration_seconds: Number(submitted.duration) as 30 | 45,
            visual_style: submitted.visualStyle,
            narration_style: submitted.narrationStyle,
            narration_enabled: submitted.narrationEnabled,
            captions_enabled: submitted.captionsEnabled,
            music_enabled: submitted.musicEnabled,
            historical_accuracy_note: null,
          })
        : await createProject(mapWizardValuesToProjectInput(submitted));

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

  if (isCreating) {
    return (
      <Card className="flex flex-col items-center gap-4 px-8 py-20 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent/12 text-accent">
          <Sparkles className="size-6 animate-pulse" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-medium text-foreground">Creating your project…</p>
          <p className="text-sm text-muted-foreground">
            Saving your story, creative direction, and output settings.
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
          <Card className="p-5 sm:p-8">
            <h2 className="mb-6 text-lg font-semibold text-foreground">
              {STEP_TITLES[step - 1]}
            </h2>

            {step === 1 && <StepContentForm control={form.control} />}
            {step === 2 && <StepCreativeDirection control={form.control} />}
            {step === 3 && (
              <div className="space-y-8">
                <StepOutputSettings />
                <ProjectReview values={values as WizardFormValues} />
              </div>
            )}

            {form.formState.errors.root?.server?.message && (
              <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive" role="alert">
                {form.formState.errors.root.server.message}
              </p>
            )}

            <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
              <Button type="button" variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" />
                Back
              </Button>

              {step < 3 ? (
                <Button type="button" onClick={goNext}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={isCreating || form.formState.isSubmitting}>
                  <Sparkles className="size-4" />
                  Create project
                </Button>
              )}
            </div>
          </Card>
        </form>
      </Form>
    </div>
  );
}

function ProjectReview({ values }: { values: WizardFormValues }) {
  return (
    <section aria-labelledby="project-review-heading" className="space-y-4 border-t border-border pt-6">
      <h3 id="project-review-heading" className="text-sm font-semibold text-foreground">
        Review
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <ReviewGroup title="Story">
          <p>{values.topic || "No topic entered"}</p>
          <p className="text-muted-foreground">{values.title || "Working title will be created"}</p>
        </ReviewGroup>
        <ReviewGroup title="Creative Direction">
          <p>
            Narrative Tone: {optionLabel(TONE_OPTIONS, values.tone)}
          </p>
          <p className="text-muted-foreground">
            Language: {optionLabel(LANGUAGE_OPTIONS, values.language)}
          </p>
          <p className="text-muted-foreground">Target Audience</p>
          <p>{historicalTargetAudienceLabel(values.targetAudience.trim())}</p>
        </ReviewGroup>
        <ReviewGroup title="Output">
          <p>{values.duration} seconds · {values.aspectRatio}</p>
          <p className="text-muted-foreground">{values.visualStyle} · {values.narrationStyle}</p>
          <p className="text-muted-foreground">
            Narration {values.narrationEnabled ? "on" : "off"} · Captions {values.captionsEnabled ? "on" : "off"} · Music {values.musicEnabled ? "on" : "off"}
          </p>
        </ReviewGroup>
      </div>
    </section>
  );
}

function ReviewGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-4 text-sm">
      <h4 className="font-medium text-foreground">{title}</h4>
      {children}
    </div>
  );
}
