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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AUDIENCE_SUGGESTIONS,
  LANGUAGE_OPTIONS,
} from "./project-options";
import type { CustomWizardFormValues } from "./custom-schema";

export function StepCustomDescription({
  control,
}: {
  control: Control<CustomWizardFormValues>;
}) {
  return (
    <div className="grid gap-6">
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
              Leave blank to create a working title from your video description.
            </FormDescription>
            <FormControl><Input placeholder="From farm to café" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="prompt"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Describe your video</FormLabel>
            <FormDescription>
              Describe the subject, key moments, mood, structure, and ending you want.
            </FormDescription>
            <FormControl>
              <Textarea
                rows={7}
                autoFocus
                placeholder="Create a 45-second cinematic video showing how coffee beans travel from a mountain farm to a modern café. Begin at sunrise, follow the roasting process, and end with a close-up of the finished cup."
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
              Add facts, references, product details, excerpts, or other material the video should use.
            </FormDescription>
            <FormControl><Textarea rows={4} {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={control}
          name="language"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Language</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <FormControl><Input list="custom-audience-options" {...field} /></FormControl>
              <datalist id="custom-audience-options">
                {AUDIENCE_SUGGESTIONS.map((audience) => (
                  <option key={audience} value={audience} />
                ))}
              </datalist>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
