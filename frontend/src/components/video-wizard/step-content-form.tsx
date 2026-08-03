import type { Control } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WizardFormValues } from "./schema";

export function StepContentForm({
  control,
}: {
  control: Control<WizardFormValues>;
}) {
  return (
    <div className="grid gap-6">
      <FormField
        control={control}
        name="topic"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Topic or story idea</FormLabel>
            <FormDescription>
              Describe what you want the video to be about.
            </FormDescription>
            <FormControl>
              <Textarea
                placeholder="A short documentary about how Majapahit became a maritime power"
                rows={4}
                autoFocus
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
              Source notes{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormDescription>
              Add facts, references, key events, excerpts, or source material the story should use.
            </FormDescription>
            <FormControl>
              <Textarea
                placeholder="Key dates, historical context, excerpts, or reference material…"
                rows={4}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Project title{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormDescription>
              Leave blank to create a working title from your story idea.
            </FormDescription>
            <FormControl>
              <Input placeholder="The Rise of Majapahit" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
