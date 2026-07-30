import type { Control } from "react-hook-form";
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

const LANGUAGES = [
  "English",
  "Indonesian",
  "Spanish",
  "French",
  "German",
] as const;

export function GeneralSettingsForm({
  control,
}: {
  control: Control<AppSettings>;
}) {
  return (
    <SettingsSectionCard
      title="Video defaults"
      description="Starting values for new TaleMotion projects. Every value remains editable during creation."
    >
      <div className="grid gap-6 py-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="general.defaultLanguage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default language</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LANGUAGES.map((language) => (
                    <SelectItem key={language} value={language}>
                      {language}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Used for narration and subtitles.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="general.defaultAspectRatio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default aspect ratio</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="9:16">
                    9:16 — Short-form vertical
                  </SelectItem>
                  <SelectItem value="16:9">
                    16:9 — Landscape video
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Sets the initial canvas for scenes and renders.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="general.defaultDuration"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default duration</FormLabel>
              <Select
                value={String(field.value)}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="45">45 seconds</SelectItem>
                  <SelectItem value="60">60 seconds</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Scene timing can still be adjusted per project.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        <FormField
          control={control}
          name="general.captionsEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <FormLabel>Enable captions by default</FormLabel>
                <FormDescription>
                  Prepare subtitle tracks for new videos.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Enable captions by default"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="general.backgroundMusicEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <FormLabel>Enable background music by default</FormLabel>
                <FormDescription>
                  Include a music bed in the initial production plan.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="Enable background music by default"
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </SettingsSectionCard>
  );
}
