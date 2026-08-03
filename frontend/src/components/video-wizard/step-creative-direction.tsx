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
  TONE_OPTIONS,
} from "./project-options";
import type { WizardFormValues } from "./schema";

export function StepCreativeDirection({
  control,
}: {
  control: Control<WizardFormValues>;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={control}
          name="language"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Language</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Initial language options for the current MVP.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="tone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tone</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TONE_OPTIONS.map((option) => (
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
              <FormControl>
                <Input list="target-audience-options" {...field} />
              </FormControl>
              <datalist id="target-audience-options">
                {AUDIENCE_SUGGESTIONS.map((audience) => <option key={audience} value={audience} />)}
              </datalist>
              <FormDescription>Choose a suggestion or enter a custom audience.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <FormField
        control={control}
        name="additionalDirection"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Additional direction{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </FormLabel>
            <FormDescription>
              Add creative instructions, narrative focus, pacing, or details not covered above.
            </FormDescription>
            <FormControl>
              <Textarea
                placeholder="Open with the Mongol fleet approaching Java. Keep the narration dramatic but historically cautious."
                rows={4}
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
