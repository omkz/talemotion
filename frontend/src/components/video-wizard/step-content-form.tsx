import type { Control } from "react-hook-form";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { VideoTemplatePreset } from "@/lib/mock-data";
import type { VideoMode } from "@/types";
import type { WizardFormValues } from "./schema";

interface StepContentFormProps {
  mode: VideoMode;
  control: Control<WizardFormValues>;
  appliedTemplate?: VideoTemplatePreset | null;
}

export function StepContentForm({ mode, control, appliedTemplate }: StepContentFormProps) {
  return (
    <div className="grid gap-5">
      {appliedTemplate && (
        <p className="rounded-lg border border-accent/25 bg-accent/8 px-3.5 py-2.5 text-sm text-foreground/90">
          {appliedTemplate.guidance}
        </p>
      )}
      <StepContentFields mode={mode} control={control} appliedTemplate={appliedTemplate} />
    </div>
  );
}

function StepContentFields({
  mode,
  control,
  appliedTemplate,
}: {
  mode: VideoMode;
  control: Control<WizardFormValues>;
  appliedTemplate?: VideoTemplatePreset | null;
}) {
  if (mode === "microdrama") {
    return (
      <div className="grid gap-5">
        <FormField
          control={control}
          name="premise"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Premise</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="A loyal palace guard uncovers a conspiracy against the queen he swore to protect."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={control}
            name="mainCharacter"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Main character</FormLabel>
                <FormControl>
                  <Input placeholder="Kael, the Queen's Guard" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="genre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Genre</FormLabel>
                <FormControl>
                  <Input placeholder="Political Thriller" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={control}
          name="desiredEnding"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Desired ending</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Kael exposes the traitor just before the coronation, earning the queen's trust."
                  rows={2}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  if (mode === "product-advertisement") {
    return (
      <div className="grid gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={control}
            name="productName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Product name</FormLabel>
                <FormControl>
                  <Input placeholder="Solace Coffee" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="targetAudience"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target audience</FormLabel>
                <FormControl>
                  <Input placeholder="Young professionals who want a coffee ritual" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={control}
          name="productDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Small-batch, single-origin coffee roasted for a calmer morning."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="mainBenefit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Main benefit</FormLabel>
              <FormControl>
                <Input placeholder="A smoother, less acidic cup that won't upset your stomach." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="callToAction"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Call to action</FormLabel>
              <FormControl>
                <Input placeholder="Order your first bag today." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <FormField
        control={control}
        name="topic"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Topic</FormLabel>
            <FormControl>
              <Textarea
                placeholder={
                  appliedTemplate?.example.topic ??
                  "The founding of the Majapahit Empire — how Raden Wijaya turned defeat into the birth of a kingdom."
                }
                rows={3}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="additionalDirection"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Additional direction</FormLabel>
            <FormControl>
              <Textarea
                placeholder={
                  appliedTemplate?.example.additionalDirection ??
                  "Emphasize strategy and resilience over spectacle. Keep tone reverent and cinematic."
                }
                rows={2}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="sourceNotes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Source notes <span className="font-normal text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormControl>
              <Textarea
                placeholder="Based on the Pararaton and Nagarakretagama chronicles."
                rows={2}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
