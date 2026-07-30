"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { createProject } from "@/lib/mock-api";
import { WizardStepper } from "./wizard-stepper";
import { StepModeSelect } from "./step-mode-select";
import { StepContentForm } from "./step-content-form";
import { StepOutputSettings } from "./step-output-settings";
import { STEP_FIELDS, WIZARD_DEFAULT_VALUES, wizardSchema, type WizardFormValues } from "./schema";
import { mapWizardValuesToProjectInput } from "./map-to-project";

const STEP_TITLES = [
  "Choose a video type",
  "Add your content",
  "Output settings",
];

export function VideoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: WIZARD_DEFAULT_VALUES,
    mode: "onChange",
  });

  const mode = form.watch("mode");

  const goNext = async () => {
    const valid = await form.trigger(STEP_FIELDS[step]);
    if (valid) setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const onSubmit = async (values: WizardFormValues) => {
    setIsCreating(true);
    try {
      const project = await createProject(mapWizardValuesToProjectInput(values));
      toast.success("Storyboard created", {
        description: `${project.output.title} is ready for review.`,
      });
      router.push(`/projects/${project.id}`);
    } catch {
      toast.error("Something went wrong creating the storyboard.");
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
              <StepModeSelect
                value={mode}
                onChange={(value) => form.setValue("mode", value, { shouldValidate: true })}
              />
            )}
            {step === 2 && <StepContentForm mode={mode} control={form.control} />}
            {step === 3 && <StepOutputSettings control={form.control} />}

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
