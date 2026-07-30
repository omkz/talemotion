import { useWatch, type Control } from "react-hook-form";
import { FlaskConical } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/types";
import { SettingsSectionCard } from "./settings-section-card";

const VISUAL_STYLES = [
  "Cinematic Realistic",
  "Epic Historical",
  "Cinematic Drama",
  "Dark Cinematic",
  "Clean Commercial",
  "Animated Illustration",
] as const;

const NARRATION_STYLES = [
  "Documentary",
  "Energetic Documentary",
  "Emotional",
  "Suspenseful",
  "Promotional",
  "Conversational",
] as const;

const IMAGE_PROVIDERS = [
  "Automatic",
  "GMI Cloud",
  "OpenAI",
  "Google",
  "NVIDIA NIM",
] as const;

const VIDEO_PROVIDERS = [
  "Automatic",
  "GMI Cloud",
  "Runway",
  "Luma",
  "Decart",
] as const;

const VOICE_PROVIDERS = [
  "Automatic",
  "ElevenLabs",
  "OpenAI",
  "Google",
] as const;

function SettingsSelect<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <FormControl>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        {values.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GenerationSettingsForm({
  control,
}: {
  control: Control<AppSettings>;
}) {
  const autoRetry = useWatch({
    control,
    name: "generation.autoRetryFailedGenerations",
  });

  return (
    <div className="space-y-5">
      <SettingsSectionCard
        title="Creative direction"
        description="Choose the visual and narrative starting point for generated scenes."
      >
        <div className="grid gap-6 py-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="generation.defaultVisualStyle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default visual style</FormLabel>
                <SettingsSelect
                  values={VISUAL_STYLES}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="generation.defaultNarrationStyle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default narration style</FormLabel>
                <SettingsSelect
                  values={NARRATION_STYLES}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Provider preferences"
        description="Mock routing preferences for the future generation pipeline."
      >
        <div className="my-4 flex gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>
            Provider availability will eventually be orchestrated through
            Genblaze. These selections are saved locally and do not connect to
            any provider.
          </p>
        </div>
        <div className="grid gap-6 pb-4 sm:grid-cols-3">
          <FormField
            control={control}
            name="generation.preferredImageProvider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image provider</FormLabel>
                <SettingsSelect
                  values={IMAGE_PROVIDERS}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormDescription>Mock preference</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="generation.preferredVideoProvider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Video provider</FormLabel>
                <SettingsSelect
                  values={VIDEO_PROVIDERS}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormDescription>Mock preference</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="generation.preferredVoiceProvider"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Voice provider</FormLabel>
                <SettingsSelect
                  values={VOICE_PROVIDERS}
                  value={field.value}
                  onChange={field.onChange}
                />
                <FormDescription>Mock preference</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Generation recovery"
        description="Control how TaleMotion should respond when a generated asset fails."
      >
        <div className="grid gap-5 py-4 sm:grid-cols-[1fr_14rem] sm:items-end">
          <FormField
            control={control}
            name="generation.autoRetryFailedGenerations"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div className="space-y-1">
                  <FormLabel>Automatically retry failures</FormLabel>
                  <FormDescription>
                    Retry transient mock generation failures.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Automatically retry failed generations"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="generation.maximumAutomaticRetries"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maximum automatic retries</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(value) => field.onChange(Number(value))}
                  disabled={!autoRetry}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5].map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} {count === 1 ? "retry" : "retries"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>Allowed range: 0–5</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </SettingsSectionCard>
    </div>
  );
}
