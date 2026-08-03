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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOM_TARGET_AUDIENCE_VALUE,
  HISTORICAL_TARGET_AUDIENCE_OPTIONS,
  isPresetTargetAudience,
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
          name="tone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Narrative Tone</FormLabel>
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
              <FormDescription>
                Controls the storytelling and narration style, not the visual brightness.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
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
          name="targetAudience"
          render={({ field }) => {
            const usesPreset = isPresetTargetAudience(field.value);
            return (
              <FormItem>
                <FormLabel>Target audience</FormLabel>
                <Select
                  value={
                    usesPreset ? field.value : CUSTOM_TARGET_AUDIENCE_VALUE
                  }
                  onValueChange={(value) =>
                    field.onChange(
                      value === CUSTOM_TARGET_AUDIENCE_VALUE ? "" : value,
                    )
                  }
                >
                  <FormControl>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {HISTORICAL_TARGET_AUDIENCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_TARGET_AUDIENCE_VALUE}>
                      Custom...
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Adjusts language complexity, context, and assumed historical knowledge.
                </FormDescription>
                {!usesPreset && (
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="custom-target-audience">
                      Describe the audience
                    </Label>
                    <Input
                      id="custom-target-audience"
                      placeholder="Indonesian high-school students"
                      maxLength={200}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  </div>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
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
