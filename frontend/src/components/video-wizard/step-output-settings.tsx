import type { Control } from "react-hook-form";
import { RectangleVertical, RectangleHorizontal, RotateCcw, Sparkles } from "lucide-react";
import {
  FormControl,
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LANGUAGES, NARRATION_STYLES, VISUAL_STYLES } from "@/lib/mock-data";
import type { VideoTemplatePreset } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { WizardFormValues } from "./schema";

interface StepOutputSettingsProps {
  control: Control<WizardFormValues>;
  appliedTemplate?: VideoTemplatePreset | null;
  onResetToTemplateDefaults?: () => void;
  realHistoricalOnly?: boolean;
}

export function StepOutputSettings({
  control,
  appliedTemplate,
  onResetToTemplateDefaults,
  realHistoricalOnly = false,
}: StepOutputSettingsProps) {
  return (
    <div className="grid gap-6">
      {appliedTemplate && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/25 bg-accent/8 px-3.5 py-2.5">
          <p className="flex items-center gap-2 text-sm text-foreground/90">
            <Sparkles className="size-4 shrink-0 text-accent" />
            Based on <span className="font-medium">{appliedTemplate.name}</span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={onResetToTemplateDefaults}>
            <RotateCcw className="size-3.5" />
            Reset to template defaults
          </Button>
        </div>
      )}

      <FormField
        control={control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Title</FormLabel>
            <FormControl>
              <Input placeholder="The Rise of Majapahit" {...field} />
            </FormControl>
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
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={realHistoricalOnly}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(realHistoricalOnly ? ["English"] : LANGUAGES).map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="visualStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visual style</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {VISUAL_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="narrationStyle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Narration style</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {NARRATION_STYLES.map((style) => (
                    <SelectItem key={style} value={style}>
                      {style}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="sceneCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Scene count</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={realHistoricalOnly}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {!realHistoricalOnly && <SelectItem value="auto">Auto</SelectItem>}
                  <SelectItem value="4">4 scenes</SelectItem>
                  {!realHistoricalOnly && <SelectItem value="5">5 scenes</SelectItem>}
                  {!realHistoricalOnly && <SelectItem value="6">6 scenes</SelectItem>}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name="duration"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Duration</FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex gap-3"
              >
                {(realHistoricalOnly
                  ? (["30", "45"] as const)
                  : (["30", "45", "60"] as const)
                ).map((seconds) => (
                  <Label
                    key={seconds}
                    htmlFor={`duration-${seconds}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium",
                      field.value === seconds
                        ? "border-accent bg-accent/8 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <RadioGroupItem value={seconds} id={`duration-${seconds}`} />
                    {seconds}s
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="aspectRatio"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Aspect ratio</FormLabel>
            <FormControl>
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="flex gap-3"
              >
                {(realHistoricalOnly
                  ? [
                      {
                        value: "9:16" as const,
                        label: "9:16 Vertical",
                        icon: RectangleVertical,
                      },
                    ]
                  : [
                  { value: "9:16" as const, label: "9:16 Vertical", icon: RectangleVertical },
                  { value: "16:9" as const, label: "16:9 Horizontal", icon: RectangleHorizontal },
                    ]
                ).map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={`aspect-${option.value}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium",
                      field.value === option.value
                        ? "border-accent bg-accent/8 text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    <RadioGroupItem value={option.value} id={`aspect-${option.value}`} />
                    <option.icon className="size-4" />
                    {option.label}
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="captionsEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Captions</FormLabel>
                <p className="text-xs text-muted-foreground">Burn in synced captions</p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={realHistoricalOnly}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="musicEnabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between gap-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Background music</FormLabel>
                <p className="text-xs text-muted-foreground">Add a mood-matched score</p>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={realHistoricalOnly}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
